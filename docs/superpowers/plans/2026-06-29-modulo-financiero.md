# Módulo Financiero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar tipo de cambio configurable (con recordatorio en header), gastos generales en MXN, socios por auto con reportes de ganancia, método de pago en la venta, y permitir que los vendedores vean/vendan autos de cualquier sucursal.

**Architecture:** Sobre el `Vehiculo`/`Venta` existentes: nuevo `tipoCambioDolar` en `Configuracion`, modelos `Socio` y `GastoGeneral`, enum `MetodoPago`. Las conversiones a MXN usan el TC vigente (función pura). El serializador `vistaVehiculo` se extiende para ocultar el socio al VENDEDOR. Reportes nuevos (ganancias por socio, gastos) solo para ADMIN.

**Tech Stack:** Node + Express + Prisma + PostgreSQL (backend; Jest + Supertest con mocks de Prisma). React + Vite + Axios (frontend; sin runner de tests, se valida con `npm run build`).

## Global Constraints

- **TC global actual:** un único `Configuracion.tipoCambioDolar` (MXN por USD). Las conversiones a MXN usan SIEMPRE el TC vigente.
- **Gastos generales en MXN** con `categoria` + `descripcion` + `monto` + `fecha` + `sucursalId?`.
- **Un socio por auto, obligatorio** (`Vehiculo.socioId`).
- **Permisos:** editar TC / gastos / catálogo de socios = solo ADMIN. Leer socios = ADMIN+ALMACEN. Reportes de socios/ganancias/gastos = solo ADMIN.
- **Método de pago:** enum `MetodoPago { EFECTIVO, TRANSFERENCIA }`, uno por venta.
- **Inventario entre sucursales:** todos los roles ven todas las sucursales; el vendedor puede vender cualquier auto; la venta se registra en la **sucursal del auto**.
- **Visibilidad:** el backend nunca envía `socio`/`socioId` (ni costos/utilidad) a un VENDEDOR — vía `vistaVehiculo`.
- **TC en header:** visible para todos los roles.
- **Reportes de ganancias en USD y MXN.**
- **Tests backend:** mockear `../src/config/prisma`, usar `supertest` + `firmarToken`; los mocks de prisma que disparen auditoría deben incluir `auditoria: { create: jest.fn() }`. Correr con `cd backend && npm test`.

---

### Task 1: Schema, enum, modelos y migración con backfill

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_modulo_financiero/migration.sql`
- Modify: `backend/prisma/seed.js`

**Interfaces:**
- Produces: `Configuracion.tipoCambioDolar Float`; `enum MetodoPago`; `Venta.metodoPago`; modelo `GastoGeneral`; modelo `Socio`; `Vehiculo.socioId Int` (obligatorio, FK).

- [ ] **Step 1: Editar el schema**

En `backend/prisma/schema.prisma`:

1. Añadir el enum (junto a los otros enums):

```prisma
enum MetodoPago {
  EFECTIVO
  TRANSFERENCIA
}
```

2. En `model Configuracion`, añadir antes de `updatedAt`:

```prisma
  tipoCambioDolar      Float    @default(0)
```

3. En `model Venta`, añadir después de `comision`:

```prisma
  metodoPago    MetodoPago @default(EFECTIVO)
```

4. En `model Vehiculo`, añadir el socio (obligatorio) junto a las relaciones:

```prisma
  socioId      Int
  socio        Socio          @relation(fields: [socioId], references: [id])
```

5. En `model Sucursal`, añadir la relación inversa de gastos:

```prisma
  gastosGenerales  GastoGeneral[]
```

6. Al final del archivo, añadir los modelos:

```prisma
model Socio {
  id        Int        @id @default(autoincrement())
  nombre    String
  activo    Boolean    @default(true)
  vehiculos Vehiculo[]
  createdAt DateTime   @default(now())
}

model GastoGeneral {
  id          Int       @id @default(autoincrement())
  fecha       DateTime  @default(now())
  categoria   String
  descripcion String
  monto       Float
  sucursalId  Int?
  sucursal    Sucursal? @relation(fields: [sucursalId], references: [id])
  createdAt   DateTime  @default(now())
}
```

- [ ] **Step 2: Crear la carpeta de migración con timestamp posterior al último**

Run:

```bash
cd backend
ls prisma/migrations
mkdir -p prisma/migrations/20260629220000_modulo_financiero
```

(Si `20260629220000` no es mayor que la última carpeta existente, usar un número mayor.)

- [ ] **Step 3: Escribir el SQL de la migración (con backfill de socio)**

Crear `backend/prisma/migrations/20260629220000_modulo_financiero/migration.sql`:

```sql
-- Tipo de cambio
ALTER TABLE "Configuracion" ADD COLUMN "tipoCambioDolar" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Método de pago
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');
ALTER TABLE "Venta" ADD COLUMN "metodoPago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO';

-- Gastos generales
CREATE TABLE "GastoGeneral" (
  "id" SERIAL NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "categoria" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "sucursalId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GastoGeneral_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GastoGeneral" ADD CONSTRAINT "GastoGeneral_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Socios
CREATE TABLE "Socio" (
  "id" SERIAL NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Socio_pkey" PRIMARY KEY ("id")
);
INSERT INTO "Socio" ("nombre") VALUES ('Sin asignar');

-- socioId: nullable, backfill al socio inicial, luego NOT NULL + FK
ALTER TABLE "Vehiculo" ADD COLUMN "socioId" INTEGER;
UPDATE "Vehiculo" SET "socioId" = (SELECT "id" FROM "Socio" ORDER BY "id" ASC LIMIT 1);
ALTER TABLE "Vehiculo" ALTER COLUMN "socioId" SET NOT NULL;
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_socioId_fkey"
  FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Aplicar la migración y regenerar el client**

Run:

```bash
cd backend
docker compose -f ../docker-compose.yml up -d db
npx prisma migrate deploy
npx prisma generate
```

Expected: "All migrations have been successfully applied." y el client regenera sin error.

- [ ] **Step 5: Seed idempotente del socio inicial**

En `backend/prisma/seed.js`, dentro de `main()` y antes del chequeo del usuario admin, añadir:

```js
  if ((await prisma.socio.count()) === 0) {
    await prisma.socio.create({ data: { nombre: 'Sin asignar' } });
    console.log('Socio inicial creado.');
  }
```

- [ ] **Step 6: Verificar datos y commit**

Run:

```bash
cd backend && node -e "const p=require('./src/config/prisma'); p.vehiculo.findMany({select:{id:true,socioId:true}}).then(v=>{console.log(JSON.stringify(v)); return p.\$disconnect();})"
```

Expected: todos los vehículos tienen `socioId` no nulo.

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed.js
git commit -m "feat: schema modulo financiero (TC, metodoPago, GastoGeneral, Socio + socioId)"
```

---

### Task 2: Función pura `usdAMxn`

**Files:**
- Create: `backend/src/utils/cambio.js`
- Test: `backend/tests/cambio.test.js`

**Interfaces:**
- Produces: `usdAMxn(usd, tc) -> number` = `usd * tc` (0 si alguno no es número válido).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/cambio.test.js`:

```js
const { usdAMxn } = require('../src/utils/cambio');

describe('usdAMxn', () => {
  test('convierte usando el tipo de cambio', () => {
    expect(usdAMxn(100, 17.5)).toBe(1750);
  });
  test('tc 0 => 0', () => {
    expect(usdAMxn(100, 0)).toBe(0);
  });
  test('valores no numéricos => 0', () => {
    expect(usdAMxn(undefined, 17)).toBe(0);
    expect(usdAMxn(100, null)).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/cambio.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crear `backend/src/utils/cambio.js`:

```js
// Convierte un monto en USD a MXN usando el tipo de cambio (pesos por dólar).
function usdAMxn(usd, tc) {
  return (Number(usd) || 0) * (Number(tc) || 0);
}

module.exports = { usdAMxn };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/cambio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/cambio.js backend/tests/cambio.test.js
git commit -m "feat: funcion pura usdAMxn"
```

---

### Task 3: `vistaVehiculo` oculta el socio al VENDEDOR

**Files:**
- Modify: `backend/src/utils/costos.js`
- Test: `backend/tests/vistaVehiculo.test.js`

**Interfaces:**
- Consumes/Produces: `vistaVehiculo(v, rol)` — además de costos/utilidad, ahora elimina `socio` y `socioId` cuando `rol === 'VENDEDOR'`; los conserva para ADMIN/ALMACEN.

- [ ] **Step 1: Añadir el test que falla**

En `backend/tests/vistaVehiculo.test.js`, añadir al objeto `v` la propiedad `socioId: 4, socio: { id: 4, nombre: 'Juan' },` y añadir estos casos dentro del `describe`:

```js
  test('ADMIN conserva el socio', () => {
    const r = vistaVehiculo(v, 'ADMIN');
    expect(r.socio).toEqual({ id: 4, nombre: 'Juan' });
    expect(r.socioId).toBe(4);
  });
  test('VENDEDOR no ve el socio', () => {
    const r = vistaVehiculo(v, 'VENDEDOR');
    expect(r.socio).toBeUndefined();
    expect(r.socioId).toBeUndefined();
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/vistaVehiculo.test.js`
Expected: FAIL — VENDEDOR aún recibe `socio`/`socioId`.

- [ ] **Step 3: Implementar**

En `backend/src/utils/costos.js`, dentro de `vistaVehiculo`, en la rama `if (rol === 'VENDEDOR')`, después de `delete base.gastos;` añadir:

```js
    delete base.socio;
    delete base.socioId;
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/vistaVehiculo.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/costos.js backend/tests/vistaVehiculo.test.js
git commit -m "feat: ocultar socio del vehiculo al VENDEDOR"
```

---

### Task 4: Tipo de cambio en Configuración (backend)

**Files:**
- Modify: `backend/src/controllers/configuracion.controller.js`
- Test: `backend/tests/configuracion.test.js`

**Interfaces:**
- Produces: `PUT /api/configuracion` acepta `tipoCambioDolar` (número >= 0). `GET /api/configuracion` lo devuelve.

- [ ] **Step 1: Añadir el test que falla**

En `backend/tests/configuracion.test.js`, añadir un test (usa el patrón del archivo; si mockea prisma, asegurar `configuracion.upsert`):

```js
  test('PUT actualiza el tipo de cambio (ADMIN)', async () => {
    prisma.configuracion.upsert.mockResolvedValue({ id: 1, tipoCambioDolar: 18.5 });
    const res = await request(app).put('/api/configuracion')
      .set('Authorization', `Bearer ${tokenAdmin}`).send({ tipoCambioDolar: 18.5 });
    expect(res.status).toBe(200);
    expect(prisma.configuracion.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ tipoCambioDolar: 18.5 }),
    }));
  });

  test('PUT rechaza tipo de cambio negativo', async () => {
    const res = await request(app).put('/api/configuracion')
      .set('Authorization', `Bearer ${tokenAdmin}`).send({ tipoCambioDolar: -1 });
    expect(res.status).toBe(400);
  });
```

> Si `configuracion.test.js` no define `tokenAdmin`/mock de prisma con `configuracion.upsert`, revisar su encabezado y reutilizar el patrón existente (mock + `firmarToken({ id:1, rol:'ADMIN', sucursalId:null })`).

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/configuracion.test.js`
Expected: FAIL — `tipoCambioDolar` no se guarda / no se valida.

- [ ] **Step 3: Implementar en el controller**

En `backend/src/controllers/configuracion.controller.js`, dentro de `actualizar`, antes del `upsert`, añadir:

```js
    if (req.body.tipoCambioDolar !== undefined) {
      const tc = Number(req.body.tipoCambioDolar);
      if (!Number.isFinite(tc) || tc < 0) throw new ApiError(400, 'tipoCambioDolar debe ser un número >= 0');
      data.tipoCambioDolar = tc;
    }
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/configuracion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/configuracion.controller.js backend/tests/configuracion.test.js
git commit -m "feat: tipo de cambio del dolar en configuracion"
```

---

### Task 5: API de socios

**Files:**
- Create: `backend/src/controllers/socios.controller.js`
- Create: `backend/src/routes/socios.routes.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/socios.test.js`

**Interfaces:**
- Produces:
  - `GET /api/socios` (ADMIN, ALMACEN) → `Socio[]`.
  - `POST /api/socios` (ADMIN) body `{ nombre }` → socio creado.
  - `PUT /api/socios/:id` (ADMIN) body `{ nombre }`.
  - `PATCH /api/socios/:id/estado` (ADMIN) body `{ activo }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/socios.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  socio: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Socios', () => {
  test('GET permitido a ALMACEN', async () => {
    prisma.socio.findMany.mockResolvedValue([{ id: 1, nombre: 'Sin asignar', activo: true }]);
    const res = await request(app).get('/api/socios').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
  test('GET prohibido a VENDEDOR', async () => {
    const res = await request(app).get('/api/socios').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
  test('POST crea socio (ADMIN)', async () => {
    prisma.socio.create.mockResolvedValue({ id: 2, nombre: 'Juan', activo: true });
    const res = await request(app).post('/api/socios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: 'Juan' });
    expect(res.status).toBe(201);
    expect(prisma.socio.create).toHaveBeenCalledWith({ data: { nombre: 'Juan' } });
  });
  test('POST rechaza nombre vacío', async () => {
    const res = await request(app).post('/api/socios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: '' });
    expect(res.status).toBe(400);
  });
  test('POST prohibido a ALMACEN', async () => {
    const res = await request(app).post('/api/socios').set('Authorization', `Bearer ${tokenAlmacen}`).send({ nombre: 'X' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/socios.test.js`
Expected: FAIL — rutas inexistentes (404).

- [ ] **Step 3: Implementar el controller**

Crear `backend/src/controllers/socios.controller.js`:

```js
const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');

async function listar(req, res, next) {
  try {
    res.json(await prisma.socio.findMany({ orderBy: { nombre: 'asc' } }));
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) throw new ApiError(400, 'El nombre es obligatorio');
    const socio = await prisma.socio.create({ data: { nombre } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_SOCIO', entidad: 'Socio', entidadId: socio.id, ip: req.ip });
    res.status(201).json(socio);
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) throw new ApiError(400, 'El nombre es obligatorio');
    const socio = await prisma.socio.update({ where: { id }, data: { nombre } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_SOCIO', entidad: 'Socio', entidadId: id, ip: req.ip });
    res.json(socio);
  } catch (e) { next(e); }
}

async function cambiarEstado(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (typeof req.body.activo !== 'boolean') throw new ApiError(400, 'activo debe ser booleano');
    const socio = await prisma.socio.update({ where: { id }, data: { activo: req.body.activo } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'ESTADO_SOCIO', entidad: 'Socio', entidadId: id, ip: req.ip });
    res.json(socio);
  } catch (e) { next(e); }
}

module.exports = { listar, crear, actualizar, cambiarEstado };
```

- [ ] **Step 4: Implementar rutas y montarlas**

Crear `backend/src/routes/socios.routes.js`:

```js
const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/socios.controller');

const router = Router();
router.use(auth);
router.get('/', rbac('ADMIN', 'ALMACEN'), ctrl.listar);
router.post('/', rbac('ADMIN'), ctrl.crear);
router.put('/:id', rbac('ADMIN'), ctrl.actualizar);
router.patch('/:id/estado', rbac('ADMIN'), ctrl.cambiarEstado);
module.exports = router;
```

En `backend/src/app.js`, añadir el require y el `app.use`:

```js
const sociosRoutes = require('./routes/socios.routes');
```

```js
  app.use('/api/socios', sociosRoutes);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/socios.test.js`
Expected: PASS (los 5 casos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/socios.controller.js backend/src/routes/socios.routes.js backend/src/app.js backend/tests/socios.test.js
git commit -m "feat: API de socios (CRUD ADMIN, lectura ALMACEN)"
```

---

### Task 6: Vehículos — socioId, filtros y ver todas las sucursales

**Files:**
- Modify: `backend/src/controllers/vehiculos.controller.js`
- Test: `backend/tests/vehiculos.inventario.test.js`

**Interfaces:**
- Produces:
  - `datosBase` mapea `socioId` (Number).
  - `crear` valida `socioId` presente.
  - `listar`: todos los roles ven todas las sucursales (filtro opcional `?sucursalId`); soporta `?socioId`; incluye `socio` en el resultado.

- [ ] **Step 1: Añadir tests que fallan**

En `backend/tests/vehiculos.inventario.test.js`, añadir a `fila` la propiedad `socioId: 1, socio: { id: 1, nombre: 'Sin asignar' },` y añadir casos:

```js
  test('VENDEDOR ve todas las sucursales (no se fuerza la suya)', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?inventario=venta').set('Authorization', `Bearer ${tokenVend}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.sucursalId).toBeUndefined();
  });
  test('filtro ?socioId agrega el filtro de socio', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?socioId=5').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.socioId).toBe(5);
  });
  test('ADMIN recibe el socio del vehículo', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.body[0].socio).toEqual({ id: 1, nombre: 'Sin asignar' });
  });
  test('VENDEDOR no recibe el socio', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.body[0].socio).toBeUndefined();
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/vehiculos.inventario.test.js`
Expected: FAIL — se fuerza la sucursal del vendedor; no hay filtro de socio; el include no trae socio.

- [ ] **Step 3: Implementar en el controller**

En `backend/src/controllers/vehiculos.controller.js`:

1. En `datosBase`, antes del `return`, añadir:

```js
  if (body.socioId !== undefined) data.socioId = Number(body.socioId);
```

2. En `crear`, después de validar `anio/marca/modelo`, añadir validación de socio:

```js
    if (!req.body.socioId) throw new ApiError(400, 'El socio es obligatorio');
```

3. En `listar`, reemplazar la resolución de sucursal por filtro abierto y añadir socio:

Reemplazar:
```js
    const where = {};
    const sucursalId = resolverSucursalLectura(req);
    if (sucursalId !== undefined) where.sucursalId = sucursalId;
```
por:
```js
    const where = {};
    if (req.query.sucursalId) where.sucursalId = Number(req.query.sucursalId);
    if (req.query.socioId) where.socioId = Number(req.query.socioId);
```

Y en el `include` del `findMany` de `listar`, añadir `socio: { select: { id: true, nombre: true } }`:

```js
    const lista = await prisma.vehiculo.findMany({ where, orderBy: { fechaIngreso: 'desc' }, include: { sucursal: { select: { id: true, nombre: true } }, fotos: { orderBy: { orden: 'asc' }, take: 1 }, gastos: true, venta: { select: { fecha: true } }, socio: { select: { id: true, nombre: true } } } });
```

4. En `obtener` y en `INCLUDE_DETALLE`, añadir `socio: { select: { id: true, nombre: true } }` para que la ficha traiga el socio. Cambiar la constante:

```js
const INCLUDE_DETALLE = { fotos: { orderBy: { orden: 'asc' } }, gastos: true, venta: { select: { fecha: true } }, socio: { select: { id: true, nombre: true } } };
```

Y en `obtener`, el include pasa a:

```js
    const v = await prisma.vehiculo.findUnique({ where: { id: Number(req.params.id) }, include: { fotos: { orderBy: { orden: 'asc' } }, sucursal: true, gastos: { orderBy: { createdAt: 'asc' } }, venta: { select: { fecha: true } }, socio: { select: { id: true, nombre: true } } } });
```

> Nota: `resolverSucursalLectura` ya no se usa en `listar`; déjalo importado solo si otra función lo usa (en este controller no), en cuyo caso quita el import para evitar lint. Verifica los usos antes de quitarlo.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/vehiculos.inventario.test.js tests/vehiculos.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/vehiculos.controller.js backend/tests/vehiculos.inventario.test.js
git commit -m "feat: socioId en vehiculos, filtro por socio y vista de todas las sucursales"
```

---

### Task 7: API de gastos generales + reporte de gastos

**Files:**
- Create: `backend/src/controllers/gastos.controller.js`
- Create: `backend/src/routes/gastos.routes.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/gastos.test.js`

**Interfaces:**
- Produces (todo solo ADMIN):
  - `GET /api/gastos?desde&hasta&sucursalId` → `{ gastos, total, porCategoria }`.
  - `POST /api/gastos` body `{ fecha?, categoria, descripcion, monto, sucursalId? }`.
  - `DELETE /api/gastos/:id`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/gastos.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  gastoGeneral: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });

beforeEach(() => jest.clearAllMocks());

describe('Gastos generales', () => {
  test('GET devuelve total y desglose por categoría (ADMIN)', async () => {
    prisma.gastoGeneral.findMany.mockResolvedValue([
      { id: 1, categoria: 'Insumos', descripcion: 'Aceite', monto: 500, fecha: new Date() },
      { id: 2, categoria: 'Insumos', descripcion: 'Filtros', monto: 300, fecha: new Date() },
      { id: 3, categoria: 'Renta', descripcion: 'Local', monto: 8000, fecha: new Date() },
    ]);
    const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8800);
    expect(res.body.porCategoria.Insumos).toBe(800);
    expect(res.body.porCategoria.Renta).toBe(8000);
  });
  test('POST crea gasto (ADMIN)', async () => {
    prisma.gastoGeneral.create.mockResolvedValue({ id: 9, categoria: 'Insumos', descripcion: 'Aceite', monto: 500 });
    const res = await request(app).post('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ categoria: 'Insumos', descripcion: 'Aceite', monto: 500 });
    expect(res.status).toBe(201);
  });
  test('POST rechaza campos vacíos', async () => {
    const res = await request(app).post('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`).send({ categoria: '', descripcion: '', monto: 1 });
    expect(res.status).toBe(400);
  });
  test('GET prohibido a ALMACEN', async () => {
    const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/gastos.test.js`
Expected: FAIL — rutas inexistentes.

- [ ] **Step 3: Implementar el controller**

Crear `backend/src/controllers/gastos.controller.js`:

```js
const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');

async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.sucursalId) where.sucursalId = Number(req.query.sucursalId);
    if (req.query.desde || req.query.hasta) {
      where.fecha = {};
      if (req.query.desde) where.fecha.gte = new Date(req.query.desde);
      if (req.query.hasta) where.fecha.lte = new Date(req.query.hasta);
    }
    const gastos = await prisma.gastoGeneral.findMany({ where, orderBy: { fecha: 'desc' } });
    const total = gastos.reduce((a, g) => a + g.monto, 0);
    const porCategoria = gastos.reduce((a, g) => { a[g.categoria] = (a[g.categoria] || 0) + g.monto; return a; }, {});
    res.json({ gastos, total, porCategoria });
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const categoria = (req.body.categoria || '').trim();
    const descripcion = (req.body.descripcion || '').trim();
    const monto = Number(req.body.monto);
    if (!categoria || !descripcion) throw new ApiError(400, 'categoria y descripcion son obligatorias');
    if (!Number.isFinite(monto) || monto < 0) throw new ApiError(400, 'monto debe ser un número >= 0');
    const data = { categoria, descripcion, monto };
    if (req.body.sucursalId) data.sucursalId = Number(req.body.sucursalId);
    if (req.body.fecha) data.fecha = new Date(req.body.fecha);
    const gasto = await prisma.gastoGeneral.create({ data });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_GASTO', entidad: 'GastoGeneral', entidadId: gasto.id, datos: { categoria, monto }, ip: req.ip });
    res.status(201).json(gasto);
  } catch (e) { next(e); }
}

async function eliminar(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.gastoGeneral.delete({ where: { id } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'ELIMINAR_GASTO', entidad: 'GastoGeneral', entidadId: id, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

module.exports = { listar, crear, eliminar };
```

- [ ] **Step 4: Implementar rutas y montarlas**

Crear `backend/src/routes/gastos.routes.js`:

```js
const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/gastos.controller');

const router = Router();
router.use(auth);
router.get('/', rbac('ADMIN'), ctrl.listar);
router.post('/', rbac('ADMIN'), ctrl.crear);
router.delete('/:id', rbac('ADMIN'), ctrl.eliminar);
module.exports = router;
```

En `backend/src/app.js`, añadir:

```js
const gastosRoutes = require('./routes/gastos.routes');
```

```js
  app.use('/api/gastos', gastosRoutes);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/gastos.test.js`
Expected: PASS (los 4 casos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/gastos.controller.js backend/src/routes/gastos.routes.js backend/src/app.js backend/tests/gastos.test.js
git commit -m "feat: API de gastos generales con total y desglose por categoria"
```

---

### Task 8: Venta — método de pago y venta de cualquier sucursal

**Files:**
- Modify: `backend/src/services/ventas.service.js`
- Modify: `backend/src/controllers/ventas.controller.js`
- Test: `backend/tests/ventas.service.test.js`
- Test: `backend/tests/ventas.endpoint.test.js`

**Interfaces:**
- Produces: `crearVenta({ vehiculoId, clienteId, empleadoId, total, observaciones, metodoPago })` — deriva la sucursal del vehículo, ya no recibe `sucursalId`, no valida pertenencia de sucursal, y guarda `metodoPago` (default EFECTIVO).

- [ ] **Step 1: Actualizar el test del service**

En `backend/tests/ventas.service.test.js`:

1. En el primer test ("genera folio…"), el vehículo del mock debe incluir `precioVenta` (ya lo tiene en otro test). Cambiar las llamadas `crearVenta({ sucursalId: 2, vehiculoId: 10, ... })` para quitar `sucursalId` (ahora se deriva del vehículo). El mock de `tx.vehiculo.findUnique` ya devuelve `sucursalId: 2`, así que la venta usará esa.

2. Añadir un test nuevo:

```js
  test('guarda metodoPago y usa la sucursal del vehículo', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 7, estado: 'DISPONIBLE', precioVenta: 9000 });
    tx.sucursal.update.mockResolvedValue({ id: 7, serieFolio: 'B', consecutivoFolio: 3 });
    tx.venta.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));
    const venta = await crearVenta({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 9000, metodoPago: 'TRANSFERENCIA' });
    expect(venta.sucursalId).toBe(7);
    expect(venta.metodoPago).toBe('TRANSFERENCIA');
    expect(tx.sucursal.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
  });
```

3. Eliminar el test "rechaza vehículo de otra sucursal" (ya no aplica: se puede vender cualquier sucursal).

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/ventas.service.test.js`
Expected: FAIL — `crearVenta` aún requiere `sucursalId` y no guarda `metodoPago`.

- [ ] **Step 3: Implementar el service**

Reemplazar el cuerpo de `crearVenta` en `backend/src/services/ventas.service.js`:

```js
async function crearVenta({ vehiculoId, clienteId, empleadoId, total, observaciones, metodoPago }) {
  return prisma.$transaction(async (tx) => {
    const vehiculo = await tx.vehiculo.findUnique({ where: { id: Number(vehiculoId) } });
    if (!vehiculo) throw new ApiError(404, 'Vehículo no encontrado');
    if (vehiculo.estado === 'VENDIDO') throw new ApiError(409, 'El vehículo ya fue vendido');

    const sucursalId = vehiculo.sucursalId;
    const sucursal = await tx.sucursal.update({ where: { id: sucursalId }, data: { consecutivoFolio: { increment: 1 } } });
    const folio = formatearFolio(sucursal.serieFolio, sucursal.consecutivoFolio);

    const rangos = await tx.rangoComision.findMany();
    const comision = calcularComision(vehiculo.precioVenta, rangos);
    const metodo = metodoPago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO';

    const venta = await tx.venta.create({
      data: {
        folio, sucursalId, vehiculoId: Number(vehiculoId), clienteId: Number(clienteId), empleadoId: Number(empleadoId),
        total: Number(total), comision, metodoPago: metodo, observaciones: observaciones && observaciones.trim() ? observaciones : 'SIN GARANTÍA',
      },
    });
    await tx.vehiculo.update({ where: { id: Number(vehiculoId) }, data: { estado: 'VENDIDO' } });
    return venta;
  });
}
```

- [ ] **Step 4: Ajustar el controller**

En `backend/src/controllers/ventas.controller.js`, en `crear`, reemplazar la resolución de sucursal y la llamada al service. El nuevo cuerpo de `crear`:

```js
async function crear(req, res, next) {
  try {
    const { vehiculoId, clienteId, total } = req.body;
    if (!vehiculoId || !clienteId || total == null) throw new ApiError(400, 'vehiculoId, clienteId y total son obligatorios');
    let empleadoId = req.body.empleadoId;
    if (!empleadoId && req.usuario.rol === 'VENDEDOR') {
      const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
      empleadoId = u && u.empleadoId;
    }
    if (!empleadoId) throw new ApiError(400, 'empleadoId es obligatorio');
    const venta = await crearVenta({ vehiculoId, clienteId, empleadoId, total, observaciones: req.body.observaciones, metodoPago: req.body.metodoPago });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_VENTA', entidad: 'Venta', entidadId: venta.id, datos: { folio: venta.folio, total: venta.total }, ip: req.ip });
    res.status(201).json(venta);
  } catch (e) { next(e); }
}
```

En `contratoBorrador` (mismo archivo), derivar la sucursal del vehículo en vez de exigir `sucursalId`. Reemplazar el inicio de la función:

```js
async function contratoBorrador(req, res, next) {
  try {
    const vehiculo = req.body.vehiculoId ? await prisma.vehiculo.findUnique({ where: { id: Number(req.body.vehiculoId) } }) : null;
    const sucursalId = vehiculo ? vehiculo.sucursalId : (req.body.sucursalId ? Number(req.body.sucursalId) : null);
    if (!sucursalId) throw new ApiError(400, 'Seleccione un vehículo o una sucursal');
    const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!sucursal) throw new ApiError(404, 'Sucursal no encontrada');
```

(Conservar el resto de `contratoBorrador` igual: lee `cliente`, genera el PDF con `sucursal`, `vehiculo`, etc. Quitar la línea previa que usaba `resolverSucursalEscritura` y la que volvía a buscar el vehículo.)

> Verifica que `resolverSucursalEscritura` ya no se use en este archivo; si queda sin usar, quita el import para evitar lint.

- [ ] **Step 5: Actualizar el test de endpoint de ventas**

En `backend/tests/ventas.endpoint.test.js`, revisar que ninguna aserción dependa de enviar `sucursalId` para el VENDEDOR ni de la validación de pertenencia. Si algún test enviaba `sucursalId` y esperaba comportamiento de sucursal forzada, ajustarlo: el VENDEDOR ahora puede vender cualquier vehículo y la venta toma la sucursal del vehículo. (Ejecuta el archivo y corrige las aserciones que fallen según el nuevo contrato.)

- [ ] **Step 6: Correr y verificar que pasan**

Run: `cd backend && npx jest tests/ventas.service.test.js tests/ventas.endpoint.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/ventas.service.js backend/src/controllers/ventas.controller.js backend/tests/ventas.service.test.js backend/tests/ventas.endpoint.test.js
git commit -m "feat: metodo de pago en venta y venta de auto de cualquier sucursal"
```

---

### Task 9: Reporte de ventas — desglose por método de pago

**Files:**
- Modify: `backend/src/services/reportes.service.js`
- Test: `backend/tests/reportes.test.js`

**Interfaces:**
- Produces: `reportes.ventas` añade a `totales` los campos `efectivo` y `transferencia` (suma de `total` por método). Las filas conservan `metodoPago`.

- [ ] **Step 1: Añadir el test que falla**

En `backend/tests/reportes.test.js`, dentro del primer test (`calcula utilidad`), añadir `metodoPago` a cada venta del mock (`metodoPago: 'EFECTIVO'` en la 1, `metodoPago: 'TRANSFERENCIA'` en la 2) y añadir aserciones:

```js
    expect(res.body.totales.efectivo).toBe(150000);
    expect(res.body.totales.transferencia).toBe(80000);
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/reportes.test.js`
Expected: FAIL — `totales.efectivo`/`transferencia` indefinidos.

- [ ] **Step 3: Implementar**

En `backend/src/services/reportes.service.js`, en el `reduce` de `totales` de la función `ventas`, añadir dos acumuladores:

```js
    efectivo: a.efectivo + (v.metodoPago === 'EFECTIVO' ? v.total : 0),
    transferencia: a.transferencia + (v.metodoPago === 'TRANSFERENCIA' ? v.total : 0),
```

y en el objeto inicial del `reduce` añadir `efectivo: 0, transferencia: 0`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/reportes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reportes.service.js backend/tests/reportes.test.js
git commit -m "feat: desglose por metodo de pago en reporte de ventas"
```

---

### Task 10: Reporte de ganancias por socio (USD/MXN, por mes)

**Files:**
- Modify: `backend/src/services/reportes.service.js`
- Modify: `backend/src/controllers/reportes.controller.js`
- Modify: `backend/src/routes/reportes.routes.js`
- Test: `backend/tests/reportes.socios.test.js`

**Interfaces:**
- Consumes: `costoTotal` (utils/costos), `usdAMxn` (utils/cambio).
- Produces: `reportes.socios({ desde, hasta }) -> { tipoCambio, socios: [{ socioId, nombre, autos: [{ id, vehiculo, utilidadUsd }], totalUsd, totalMxn, cantidad }], porMes: [{ mes, utilidadUsd }], totalGeneralUsd, totalGeneralMxn }` y `GET /api/reportes/socios?desde&hasta` (ADMIN).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/reportes.socios.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  vehiculo: { findMany: jest.fn() },
  configuracion: { findUnique: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Reporte de ganancias por socio', () => {
  test('agrupa por socio, suma utilidad y convierte a MXN', async () => {
    prisma.configuracion.findUnique.mockResolvedValue({ id: 1, tipoCambioDolar: 20 });
    prisma.vehiculo.findMany.mockResolvedValue([
      { id: 1, anio: 2020, marca: 'Nissan', modelo: 'Versa', precioVenta: 9000, precioCompra: 5000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [], socioId: 1, socio: { id: 1, nombre: 'Juan' }, venta: { fecha: new Date('2026-06-10') } },
      { id: 2, anio: 2021, marca: 'Kia', modelo: 'Rio', precioVenta: 12000, precioCompra: 8000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [{ monto: 500 }], socioId: 1, socio: { id: 1, nombre: 'Juan' }, venta: { fecha: new Date('2026-06-15') } },
      { id: 3, anio: 2019, marca: 'VW', modelo: 'Jetta', precioVenta: 7000, precioCompra: 6000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [], socioId: 2, socio: { id: 2, nombre: 'Ana' }, venta: { fecha: new Date('2026-06-20') } },
    ]);
    const res = await request(app).get('/api/reportes/socios?desde=2026-06-01&hasta=2026-06-30').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.tipoCambio).toBe(20);
    const juan = res.body.socios.find((s) => s.socioId === 1);
    // auto1: 9000-5000=4000 ; auto2: 12000-8500=3500 => 7500 USD
    expect(juan.totalUsd).toBe(7500);
    expect(juan.totalMxn).toBe(150000); // 7500 * 20
    expect(juan.cantidad).toBe(2);
    // general: 7500 + (7000-6000)=1000 => 8500 USD
    expect(res.body.totalGeneralUsd).toBe(8500);
    expect(res.body.totalGeneralMxn).toBe(170000);
  });

  test('prohibido a VENDEDOR', async () => {
    const res = await request(app).get('/api/reportes/socios').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/reportes.socios.test.js`
Expected: FAIL — ruta inexistente.

- [ ] **Step 3: Implementar el service**

En `backend/src/services/reportes.service.js`, añadir el require de cambio arriba:

```js
const { usdAMxn } = require('../utils/cambio');
```

y añadir la función antes del `module.exports`:

```js
async function socios({ desde, hasta }) {
  const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
  const tipoCambio = config ? config.tipoCambioDolar || 0 : 0;
  const where = { estado: 'VENDIDO', venta: { isNot: null } };
  if (desde || hasta) {
    where.venta = { ...where.venta };
    where.venta.fecha = {};
    if (desde) where.venta.fecha.gte = new Date(desde);
    if (hasta) where.venta.fecha.lte = new Date(hasta);
  }
  const vehiculos = await prisma.vehiculo.findMany({
    where,
    include: { gastos: true, socio: { select: { id: true, nombre: true } }, venta: { select: { fecha: true } } },
  });
  const porSocio = new Map();
  const porMesMap = new Map();
  for (const v of vehiculos) {
    const utilidadUsd = (v.precioVenta || 0) - costoTotal(v);
    const sid = v.socioId;
    if (!porSocio.has(sid)) porSocio.set(sid, { socioId: sid, nombre: v.socio?.nombre || '', autos: [], totalUsd: 0, cantidad: 0 });
    const g = porSocio.get(sid);
    g.autos.push({ id: v.id, vehiculo: `${v.anio} ${v.marca} ${v.modelo}`, utilidadUsd });
    g.totalUsd += utilidadUsd;
    g.cantidad += 1;
    if (v.venta?.fecha) {
      const f = new Date(v.venta.fecha);
      const mes = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      porMesMap.set(mes, (porMesMap.get(mes) || 0) + utilidadUsd);
    }
  }
  const socios = [...porSocio.values()].map((s) => ({ ...s, totalMxn: usdAMxn(s.totalUsd, tipoCambio) }));
  const totalGeneralUsd = socios.reduce((a, s) => a + s.totalUsd, 0);
  const porMes = [...porMesMap.entries()].sort().map(([mes, utilidadUsd]) => ({ mes, utilidadUsd, utilidadMxn: usdAMxn(utilidadUsd, tipoCambio) }));
  return { tipoCambio, socios, porMes, totalGeneralUsd, totalGeneralMxn: usdAMxn(totalGeneralUsd, tipoCambio) };
}
```

Actualizar el `module.exports` para incluir `socios`:

```js
module.exports = { ventas, inventario, comisiones, socios };
```

- [ ] **Step 4: Implementar controller y ruta**

En `backend/src/controllers/reportes.controller.js`, añadir antes del `module.exports`:

```js
async function socios(req, res, next) {
  try {
    res.json(await reportes.socios({ desde: req.query.desde, hasta: req.query.hasta }));
  } catch (e) { next(e); }
}
```

y actualizar el export:

```js
module.exports = { ventas, inventario, comisiones, socios };
```

En `backend/src/routes/reportes.routes.js`, añadir:

```js
router.get('/socios', rbac('ADMIN'), ctrl.socios);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/reportes.socios.test.js`
Expected: PASS (ambos casos).

- [ ] **Step 6: Correr toda la suite backend**

Run: `cd backend && npm test`
Expected: PASS (todas las suites).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/reportes.service.js backend/src/controllers/reportes.controller.js backend/src/routes/reportes.routes.js backend/tests/reportes.socios.test.js
git commit -m "feat: reporte de ganancias por socio (USD/MXN y por mes)"
```

---

### Task 11: Frontend — Header con tipo de cambio y edición en Configuración

**Files:**
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/pages/Configuracion.jsx`

- [ ] **Step 1: Mostrar el TC en el header del Layout**

En `frontend/src/components/Layout.jsx`, importar hooks y api arriba:

```jsx
import { useEffect, useState } from 'react';
import api from '../api/client';
```

Dentro del componente `Layout`, antes del `return`, cargar el TC:

```jsx
  const [tc, setTc] = useState(null);
  useEffect(() => { api.get('/configuracion').then((r) => setTc(r.data.tipoCambioDolar)).catch(() => {}); }, []);
```

Y dentro de `<div className="main">`, antes de `<div className="content">`, añadir una topbar:

```jsx
        <div className="topbar">
          <div />
          <div className="tc-header">Dólar: {tc ? `$${Number(tc).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN` : 'sin configurar'}</div>
        </div>
```

- [ ] **Step 2: Editar el TC en Configuración**

En `frontend/src/pages/Configuracion.jsx`, añadir `tipoCambioDolar` al estado del primer formulario. En el `useState` inicial:

```jsx
  const [form, setForm] = useState({ diasAntiguedadAlerta: 60, terminosContrato: '', tipoCambioDolar: 0 });
```

En el `useEffect` que carga `/configuracion`, incluir el campo:

```jsx
  useEffect(() => { api.get('/configuracion').then((r) => setForm({ diasAntiguedadAlerta: r.data.diasAntiguedadAlerta, terminosContrato: r.data.terminosContrato || '', tipoCambioDolar: r.data.tipoCambioDolar || 0 })); }, []);
```

En `guardar`, incluir el campo en el PUT:

```jsx
      await api.put('/configuracion', { diasAntiguedadAlerta: Number(form.diasAntiguedadAlerta), terminosContrato: form.terminosContrato, tipoCambioDolar: Number(form.tipoCambioDolar) });
```

Y añadir el input en el formulario (antes del bloque de términos):

```jsx
          <div>
            <label>Tipo de cambio del dólar (MXN por USD)</label>
            <input type="number" step="0.01" min="0" value={form.tipoCambioDolar} onChange={(e) => set('tipoCambioDolar', e.target.value)} style={{ maxWidth: 160 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Se usa para convertir las ganancias en dólares a pesos y se muestra en el encabezado.</p>
          </div>
```

- [ ] **Step 3: Estilo de la barra (opcional, mínimo)**

En `frontend/src/ui/ui.css`, añadir al final:

```css
.tc-header { font-size: 14px; font-weight: 700; color: var(--primary); }
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Layout.jsx frontend/src/pages/Configuracion.jsx frontend/src/ui/ui.css
git commit -m "feat(ui): tipo de cambio en header y editable en configuracion"
```

---

### Task 12: Frontend — Página de socios y socio en inventario de compra

**Files:**
- Create: `frontend/src/pages/Socios.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/pages/Compra.jsx`

- [ ] **Step 1: Crear la página de socios (ADMIN)**

Crear `frontend/src/pages/Socios.jsx`:

```jsx
import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Socios() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  async function cargar() { const { data } = await api.get('/socios'); setLista(data); }
  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault(); setError('');
    try { await api.post('/socios', { nombre }); setNombre(''); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al crear'); }
  }
  async function cambiarEstado(s) { await api.patch(`/socios/${s.id}/estado`, { activo: !s.activo }); cargar(); }

  return (
    <div>
      <h1>Socios</h1>
      <div className="card">
        <h3>Nuevo socio</h3>
        <form onSubmit={crear} className="row">
          <input placeholder="Nombre del socio" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <button className="btn btn-primary" type="submit">Agregar</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
      <table>
        <thead><tr><th>Socio</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((s) => (
          <tr key={s.id}>
            <td>{s.nombre}</td>
            <td>{s.activo ? 'Activo' : 'Inactivo'}</td>
            <td><button className="btn btn-sm" onClick={() => cambiarEstado(s)}>{s.activo ? 'Desactivar' : 'Activar'}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Ruta y menú**

En `frontend/src/App.jsx`, añadir el import y la ruta (solo ADMIN):

```jsx
import Socios from './pages/Socios';
```

```jsx
      <Route path="/socios" element={<Privada><RequireRol roles={SOLO_ADMIN}><Socios /></RequireRol></Privada>} />
```

En `frontend/src/components/Layout.jsx`, en el grupo `'Administración'`, añadir:

```jsx
    { to: '/socios', label: 'Socios', roles: ['ADMIN'] },
```

- [ ] **Step 3: Selector y filtro de socio en inventario de compra**

En `frontend/src/pages/Compra.jsx`:

1. Añadir `socioId: ''` al objeto `VACIO`.
2. Cargar socios y estado de filtro. Junto a los `useState`:

```jsx
  const [socios, setSocios] = useState([]);
  const [filtroSocio, setFiltroSocio] = useState('');
  useEffect(() => { api.get('/socios').then((r) => setSocios(r.data)).catch(() => {}); }, []);
```

3. En `cargar`, aplicar el filtro de socio:

```jsx
  async function cargar() {
    const p = new URLSearchParams();
    p.set('inventario', 'compra');
    if (filtroSocio) p.set('socioId', filtroSocio);
    const { data } = await api.get(`/vehiculos?${p.toString()}`);
    setLista(data);
  }
```

y cambiar el `useEffect` de carga a `useEffect(() => { cargar(); }, [filtroSocio]);`.

4. Añadir el selector de filtro arriba (junto al botón "+ Registrar auto"):

```jsx
        <select value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todos los socios</option>
          {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
```

5. En el formulario, añadir el selector de socio (obligatorio), por ejemplo junto a Sucursal:

```jsx
              <div style={{ flex: 1 }}><label>Socio</label>
                <select value={form.socioId || ''} onChange={(e) => set('socioId', e.target.value)} required>
                  <option value="">Seleccione socio…</option>
                  {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
```

6. En la tabla de compra, añadir una columna "Socio" mostrando `v.socio?.nombre`.

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Socios.jsx frontend/src/App.jsx frontend/src/components/Layout.jsx frontend/src/pages/Compra.jsx
git commit -m "feat(ui): pagina de socios y asignacion/filtro de socio en inventario de compra"
```

---

### Task 13: Frontend — Inventario de venta con selector de sucursal para todos

**Files:**
- Modify: `frontend/src/pages/Inventario.jsx`

- [ ] **Step 1: Mostrar el selector de sucursal para todos los roles**

En `frontend/src/pages/Inventario.jsx`, cambiar la condición que solo mostraba el `SelectorSucursal` al ADMIN para mostrarlo a todos:

Reemplazar:
```jsx
        {usuario.rol === 'ADMIN' && <SelectorSucursal value={filtros.sucursalId} onChange={(v) => setFiltros((f) => ({ ...f, sucursalId: v }))} incluirTodas />}
```
por:
```jsx
        <SelectorSucursal value={filtros.sucursalId} onChange={(v) => setFiltros((f) => ({ ...f, sucursalId: v }))} incluirTodas />
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Inventario.jsx
git commit -m "feat(ui): selector de sucursal en inventario de venta para todos los roles"
```

---

### Task 14: Frontend — Método de pago y venta de cualquier sucursal

**Files:**
- Modify: `frontend/src/pages/Ventas.jsx`

- [ ] **Step 1: Cargar vehículos de todas las sucursales con filtro opcional**

En `frontend/src/pages/Ventas.jsx`, el formulario ya carga vehículos DISPONIBLE; mostrar el selector de sucursal a todos los roles (no solo ADMIN) para filtrar opcionalmente, y mantener el comportamiento de listar todas si no se filtra. Cambiar el bloque del selector de sucursal:

Reemplazar:
```jsx
            {usuario.rol === 'ADMIN' && (
              <div><label>Sucursal</label><SelectorSucursal value={sucursalId} onChange={setSucursalId} /></div>
            )}
```
por:
```jsx
            <div><label>Sucursal (filtro)</label><SelectorSucursal value={sucursalId} onChange={setSucursalId} incluirTodas /></div>
```

- [ ] **Step 2: Agregar el selector de método de pago**

Añadir un estado `const [metodoPago, setMetodoPago] = useState('EFECTIVO');` junto a los demás `useState`, resetearlo en `reset()` (`setMetodoPago('EFECTIVO')`), e incluir el campo en el formulario (junto a Total):

```jsx
              <div style={{ flex: 1 }}><label>Método de pago</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
```

- [ ] **Step 3: Enviar metodoPago y quitar sucursalId del payload**

En `registrar`, cambiar el `payload` para incluir `metodoPago` y dejar de mandar `sucursalId` (la venta toma la sucursal del auto):

```jsx
      const payload = { vehiculoId: Number(vehiculoId), clienteId: Number(cid), total: Number(total), observaciones, metodoPago };
      if (usuario.rol === 'ADMIN') { payload.empleadoId = Number(empleadoId); }
```

En `verBorrador`, quitar la exigencia de sucursal para ADMIN (ahora se deriva del vehículo). Reemplazar:
```jsx
      if (usuario.rol === 'ADMIN' && !sucursalId) throw new Error('Selecciona una sucursal');
      const payload = { vehiculoId: Number(vehiculoId), total: Number(total) || 0, observaciones };
      if (usuario.rol === 'ADMIN') payload.sucursalId = sucursalId;
```
por:
```jsx
      const payload = { vehiculoId: Number(vehiculoId), total: Number(total) || 0, observaciones };
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Ventas.jsx
git commit -m "feat(ui): metodo de pago y venta de auto de cualquier sucursal"
```

---

### Task 15: Frontend — Página de gastos generales

**Files:**
- Create: `frontend/src/pages/Gastos.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Crear la página (ADMIN)**

Crear `frontend/src/pages/Gastos.jsx`:

```jsx
import { useEffect, useState } from 'react';
import api from '../api/client';

const VACIO = { categoria: '', descripcion: '', monto: '' };
const SUGERENCIAS = ['Insumos', 'Pago empleados', 'Renta', 'Servicios', 'Otro'];

export default function Gastos() {
  const [data, setData] = useState({ gastos: [], total: 0, porCategoria: {} });
  const [form, setForm] = useState(VACIO);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    const { data } = await api.get(`/gastos?${p.toString()}`);
    setData(data);
  }
  useEffect(() => { cargar(); }, [desde, hasta]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  async function crear(e) {
    e.preventDefault(); setError('');
    try { await api.post('/gastos', { ...form, monto: Number(form.monto) }); setForm(VACIO); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }
  async function eliminar(g) { await api.delete(`/gastos/${g.id}`); cargar(); }

  return (
    <div>
      <h1>Gastos generales (MXN)</h1>
      <div className="card">
        <h3>Nuevo gasto</h3>
        <form onSubmit={crear} className="row">
          <input list="cats" placeholder="Categoría" value={form.categoria} onChange={(e) => set('categoria', e.target.value)} required />
          <datalist id="cats">{SUGERENCIAS.map((c) => <option key={c} value={c} />)}</datalist>
          <input placeholder="Descripción" value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} required />
          <input type="number" placeholder="Monto" value={form.monto} onChange={(e) => set('monto', e.target.value)} required style={{ maxWidth: 140 }} />
          <button className="btn btn-primary" type="submit">Agregar</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>

      <div className="kpis">
        <div className="kpi"><h3>Total gastos</h3><div className="valor">${data.total.toLocaleString('es-MX')}</div></div>
        {Object.entries(data.porCategoria).map(([cat, m]) => (
          <div className="kpi" key={cat}><h3>{cat}</h3><div className="valor">${m.toLocaleString('es-MX')}</div></div>
        ))}
      </div>

      <table>
        <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th></th></tr></thead>
        <tbody>{data.gastos.map((g) => (
          <tr key={g.id}>
            <td>{new Date(g.fecha).toLocaleDateString('es-MX')}</td>
            <td>{g.categoria}</td><td>{g.descripcion}</td>
            <td>${Number(g.monto).toLocaleString('es-MX')}</td>
            <td><button className="btn btn-sm" onClick={() => eliminar(g)}>Eliminar</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Ruta y menú**

En `frontend/src/App.jsx`, añadir import y ruta (solo ADMIN):

```jsx
import Gastos from './pages/Gastos';
```

```jsx
      <Route path="/gastos" element={<Privada><RequireRol roles={SOLO_ADMIN}><Gastos /></RequireRol></Privada>} />
```

En `frontend/src/components/Layout.jsx`, en el grupo `'Administración'`, añadir:

```jsx
    { to: '/gastos', label: 'Gastos', roles: ['ADMIN'] },
```

- [ ] **Step 3: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Gastos.jsx frontend/src/App.jsx frontend/src/components/Layout.jsx
git commit -m "feat(ui): pagina de gastos generales con desglose por categoria"
```

---

### Task 16: Frontend — Reportes: método de pago, ganancias por socio y MXN

**Files:**
- Modify: `frontend/src/pages/Reportes.jsx`

- [ ] **Step 1: Cargar el tipo de cambio y el reporte de socios**

En `frontend/src/pages/Reportes.jsx`, añadir estados y carga:

```jsx
  const [tc, setTc] = useState(0);
  const [socios, setSocios] = useState(null);
  useEffect(() => { api.get('/configuracion').then((r) => setTc(r.data.tipoCambioDolar || 0)).catch(() => {}); }, []);
```

En la función `cargar`, además de ventas/inventario, traer el reporte de socios usando los mismos `desde/hasta`:

```js
    const s = await api.get(`/reportes/socios?${params()}`);
    setSocios(s.data);
```

(añadir `socios` al estado y a la dependencia del `useEffect` ya existente sobre `[sucursalId, desde, hasta]`).

- [ ] **Step 2: Mostrar KPIs de método de pago y columna**

En el bloque de KPIs de ventas, añadir efectivo/transferencia:

```jsx
            {ventas.totales.efectivo !== undefined && <div className="kpi"><h3>Efectivo</h3><div className="valor">${ventas.totales.efectivo.toLocaleString('es-MX')}</div></div>}
            {ventas.totales.transferencia !== undefined && <div className="kpi"><h3>Transferencia</h3><div className="valor">${ventas.totales.transferencia.toLocaleString('es-MX')}</div></div>}
```

En la tabla de ventas, añadir `<th>Pago</th>` al final del encabezado y `<td>{v.metodoPago || '—'}</td>` en cada fila.

- [ ] **Step 3: Sección de ganancias por socio (USD y MXN)**

Después de la tabla de ventas, añadir:

```jsx
      {socios && (
        <>
          <h2 style={{ marginTop: 24 }}>Ganancias por socio</h2>
          <div className="kpis">
            <div className="kpi"><h3>Total USD</h3><div className="valor">${socios.totalGeneralUsd.toLocaleString('es-MX')}</div></div>
            <div className="kpi"><h3>Total MXN</h3><div className="valor">${socios.totalGeneralMxn.toLocaleString('es-MX')}</div></div>
          </div>
          <table>
            <thead><tr><th>Socio</th><th>Autos vendidos</th><th>Ganancia USD</th><th>Ganancia MXN</th></tr></thead>
            <tbody>{socios.socios.map((s) => (
              <tr key={s.socioId}>
                <td>{s.nombre}</td><td>{s.cantidad}</td>
                <td>${s.totalUsd.toLocaleString('es-MX')}</td>
                <td>${s.totalMxn.toLocaleString('es-MX')}</td>
              </tr>
            ))}</tbody>
          </table>
          {socios.porMes.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Por mes (general)</h3>
              <table>
                <thead><tr><th>Mes</th><th>Ganancia USD</th><th>Ganancia MXN</th></tr></thead>
                <tbody>{socios.porMes.map((m) => (
                  <tr key={m.mes}><td>{m.mes}</td><td>${m.utilidadUsd.toLocaleString('es-MX')}</td><td>${m.utilidadMxn.toLocaleString('es-MX')}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
        </>
      )}
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Reportes.jsx
git commit -m "feat(ui): reportes con metodo de pago y ganancias por socio en USD/MXN"
```

---

### Task 17: Aplicar a Docker y verificación end-to-end

**Files:** ninguno (despliegue/migración).

- [ ] **Step 1: Reconstruir, migrar y seed**

Run (desde la raíz):

```bash
docker compose up -d --build
docker compose exec -T backend npx prisma migrate deploy
docker compose exec -T backend node prisma/seed.js
```

Expected: migración aplicada; seed reporta "Socio inicial creado" si la tabla estaba vacía.

- [ ] **Step 2: Verificación manual (ADMIN)**

Abrir `http://localhost:8082`:
1. **Configuración:** poner tipo de cambio (ej. 18.50) y guardar. El header muestra "Dólar: $18.50 MXN".
2. **Socios:** crear 2 socios.
3. **Inventario de compra (ALMACEN/ADMIN):** registrar un auto eligiendo socio; verificar el filtro por socio.
4. **Gastos:** registrar gastos de distintas categorías; verificar total y desglose.
5. **Reportes:** ganancias por socio en USD y MXN; KPIs de efectivo/transferencia.

- [ ] **Step 3: Verificación manual (VENDEDOR)**

1. **Inventario de venta:** ve autos de **todas** las sucursales (selector de sucursal disponible); no ve costos ni el socio.
2. **Ventas:** registrar una venta eligiendo un auto de otra sucursal y método de pago; confirmar folio y que el auto sale del inventario.

- [ ] **Step 4: Verificación de seguridad (API)**

Confirmar que un VENDEDOR no recibe `socio` en `GET /api/vehiculos` y que `GET /api/socios`, `/api/gastos`, `/api/reportes/socios` responden 403 para VENDEDOR.

- [ ] **Step 5: Commit (si hubo ajustes)**

Si la verificación obligó a algún ajuste, commitearlo. Si no, no hay commit en esta tarea.

---

## Notas de ejecución

- Suite completa de backend tras las Tasks 1–10: `cd backend && npm test`.
- Frontend se valida con `cd frontend && npm run build` (no hay runner de tests).
- La migración usa el patrón manual (carpeta + SQL + `migrate deploy`) por el backfill obligatorio de `socioId`.
