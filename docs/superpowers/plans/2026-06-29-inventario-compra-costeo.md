# Inventario de Compra, Costeo y Utilidad por Auto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar el ciclo de un auto en un inventario de compra (captura + costeo como borrador, gestionado por un nuevo rol ALMACEN) y un inventario de venta (lo que ven los vendedores, sin costos), con cálculo de utilidad y días en cada etapa.

**Architecture:** Un solo registro `Vehiculo` con un estado nuevo `EN_COMPRA`. Los costos fijos viven en `Vehiculo`; los gastos variables en un modelo `GastoVehiculo`. Las cifras derivadas (costo puesto en México, costo total, utilidad, días) se calculan con funciones puras y se exponen a través de un serializador que oculta costos a los vendedores. Un botón "Pasar a venta" cambia el estado y registra la fecha.

**Tech Stack:** Node + Express + Prisma + PostgreSQL (backend; Jest + Supertest con mocks de Prisma). React + Vite + Axios (frontend; sin runner de tests, se valida con `npm run build`).

## Global Constraints

- **Moneda:** todo en USD (costos y precio de venta). Utilidad en USD sin tipo de cambio.
- **Costos fijos** (campos en `Vehiculo`): `precioCompra`, `comisionProveedor`, `transporte`, `registroPlacas`, `salidas`. Su suma = "Costo Puesto en México".
- **Gastos variables:** modelo `GastoVehiculo { descripcion, monto }`.
- **Costo total** = Costo Puesto en México + Σ(gastos). **Utilidad** = `precioVenta − costoTotal`.
- **Estados:** `EN_COMPRA → DISPONIBLE → (RESERVADO) → VENDIDO`. Auto nuevo nace `EN_COMPRA` (forzado en el controller).
- **Paso a venta:** botón explícito; requiere `precioVenta > 0`; setea `fechaPaseAVenta` y estado `DISPONIBLE`.
- **Roles:** `ADMIN`, `VENDEDOR`, `ALMACEN`. ALMACEN gestiona inventario de compra + ve utilidad + ve inventario de venta (lectura). Para alcance de sucursal, ALMACEN se trata como ADMIN (ve todas; al crear indica sucursal).
- **Visibilidad:** el backend NUNCA envía campos de costo, gastos ni utilidad a un VENDEDOR (se omiten en el serializador).
- **Tests backend:** mockear `../src/config/prisma`, usar `supertest` + `firmarToken` (ver `tests/reportes.test.js`). Correr con `cd backend && npm test`.
- **Días:** `diasEnCompra = (fechaPaseAVenta ?? hoy) − fechaIngreso`; `diasEnVenta = (fechaVenta ?? hoy) − fechaPaseAVenta`, o `null` si no hay `fechaPaseAVenta`.

---

### Task 1: Schema, enums, modelo de gastos y migración con preservación de datos

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migración en `backend/prisma/migrations/`

**Interfaces:**
- Produces: `Vehiculo` con `precioCompra`, `comisionProveedor`, `transporte`, `registroPlacas`, `salidas` (Float @default(0)), `fechaPaseAVenta DateTime?`, relación `gastos`; sin `costoCompra`. Modelo `GastoVehiculo { id, vehiculoId, descripcion:String, monto:Float, createdAt }`. Enum `EstadoVehiculo` con `EN_COMPRA`. Enum `Rol` con `ALMACEN`.

- [ ] **Step 1: Editar el schema**

En `backend/prisma/schema.prisma`:

1. En `enum Rol`, agregar `ALMACEN`:

```prisma
enum Rol {
  ADMIN
  VENDEDOR
  ALMACEN
}
```

2. En `enum EstadoVehiculo`, agregar `EN_COMPRA` como primer valor:

```prisma
enum EstadoVehiculo {
  EN_COMPRA
  DISPONIBLE
  RESERVADO
  VENDIDO
}
```

3. En `model Vehiculo`, eliminar la línea `costoCompra Float @default(0)` y, en su lugar, dejar:

```prisma
  precioCompra      Float          @default(0)
  comisionProveedor Float          @default(0)
  transporte        Float          @default(0)
  registroPlacas    Float          @default(0)
  salidas           Float          @default(0)
  precioVenta       Float          @default(0)
  fechaPaseAVenta   DateTime?
```

(la línea `precioVenta` ya existe; solo añadir las de costos y `fechaPaseAVenta`).

4. En `model Vehiculo`, dentro de las relaciones, agregar:

```prisma
  gastos       GastoVehiculo[]
```

5. Al final del archivo, agregar el modelo:

```prisma
model GastoVehiculo {
  id          Int      @id @default(autoincrement())
  vehiculoId  Int
  vehiculo    Vehiculo @relation(fields: [vehiculoId], references: [id], onDelete: Cascade)
  descripcion String
  monto       Float
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 2: Generar la migración SIN aplicarla**

Run (BD arriba en `localhost:5437`):

```bash
cd backend
docker compose -f ../docker-compose.yml up -d db
npx prisma migrate dev --create-only --name inventario_compra
```

Expected: crea `backend/prisma/migrations/<timestamp>_inventario_compra/migration.sql` sin aplicarlo.

- [ ] **Step 3: Editar el SQL para preservar datos**

Abrir el `migration.sql` recién creado. Asegurar este orden de operaciones (añadir los `UPDATE` si Prisma no los generó, y mover el `DROP COLUMN "costoCompra"` para que quede DESPUÉS del primer UPDATE):

```sql
-- 1) Nuevos valores de enum (deben ir antes de cualquier uso)
ALTER TYPE "Rol" ADD VALUE 'ALMACEN';
ALTER TYPE "EstadoVehiculo" ADD VALUE 'EN_COMPRA';

-- 2) Nuevas columnas de costo y fecha
ALTER TABLE "Vehiculo" ADD COLUMN "precioCompra" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "comisionProveedor" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "transporte" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "registroPlacas" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "salidas" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "fechaPaseAVenta" TIMESTAMP(3);

-- 3) Preservar datos existentes ANTES de eliminar costoCompra
UPDATE "Vehiculo" SET "precioCompra" = "costoCompra";
UPDATE "Vehiculo" SET "fechaPaseAVenta" = "fechaIngreso"
  WHERE "estado" IN ('DISPONIBLE','RESERVADO','VENDIDO');

-- 4) Eliminar la columna vieja
ALTER TABLE "Vehiculo" DROP COLUMN "costoCompra";

-- 5) Tabla de gastos
CREATE TABLE "GastoVehiculo" (
  "id" SERIAL NOT NULL,
  "vehiculoId" INTEGER NOT NULL,
  "descripcion" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GastoVehiculo_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GastoVehiculo" ADD CONSTRAINT "GastoVehiculo_vehiculoId_fkey"
  FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> Nota Postgres: `ALTER TYPE ... ADD VALUE` no puede ejecutarse en la misma transacción donde el valor se usa. Aquí no se usa `EN_COMPRA`/`ALMACEN` en esta migración (el default del estado sigue siendo `DISPONIBLE`; el controller forzará `EN_COMPRA`), por lo que es seguro.

- [ ] **Step 4: Aplicar la migración**

Run:

```bash
cd backend && npx prisma migrate dev
```

Expected: aplica la migración pendiente y regenera el client sin error.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: schema inventario de compra (costos, gastos, EN_COMPRA, rol ALMACEN)"
```

---

### Task 2: Funciones puras de costos, utilidad y días

**Files:**
- Create: `backend/src/utils/costos.js`
- Test: `backend/tests/costos.test.js`

**Interfaces:**
- Produces:
  - `costoPuestoEnMexico(v) -> number`
  - `sumaGastos(v) -> number`
  - `costoTotal(v) -> number`
  - `utilidad(v) -> number`
  - `diasEnCompra(v, ahora=new Date()) -> number`
  - `diasEnVenta(v, ahora=new Date()) -> number | null`
  donde `v` es un vehículo con campos de costo, `gastos` (array opcional), `fechaIngreso`, `fechaPaseAVenta` (opcional), `precioVenta` y `venta` (opcional, con `fecha`).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/costos.test.js`:

```js
const c = require('../src/utils/costos');

const base = {
  precioCompra: 5000, comisionProveedor: 300, transporte: 700, registroPlacas: 400, salidas: 100,
  gastos: [{ monto: 200 }, { monto: 300 }], precioVenta: 9000,
  fechaIngreso: new Date('2026-06-01T00:00:00'),
};

describe('costos', () => {
  test('costoPuestoEnMexico suma los 5 campos fijos', () => {
    expect(c.costoPuestoEnMexico(base)).toBe(6500);
  });
  test('sumaGastos suma los gastos', () => {
    expect(c.sumaGastos(base)).toBe(500);
  });
  test('costoTotal = puesto en México + gastos', () => {
    expect(c.costoTotal(base)).toBe(7000);
  });
  test('utilidad = precioVenta - costoTotal', () => {
    expect(c.utilidad(base)).toBe(2000);
  });
  test('utilidad puede ser negativa', () => {
    expect(c.utilidad({ ...base, precioVenta: 6000 })).toBe(-1000);
  });
  test('sin gastos, sumaGastos es 0', () => {
    expect(c.sumaGastos({ precioCompra: 1000 })).toBe(0);
  });
  test('diasEnCompra usa fechaPaseAVenta si existe', () => {
    const v = { fechaIngreso: new Date('2026-06-01T00:00:00'), fechaPaseAVenta: new Date('2026-06-11T00:00:00') };
    expect(c.diasEnCompra(v)).toBe(10);
  });
  test('diasEnCompra usa hoy si no hay fechaPaseAVenta', () => {
    const v = { fechaIngreso: new Date('2026-06-01T00:00:00') };
    expect(c.diasEnCompra(v, new Date('2026-06-06T00:00:00'))).toBe(5);
  });
  test('diasEnVenta es null si no hubo paso a venta', () => {
    expect(c.diasEnVenta({ fechaIngreso: new Date('2026-06-01') })).toBeNull();
  });
  test('diasEnVenta usa fecha de venta si está vendido', () => {
    const v = { fechaPaseAVenta: new Date('2026-06-10T00:00:00'), venta: { fecha: new Date('2026-06-20T00:00:00') } };
    expect(c.diasEnVenta(v)).toBe(10);
  });
  test('diasEnVenta usa hoy si pasó a venta y no se ha vendido', () => {
    const v = { fechaPaseAVenta: new Date('2026-06-10T00:00:00') };
    expect(c.diasEnVenta(v, new Date('2026-06-13T00:00:00'))).toBe(3);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/costos.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crear `backend/src/utils/costos.js`:

```js
const CAMPOS_COSTO = ['precioCompra', 'comisionProveedor', 'transporte', 'registroPlacas', 'salidas'];

function costoPuestoEnMexico(v) {
  return CAMPOS_COSTO.reduce((a, k) => a + (Number(v[k]) || 0), 0);
}
function sumaGastos(v) {
  return Array.isArray(v.gastos) ? v.gastos.reduce((a, g) => a + (Number(g.monto) || 0), 0) : 0;
}
function costoTotal(v) {
  return costoPuestoEnMexico(v) + sumaGastos(v);
}
function utilidad(v) {
  return (Number(v.precioVenta) || 0) - costoTotal(v);
}
function diasEntre(a, b) {
  return Math.floor((a - b) / 86400000);
}
function diasEnCompra(v, ahora = new Date()) {
  const fin = v.fechaPaseAVenta ? new Date(v.fechaPaseAVenta) : ahora;
  return diasEntre(fin, new Date(v.fechaIngreso));
}
function diasEnVenta(v, ahora = new Date()) {
  if (!v.fechaPaseAVenta) return null;
  const fin = v.venta && v.venta.fecha ? new Date(v.venta.fecha) : ahora;
  return diasEntre(fin, new Date(v.fechaPaseAVenta));
}

module.exports = { CAMPOS_COSTO, costoPuestoEnMexico, sumaGastos, costoTotal, utilidad, diasEnCompra, diasEnVenta };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/costos.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/costos.js backend/tests/costos.test.js
git commit -m "feat: funciones puras de costos, utilidad y dias por auto"
```

---

### Task 3: Serializador `vistaVehiculo` (visibilidad por rol)

**Files:**
- Modify: `backend/src/utils/costos.js`
- Test: `backend/tests/vistaVehiculo.test.js`

**Interfaces:**
- Consumes: funciones de la Task 2.
- Produces: `vistaVehiculo(v, rol) -> object`. Para todos: agrega `diasEnCompra`, `diasEnVenta`. Para `ADMIN`/`ALMACEN`: agrega `costoPuestoEnMexico`, `costoTotal`, `utilidad` y conserva campos de costo y `gastos`. Para `VENDEDOR`: elimina `precioCompra`, `comisionProveedor`, `transporte`, `registroPlacas`, `salidas`, `gastos` y NO agrega derivados de costo/utilidad.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/vistaVehiculo.test.js`:

```js
const { vistaVehiculo } = require('../src/utils/costos');

const v = {
  id: 1, marca: 'Nissan', modelo: 'Versa', precioVenta: 9000,
  precioCompra: 5000, comisionProveedor: 300, transporte: 700, registroPlacas: 400, salidas: 100,
  gastos: [{ id: 1, monto: 500, descripcion: 'Pintura' }],
  fechaIngreso: new Date('2026-06-01T00:00:00'), fechaPaseAVenta: new Date('2026-06-11T00:00:00'),
};

describe('vistaVehiculo', () => {
  test('ADMIN ve costos, utilidad y derivados', () => {
    const r = vistaVehiculo(v, 'ADMIN');
    expect(r.precioCompra).toBe(5000);
    expect(r.costoPuestoEnMexico).toBe(6500);
    expect(r.costoTotal).toBe(7000);
    expect(r.utilidad).toBe(2000);
    expect(r.diasEnCompra).toBe(10);
    expect(r.gastos).toHaveLength(1);
  });
  test('ALMACEN ve lo mismo que ADMIN', () => {
    const r = vistaVehiculo(v, 'ALMACEN');
    expect(r.utilidad).toBe(2000);
    expect(r.precioCompra).toBe(5000);
  });
  test('VENDEDOR no ve costos, gastos ni utilidad pero sí precioVenta', () => {
    const r = vistaVehiculo(v, 'VENDEDOR');
    expect(r.precioVenta).toBe(9000);
    expect(r.precioCompra).toBeUndefined();
    expect(r.comisionProveedor).toBeUndefined();
    expect(r.transporte).toBeUndefined();
    expect(r.registroPlacas).toBeUndefined();
    expect(r.salidas).toBeUndefined();
    expect(r.gastos).toBeUndefined();
    expect(r.costoTotal).toBeUndefined();
    expect(r.utilidad).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/vistaVehiculo.test.js`
Expected: FAIL — `vistaVehiculo` no exportado.

- [ ] **Step 3: Implementar en `costos.js`**

En `backend/src/utils/costos.js`, añadir antes del `module.exports`:

```js
function vistaVehiculo(v, rol) {
  const dias = { diasEnCompra: diasEnCompra(v), diasEnVenta: diasEnVenta(v) };
  if (rol === 'VENDEDOR') {
    const base = { ...v };
    for (const k of CAMPOS_COSTO) delete base[k];
    delete base.gastos;
    return { ...base, ...dias };
  }
  return {
    ...v, ...dias,
    costoPuestoEnMexico: costoPuestoEnMexico(v),
    costoTotal: costoTotal(v),
    utilidad: utilidad(v),
  };
}
```

Y añadir `vistaVehiculo` al `module.exports`:

```js
module.exports = { CAMPOS_COSTO, costoPuestoEnMexico, sumaGastos, costoTotal, utilidad, diasEnCompra, diasEnVenta, vistaVehiculo };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/vistaVehiculo.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/costos.js backend/tests/vistaVehiculo.test.js
git commit -m "feat: serializador vistaVehiculo que oculta costos al VENDEDOR"
```

---

### Task 4: Rol ALMACEN en RBAC, alcance y alta de usuarios

**Files:**
- Modify: `backend/src/utils/alcance.js`
- Modify: `backend/src/controllers/usuarios.controller.js`
- Test: `backend/tests/usuarios.alcance.almacen.test.js`

**Interfaces:**
- Produces: `resolverSucursalLectura`/`resolverSucursalEscritura` tratan `ALMACEN` igual que `ADMIN`. `POST /usuarios` acepta `rol: 'ALMACEN'`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/usuarios.alcance.almacen.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  usuario: { findUnique: jest.fn(), create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');
const { resolverSucursalLectura } = require('../src/utils/alcance');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });

beforeEach(() => jest.clearAllMocks());

describe('Rol ALMACEN', () => {
  test('alcance: ALMACEN sin sucursal ve todas (como ADMIN)', () => {
    const req = { usuario: { rol: 'ALMACEN', sucursalId: null }, query: {} };
    expect(resolverSucursalLectura(req)).toBeUndefined();
  });

  test('POST /usuarios acepta rol ALMACEN', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: 5, username: 'bodega', rol: 'ALMACEN', activo: true, debeCambiarPassword: true, empleadoId: null });
    const res = await request(app).post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ username: 'bodega', password: 'secreto1', rol: 'ALMACEN' });
    expect(res.status).toBe(201);
    expect(res.body.rol).toBe('ALMACEN');
  });

  test('POST /usuarios sigue rechazando rol inválido', async () => {
    const res = await request(app).post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ username: 'x', password: 'secreto1', rol: 'SUPER' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/usuarios.alcance.almacen.test.js`
Expected: FAIL — ALMACEN lanza 403 en alcance y rol ALMACEN es rechazado (400) por el controller.

- [ ] **Step 3: Tratar ALMACEN como ADMIN en alcance**

En `backend/src/utils/alcance.js`, en ambas funciones, cambiar la condición `if (req.usuario.rol === 'ADMIN')` por:

```js
  if (req.usuario.rol === 'ADMIN' || req.usuario.rol === 'ALMACEN') {
```

(aplicar el cambio en `resolverSucursalLectura` y en `resolverSucursalEscritura`).

- [ ] **Step 4: Aceptar rol ALMACEN al crear usuario**

En `backend/src/controllers/usuarios.controller.js`, cambiar la línea de validación:

```js
    if (!['ADMIN', 'VENDEDOR', 'ALMACEN'].includes(rol)) throw new ApiError(400, 'Rol inválido');
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/usuarios.alcance.almacen.test.js`
Expected: PASS (los 3 casos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/alcance.js backend/src/controllers/usuarios.controller.js backend/tests/usuarios.alcance.almacen.test.js
git commit -m "feat: rol ALMACEN en alcance y alta de usuarios"
```

---

### Task 5: Vehículos — campos de costo, estado EN_COMPRA, filtro de inventario y serialización

**Files:**
- Modify: `backend/src/controllers/vehiculos.controller.js`
- Modify: `backend/src/routes/vehiculos.routes.js`
- Test: `backend/tests/vehiculos.inventario.test.js`

**Interfaces:**
- Consumes: `vistaVehiculo` (Task 3).
- Produces:
  - `datosBase` mapea `precioCompra`, `comisionProveedor`, `transporte`, `registroPlacas`, `salidas`, `precioVenta` (ya no `costoCompra`).
  - `crear` fuerza `estado: 'EN_COMPRA'` y solo ADMIN/ALMACEN.
  - `listar` acepta `?inventario=compra|venta` y serializa cada vehículo con `vistaVehiculo(v, rol)`; `obtener` también serializa.
  - `ESTADOS` incluye `EN_COMPRA`.
  - Rutas `POST /` y `PUT /:id` protegidas con `rbac('ADMIN','ALMACEN')`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/vehiculos.inventario.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  vehiculo: { findMany: jest.fn(), findUnique: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

const fila = {
  id: 7, sucursalId: 1, marca: 'Kia', modelo: 'Rio', estado: 'DISPONIBLE', precioVenta: 9000,
  precioCompra: 5000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0,
  gastos: [], fechaIngreso: new Date('2026-06-01'), fechaPaseAVenta: new Date('2026-06-05'),
  fotos: [], sucursal: { id: 1, nombre: 'Matriz' },
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/vehiculos visibilidad', () => {
  test('ADMIN recibe costos y utilidad', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body[0].precioCompra).toBe(5000);
    expect(res.body[0].utilidad).toBe(4000);
  });

  test('VENDEDOR no recibe costos ni utilidad', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
    expect(res.body[0].precioVenta).toBe(9000);
    expect(res.body[0].precioCompra).toBeUndefined();
    expect(res.body[0].utilidad).toBeUndefined();
  });

  test('filtro ?inventario=compra consulta estado EN_COMPRA', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?inventario=compra').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.estado).toBe('EN_COMPRA');
  });

  test('filtro ?inventario=venta excluye EN_COMPRA', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?inventario=venta').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.estado).toEqual({ in: ['DISPONIBLE', 'RESERVADO', 'VENDIDO'] });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/vehiculos.inventario.test.js`
Expected: FAIL — el body aún incluye/oculta campos según el código viejo y no existe el filtro `inventario`.

- [ ] **Step 3: Actualizar el controller**

En `backend/src/controllers/vehiculos.controller.js`:

1. Añadir el require arriba:

```js
const { vistaVehiculo } = require('../utils/costos');
```

2. Cambiar la constante de estados:

```js
const ESTADOS = ['EN_COMPRA', 'DISPONIBLE', 'RESERVADO', 'VENDIDO'];
```

3. En `datosBase`, reemplazar la línea de `costoCompra` por los nuevos campos:

```js
  for (const k of ['precioCompra', 'comisionProveedor', 'transporte', 'registroPlacas', 'salidas']) {
    if (body[k] !== undefined) data[k] = Number(body[k]) || 0;
  }
  if (body.precioVenta !== undefined) data.precioVenta = Number(body.precioVenta) || 0;
```

(eliminar las dos líneas viejas que asignaban `data.costoCompra` y `data.precioVenta`).

4. En `listar`, reemplazar el bloque de filtro de estado y la respuesta:

```js
    if (req.query.inventario === 'compra') where.estado = 'EN_COMPRA';
    else if (req.query.inventario === 'venta') where.estado = { in: ['DISPONIBLE', 'RESERVADO', 'VENDIDO'] };
    else if (req.query.estado && ESTADOS.includes(req.query.estado)) where.estado = req.query.estado;
```

Y al construir la respuesta, incluir gastos y serializar:

```js
    const lista = await prisma.vehiculo.findMany({ where, orderBy: { fechaIngreso: 'desc' }, include: { sucursal: { select: { id: true, nombre: true } }, fotos: { orderBy: { orden: 'asc' }, take: 1 }, gastos: true, venta: { select: { fecha: true } } } });
    res.json(lista.map((v) => vistaVehiculo(v, req.usuario.rol)));
```

5. En `obtener`, incluir gastos/venta y serializar:

```js
    const v = await prisma.vehiculo.findUnique({ where: { id: Number(req.params.id) }, include: { fotos: { orderBy: { orden: 'asc' } }, sucursal: true, gastos: { orderBy: { createdAt: 'asc' } }, venta: { select: { fecha: true } } } });
    if (!v) throw new ApiError(404, 'Vehículo no encontrado');
    res.json(vistaVehiculo(v, req.usuario.rol));
```

6. En `crear`, forzar el estado `EN_COMPRA` en el `data`:

```js
    const data = { ...datosBase(req.body), sucursalId, estado: 'EN_COMPRA' };
```

Y al devolver el creado, serializar (sustituir el `res.status(201).json(v)`):

```js
    res.status(201).json(vistaVehiculo(v, req.usuario.rol));
```

7. En `actualizar`, serializar la respuesta final (sustituir `res.json(v)`):

```js
    res.json(vistaVehiculo(v, req.usuario.rol));
```

> Nota: en `crear` y `actualizar`, el `findUnique` final debe incluir `gastos` para que el serializador calcule bien. Cambiar ambos `include: { fotos: ... }` por `include: { fotos: { orderBy: { orden: 'asc' } }, gastos: true, venta: { select: { fecha: true } } }`.

- [ ] **Step 4: Proteger las rutas de escritura**

En `backend/src/routes/vehiculos.routes.js`, añadir el require y los `rbac`:

```js
const rbac = require('../middlewares/rbac');
```

```js
router.post('/', rbac('ADMIN', 'ALMACEN'), ctrl.crear);
router.put('/:id', rbac('ADMIN', 'ALMACEN'), ctrl.actualizar);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/vehiculos.inventario.test.js`
Expected: PASS (los 4 casos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/vehiculos.controller.js backend/src/routes/vehiculos.routes.js backend/tests/vehiculos.inventario.test.js
git commit -m "feat: costos, estado EN_COMPRA, filtro de inventario y serializacion por rol"
```

---

### Task 6: Endpoints de gastos del vehículo

**Files:**
- Modify: `backend/src/controllers/vehiculos.controller.js`
- Modify: `backend/src/routes/vehiculos.routes.js`
- Test: `backend/tests/vehiculos.gastos.test.js`

**Interfaces:**
- Produces:
  - `POST /api/vehiculos/:id/gastos` (ADMIN/ALMACEN) body `{ descripcion, monto }` → crea y devuelve el gasto.
  - `DELETE /api/vehiculos/:id/gastos/:gastoId` (ADMIN/ALMACEN) → elimina el gasto.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/vehiculos.gastos.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  gastoVehiculo: { create: jest.fn(), delete: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Gastos de vehículo', () => {
  test('ALMACEN agrega un gasto', async () => {
    prisma.gastoVehiculo.create.mockResolvedValue({ id: 1, vehiculoId: 7, descripcion: 'Pintura', monto: 500 });
    const res = await request(app).post('/api/vehiculos/7/gastos')
      .set('Authorization', `Bearer ${tokenAlmacen}`).send({ descripcion: 'Pintura', monto: 500 });
    expect(res.status).toBe(201);
    expect(prisma.gastoVehiculo.create).toHaveBeenCalledWith({ data: { vehiculoId: 7, descripcion: 'Pintura', monto: 500 } });
  });

  test('rechaza gasto sin descripción o monto', async () => {
    const res = await request(app).post('/api/vehiculos/7/gastos')
      .set('Authorization', `Bearer ${tokenAlmacen}`).send({ descripcion: '' });
    expect(res.status).toBe(400);
  });

  test('ALMACEN elimina un gasto', async () => {
    prisma.gastoVehiculo.delete.mockResolvedValue({ id: 9 });
    const res = await request(app).delete('/api/vehiculos/7/gastos/9').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(200);
    expect(prisma.gastoVehiculo.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  test('VENDEDOR no puede agregar gastos', async () => {
    const res = await request(app).post('/api/vehiculos/7/gastos')
      .set('Authorization', `Bearer ${tokenVend}`).send({ descripcion: 'X', monto: 1 });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/vehiculos.gastos.test.js`
Expected: FAIL — rutas inexistentes (404).

- [ ] **Step 3: Implementar el controller**

En `backend/src/controllers/vehiculos.controller.js`, añadir antes del `module.exports`:

```js
async function agregarGasto(req, res, next) {
  try {
    const vehiculoId = Number(req.params.id);
    const { descripcion, monto } = req.body;
    if (!descripcion || !String(descripcion).trim() || monto == null || !Number.isFinite(Number(monto))) {
      throw new ApiError(400, 'descripcion y monto son obligatorios');
    }
    const gasto = await prisma.gastoVehiculo.create({ data: { vehiculoId, descripcion: String(descripcion).trim(), monto: Number(monto) } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'AGREGAR_GASTO_VEHICULO', entidad: 'GastoVehiculo', entidadId: gasto.id, datos: { vehiculoId, monto: gasto.monto }, ip: req.ip });
    res.status(201).json(gasto);
  } catch (e) { next(e); }
}

async function eliminarGasto(req, res, next) {
  try {
    const gastoId = Number(req.params.gastoId);
    await prisma.gastoVehiculo.delete({ where: { id: gastoId } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'ELIMINAR_GASTO_VEHICULO', entidad: 'GastoVehiculo', entidadId: gastoId, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { next(e); }
}
```

Y agregar ambas al `module.exports`:

```js
module.exports = { listar, obtener, crear, actualizar, cambiarEstado, agregarGasto, eliminarGasto };
```

- [ ] **Step 4: Implementar las rutas**

En `backend/src/routes/vehiculos.routes.js`, añadir:

```js
router.post('/:id/gastos', rbac('ADMIN', 'ALMACEN'), ctrl.agregarGasto);
router.delete('/:id/gastos/:gastoId', rbac('ADMIN', 'ALMACEN'), ctrl.eliminarGasto);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/vehiculos.gastos.test.js`
Expected: PASS (los 4 casos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/vehiculos.controller.js backend/src/routes/vehiculos.routes.js backend/tests/vehiculos.gastos.test.js
git commit -m "feat: endpoints para agregar y eliminar gastos de vehiculo"
```

---

### Task 7: Pasar a venta

**Files:**
- Modify: `backend/src/controllers/vehiculos.controller.js`
- Modify: `backend/src/routes/vehiculos.routes.js`
- Test: `backend/tests/vehiculos.pasarAVenta.test.js`

**Interfaces:**
- Consumes: `vistaVehiculo`.
- Produces: `PUT /api/vehiculos/:id/pasar-a-venta` (ADMIN/ALMACEN). Valida `precioVenta > 0` y `estado === 'EN_COMPRA'`; setea `estado='DISPONIBLE'`, `fechaPaseAVenta=now()`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/vehiculos.pasarAVenta.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  vehiculo: { findUnique: jest.fn(), update: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Pasar a venta', () => {
  test('rechaza si precioVenta es 0', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'EN_COMPRA', precioVenta: 0 });
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(400);
    expect(prisma.vehiculo.update).not.toHaveBeenCalled();
  });

  test('rechaza si no está EN_COMPRA', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'DISPONIBLE', precioVenta: 9000 });
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(409);
  });

  test('pasa a DISPONIBLE y setea fechaPaseAVenta', async () => {
    prisma.vehiculo.findUnique
      .mockResolvedValueOnce({ id: 7, estado: 'EN_COMPRA', precioVenta: 9000 })
      .mockResolvedValueOnce({ id: 7, estado: 'DISPONIBLE', precioVenta: 9000, precioCompra: 5000, gastos: [], fechaIngreso: new Date('2026-06-01'), fechaPaseAVenta: new Date('2026-06-05') });
    prisma.vehiculo.update.mockResolvedValue({});
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(200);
    const arg = prisma.vehiculo.update.mock.calls[0][0];
    expect(arg.data.estado).toBe('DISPONIBLE');
    expect(arg.data.fechaPaseAVenta).toBeInstanceOf(Date);
  });

  test('VENDEDOR no puede pasar a venta', async () => {
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/vehiculos.pasarAVenta.test.js`
Expected: FAIL — ruta inexistente.

- [ ] **Step 3: Implementar el controller**

En `backend/src/controllers/vehiculos.controller.js`, añadir antes del `module.exports`:

```js
async function pasarAVenta(req, res, next) {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.vehiculo.findUnique({ where: { id } });
    if (!actual) throw new ApiError(404, 'Vehículo no encontrado');
    if (!(Number(actual.precioVenta) > 0)) throw new ApiError(400, 'Debe capturar un precio de venta mayor a 0 antes de pasar a venta');
    if (actual.estado !== 'EN_COMPRA') throw new ApiError(409, 'El vehículo no está en el inventario de compra');
    await prisma.vehiculo.update({ where: { id }, data: { estado: 'DISPONIBLE', fechaPaseAVenta: new Date() } });
    const v = await prisma.vehiculo.findUnique({ where: { id }, include: { gastos: true, venta: { select: { fecha: true } } } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'PASAR_A_VENTA', entidad: 'Vehiculo', entidadId: id, ip: req.ip });
    res.json(vistaVehiculo(v, req.usuario.rol));
  } catch (e) { next(e); }
}
```

Y agregarla al `module.exports`:

```js
module.exports = { listar, obtener, crear, actualizar, cambiarEstado, agregarGasto, eliminarGasto, pasarAVenta };
```

- [ ] **Step 4: Implementar la ruta**

En `backend/src/routes/vehiculos.routes.js`, añadir:

```js
router.put('/:id/pasar-a-venta', rbac('ADMIN', 'ALMACEN'), ctrl.pasarAVenta);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/vehiculos.pasarAVenta.test.js`
Expected: PASS (los 4 casos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/vehiculos.controller.js backend/src/routes/vehiculos.routes.js backend/tests/vehiculos.pasarAVenta.test.js
git commit -m "feat: endpoint pasar a venta (valida precio y estado)"
```

---

### Task 8: Utilidad real en el reporte de ventas

**Files:**
- Modify: `backend/src/services/reportes.service.js`
- Test: `backend/tests/reportes.test.js`

**Interfaces:**
- Consumes: `costoTotal` (Task 2).
- Produces: `reportes.ventas` calcula utilidad como `precioVenta − costoTotal(vehiculo)` (con gastos incluidos), reemplazando `precioVenta − costoCompra`.

- [ ] **Step 1: Actualizar el test existente**

En `backend/tests/reportes.test.js`, en el primer test (`calcula utilidad`), reemplazar los `vehiculo` del mock para usar los campos nuevos (ya no `costoCompra`) e incluir `gastos`:

```js
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, total: 150000, comision: 0, fecha: new Date(), vehiculo: { precioCompra: 100000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [], precioVenta: 150000 }, cliente: { nombre: 'Luis' }, empleado: { nombre: 'Ana' } },
      { id: 2, total: 80000, comision: 0, fecha: new Date(), vehiculo: { precioCompra: 60000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [{ monto: 5000 }], precioVenta: 80000 }, cliente: { nombre: 'Pedro' }, empleado: { nombre: 'Ana' } },
    ]);
```

Y ajustar la aserción de utilidad (auto 1: 150k−100k=50k; auto 2: 80k−(60k+5k)=15k; total 65k):

```js
    expect(res.body.totales.utilidad).toBe(65000);
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/reportes.test.js`
Expected: FAIL — el cálculo viejo usa `costoCompra` (undefined) y no da 65000.

- [ ] **Step 3: Actualizar el service**

En `backend/src/services/reportes.service.js`:

1. Añadir el require arriba:

```js
const { costoTotal } = require('../utils/costos');
```

2. En `ventas`, incluir `gastos` del vehículo en el `findMany`:

```js
    include: { vehiculo: { include: { gastos: true } }, cliente: { select: { nombre: true } }, empleado: { select: { nombre: true, apellidos: true } }, sucursal: { select: { nombre: true } } },
```

3. En el `reduce` de `totales`, cambiar la línea de utilidad por:

```js
    utilidad: a.utilidad + (v.vehiculo ? v.vehiculo.precioVenta - costoTotal(v.vehiculo) : 0),
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/reportes.test.js`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite backend**

Run: `cd backend && npm test`
Expected: PASS (todas las suites, incluidas las nuevas y las de la feature de comisiones).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/reportes.service.js backend/tests/reportes.test.js
git commit -m "feat: utilidad real (precioVenta - costo total) en reporte de ventas"
```

---

### Task 9: Frontend — Inventario de venta (sin costos para vendedor)

**Files:**
- Modify: `frontend/src/pages/Inventario.jsx`

> Verificación: `cd frontend && npm run build` + revisión manual.

- [ ] **Step 1: Filtrar a inventario de venta y quitar el formulario de captura**

En `frontend/src/pages/Inventario.jsx`:

1. En `cargar`, forzar el inventario de venta añadiendo el parámetro y quitando el filtro de creación:

```js
  async function cargar() {
    const params = new URLSearchParams();
    params.set('inventario', 'venta');
    if (filtros.buscar) params.set('buscar', filtros.buscar);
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.sucursalId) params.set('sucursalId', filtros.sucursalId);
    const { data } = await api.get(`/vehiculos?${params}`);
    setLista(data);
  }
```

2. Quitar el botón "+ Nuevo vehículo" y todo el bloque `{mostrarForm && (...)}` (la captura/edición de costos vive ahora en el Inventario de compra). Eliminar también las funciones `guardar`, `editar`, `nuevo`, `set`, y los estados `form`, `editId`, `mostrarForm`, `error` ya no usados. Mantener `cargar`, `cambiarEstado`, `abrirGaleria`, `galeria`, `umbral` y la tabla.

- [ ] **Step 2: Mostrar utilidad y días en venta solo a ADMIN/ALMACEN**

En la tabla, cambiar el encabezado para añadir columnas condicionales y la celda de días para usar `diasEnVenta`:

```jsx
        <thead><tr>
          <th>Foto</th><th>Vehículo</th><th>Color</th><th>Precio</th><th>Estado</th>
          <th>Días en venta</th>
          {usuario.rol !== 'VENDEDOR' && <th>Utilidad</th>}
          <th></th>
        </tr></thead>
```

En el `<tbody>`, dentro del `map`, calcular días en venta desde el dato del backend y renderizar:

```jsx
              <td>{v.diasEnVenta != null ? v.diasEnVenta : '—'}</td>
              {usuario.rol !== 'VENDEDOR' && <td>{v.utilidad != null ? `$${Number(v.utilidad).toLocaleString('es-MX')}` : '—'}</td>}
```

(eliminar el cálculo local `const d = dias(v.fechaIngreso)` y la columna de "Días" basada en `fechaIngreso`; si se desea conservar el indicador de alerta, basarlo en `v.diasEnVenta`).

3. En la columna de acciones, quitar el botón "Editar" (la edición ya no ocurre aquí); conservar el selector de estado para DISPONIBLE/RESERVADO. Para ADMIN/ALMACEN, añadir un enlace a la ficha de costos en compra:

```jsx
                {usuario.rol !== 'VENDEDOR' && <a className="btn btn-sm" href={`/compra?editar=${v.id}`}>Costos</a>}
```

- [ ] **Step 3: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores (sin referencias a variables eliminadas).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Inventario.jsx
git commit -m "feat(ui): inventario de venta sin costos para vendedor, con utilidad para admin/almacen"
```

---

### Task 10: Frontend — Inventario de compra (captura, costeo, gastos, pasar a venta)

**Files:**
- Create: `frontend/src/pages/Compra.jsx`

**Interfaces:**
- Consumes: `GET /vehiculos?inventario=compra`, `GET /vehiculos/:id`, `POST /vehiculos`, `PUT /vehiculos/:id`, `POST /vehiculos/:id/gastos`, `DELETE /vehiculos/:id/gastos/:gastoId`, `PUT /vehiculos/:id/pasar-a-venta`.

- [ ] **Step 1: Crear la página**

Crear `frontend/src/pages/Compra.jsx`:

```jsx
import { useEffect, useState } from 'react';
import api from '../api/client';
import SubidorImagenes from '../components/SubidorImagenes';
import SelectorSucursal from '../components/SelectorSucursal';
import { useAuth } from '../context/AuthContext';

const VACIO = {
  anio: '', marca: '', modelo: '', color: '', vin: '', placa: '', kilometraje: '',
  transmision: '', combustible: '',
  precioCompra: '', comisionProveedor: '', transporte: '', registroPlacas: '', salidas: '',
  precioVenta: '', notas: '', sucursalId: undefined, fotos: [],
};

const urlFoto = (d) => (!d || d.startsWith('data:') || d.startsWith('/api/uploads/')) ? d : `/api/uploads/${d}`;
const num = (x) => Number(x) || 0;

export default function Compra() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [nuevoGasto, setNuevoGasto] = useState({ descripcion: '', monto: '' });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');

  async function cargar() {
    const { data } = await api.get('/vehiculos?inventario=compra');
    setLista(data);
  }
  useEffect(() => { cargar(); }, []);

  // Si llega ?editar=<id> (desde el inventario de venta), abrir esa ficha.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('editar');
    if (id) abrir(Number(id));
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const puestoEnMexico = num(form.precioCompra) + num(form.comisionProveedor) + num(form.transporte) + num(form.registroPlacas) + num(form.salidas);
  const totalGastos = gastos.reduce((a, g) => a + num(g.monto), 0);
  const costoTotal = puestoEnMexico + totalGastos;
  const utilidad = num(form.precioVenta) - costoTotal;

  function nuevo() { setEditId(null); setForm(VACIO); setGastos([]); setMostrarForm(true); }

  async function abrir(id) {
    const { data } = await api.get(`/vehiculos/${id}`);
    setEditId(id);
    setForm({ ...VACIO, ...data, transmision: data.transmision || '', combustible: data.combustible || '', fotos: (data.fotos || []).map((f) => urlFoto(f.data)) });
    setGastos(data.gastos || []);
    setMostrarForm(true);
  }

  async function guardar(e) {
    e.preventDefault(); setError('');
    try {
      const payload = { ...form };
      if (usuario.rol !== 'ADMIN' && usuario.rol !== 'ALMACEN') delete payload.sucursalId;
      delete payload.gastos;
      if (editId) { await api.put(`/vehiculos/${editId}`, payload); }
      else { const { data } = await api.post('/vehiculos', payload); setEditId(data.id); }
      await cargar();
      if (!editId) setMostrarForm(false);
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }

  async function agregarGasto() {
    if (!editId) { setError('Guarda primero el auto para agregar gastos'); return; }
    if (!nuevoGasto.descripcion.trim() || nuevoGasto.monto === '') return;
    const { data } = await api.post(`/vehiculos/${editId}/gastos`, { descripcion: nuevoGasto.descripcion, monto: num(nuevoGasto.monto) });
    setGastos((gs) => [...gs, data]);
    setNuevoGasto({ descripcion: '', monto: '' });
  }
  async function quitarGasto(g) {
    await api.delete(`/vehiculos/${editId}/gastos/${g.id}`);
    setGastos((gs) => gs.filter((x) => x.id !== g.id));
  }

  async function pasarAVenta() {
    setError('');
    try {
      await api.put(`/vehiculos/${editId}/pasar-a-venta`);
      setMostrarForm(false); setEditId(null); setForm(VACIO); setGastos([]);
      await cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo pasar a venta'); }
  }

  return (
    <div>
      <h1>Inventario de compra</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={nuevo}>+ Registrar auto</button>
      </div>

      {mostrarForm && (
        <div className="card">
          <h3>{editId ? 'Editar auto en compra' : 'Nuevo auto'}</h3>
          <form onSubmit={guardar} className="grid" style={{ maxWidth: 820 }}>
            <div className="row">
              <div style={{ flex: 1 }}><label>Año</label><input type="number" value={form.anio} onChange={(e) => set('anio', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Marca</label><input value={form.marca} onChange={(e) => set('marca', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Modelo</label><input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Color</label><input value={form.color || ''} onChange={(e) => set('color', e.target.value)} /></div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}><label>VIN</label><input value={form.vin || ''} maxLength={17} onChange={(e) => set('vin', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Placa</label><input value={form.placa || ''} onChange={(e) => set('placa', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Kilometraje</label><input type="number" value={form.kilometraje || ''} onChange={(e) => set('kilometraje', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Sucursal</label><SelectorSucursal value={form.sucursalId} onChange={(v) => set('sucursalId', v)} /></div>
            </div>

            <h4>Costos (USD)</h4>
            <div className="row">
              <div style={{ flex: 1 }}><label>Precio compra</label><input type="number" value={form.precioCompra} onChange={(e) => set('precioCompra', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Comisión proveedor</label><input type="number" value={form.comisionProveedor} onChange={(e) => set('comisionProveedor', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Transporte</label><input type="number" value={form.transporte} onChange={(e) => set('transporte', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Registro/Placas</label><input type="number" value={form.registroPlacas} onChange={(e) => set('registroPlacas', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Salidas</label><input type="number" value={form.salidas} onChange={(e) => set('salidas', e.target.value)} /></div>
            </div>
            <p><strong>Costo Puesto en México:</strong> ${puestoEnMexico.toLocaleString('es-MX')}</p>

            <h4>Otros costos / gastos</h4>
            {!editId && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Guarda el auto para poder agregar gastos.</p>}
            <table>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td>{g.descripcion}</td>
                    <td>${num(g.monto).toLocaleString('es-MX')}</td>
                    <td><button type="button" className="btn btn-sm" onClick={() => quitarGasto(g)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editId && (
              <div className="row">
                <input placeholder="Descripción" value={nuevoGasto.descripcion} onChange={(e) => setNuevoGasto((n) => ({ ...n, descripcion: e.target.value }))} />
                <input type="number" placeholder="Monto" value={nuevoGasto.monto} onChange={(e) => setNuevoGasto((n) => ({ ...n, monto: e.target.value }))} style={{ maxWidth: 140 }} />
                <button type="button" className="btn btn-sm" onClick={agregarGasto}>Agregar gasto</button>
              </div>
            )}

            <h4>Precio y utilidad (USD)</h4>
            <div className="row">
              <div style={{ flex: 1 }}><label>Precio de venta</label><input type="number" value={form.precioVenta} onChange={(e) => set('precioVenta', e.target.value)} /></div>
            </div>
            <p><strong>Costo total:</strong> ${costoTotal.toLocaleString('es-MX')} &nbsp;|&nbsp; <strong>Utilidad:</strong> ${utilidad.toLocaleString('es-MX')}</p>

            <div><label>Notas</label><textarea rows={2} value={form.notas || ''} onChange={(e) => set('notas', e.target.value)} /></div>
            <div><label>Fotos</label><SubidorImagenes value={form.fotos} onChange={(arr) => set('fotos', arr)} /></div>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn btn-primary" type="submit">{editId ? 'Guardar borrador' : 'Crear'}</button>
              {editId && <button type="button" className="btn btn-primary" onClick={pasarAVenta}>Pasar a venta</button>}
              <button type="button" className="btn" onClick={() => { setMostrarForm(false); setEditId(null); setForm(VACIO); setGastos([]); }}>Cerrar</button>
            </div>
          </form>
        </div>
      )}

      <table>
        <thead><tr><th>Vehículo</th><th>Sucursal</th><th>Precio venta</th><th>Costo total</th><th>Utilidad</th><th>Días en compra</th><th></th></tr></thead>
        <tbody>{lista.map((v) => (
          <tr key={v.id}>
            <td>{v.anio} {v.marca} {v.modelo}</td>
            <td>{v.sucursal?.nombre}</td>
            <td>${num(v.precioVenta).toLocaleString('es-MX')}</td>
            <td>{v.costoTotal != null ? `$${Number(v.costoTotal).toLocaleString('es-MX')}` : '—'}</td>
            <td>{v.utilidad != null ? `$${Number(v.utilidad).toLocaleString('es-MX')}` : '—'}</td>
            <td>{v.diasEnCompra != null ? v.diasEnCompra : '—'}</td>
            <td><button className="btn btn-sm" onClick={() => abrir(v.id)}>Abrir</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build (tras registrar la ruta en Task 11 se prueba completo; aquí solo compila)**

Run: `cd frontend && npm run build`
Expected: el build puede fallar por el import aún no referenciado en rutas; si falla solo por eso, continúa a la Task 11 y vuelve a verificar. El archivo en sí no debe tener errores de sintaxis.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Compra.jsx
git commit -m "feat(ui): pagina de inventario de compra con costeo, gastos y pasar a venta"
```

---

### Task 11: Frontend — Rutas, menú y rol ALMACEN

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/pages/Usuarios.jsx`

**Interfaces:**
- Consumes: la página `Compra` (Task 10).

- [ ] **Step 1: Registrar la ruta de compra y permitir ALMACEN en venta**

En `frontend/src/App.jsx`:

1. Añadir el import:

```jsx
import Compra from './pages/Compra';
```

2. Añadir una constante de roles para compra y la ruta, y permitir que ALMACEN entre al inventario de venta:

```jsx
const COMPRA = ['ADMIN', 'ALMACEN'];
```

```jsx
      <Route path="/compra" element={<Privada><RequireRol roles={COMPRA}><Compra /></RequireRol></Privada>} />
```

3. Cambiar la ruta de `/inventario` para incluir ALMACEN:

```jsx
      <Route path="/inventario" element={<Privada><RequireRol roles={['ADMIN', 'VENDEDOR', 'ALMACEN']}><Inventario /></RequireRol></Privada>} />
```

- [ ] **Step 2: Añadir los enlaces de menú**

En `frontend/src/components/Layout.jsx`, en el grupo `'Operación'`, añadir el inventario de compra para ADMIN/ALMACEN e incluir ALMACEN en el inventario (de venta):

```jsx
  { label: 'Operación', items: [
    { to: '/ventas', label: 'Ventas', roles: ['ADMIN', 'VENDEDOR'] },
    { to: '/compra', label: 'Inventario de compra', roles: ['ADMIN', 'ALMACEN'] },
    { to: '/inventario', label: 'Inventario de venta', roles: ['ADMIN', 'VENDEDOR', 'ALMACEN'] },
    { to: '/clientes', label: 'Clientes', roles: ['ADMIN', 'VENDEDOR'] },
  ] },
```

- [ ] **Step 3: Permitir crear usuarios ALMACEN**

En `frontend/src/pages/Usuarios.jsx`, en el `<select>` de rol, añadir la opción:

```jsx
              <option value="ALMACEN">Almacén</option>
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Layout.jsx frontend/src/pages/Usuarios.jsx
git commit -m "feat(ui): rutas, menu y alta de usuarios para rol ALMACEN e inventario de compra"
```

---

### Task 12: Aplicar a Docker y verificación end-to-end

**Files:** ninguno (despliegue/migración).

- [ ] **Step 1: Reconstruir y migrar**

Run (desde la raíz):

```bash
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
```

Expected: migración aplicada sin error; datos previos de `costoCompra` quedaron en `precioCompra`.

- [ ] **Step 2: Verificación manual**

Abrir `http://localhost:8082`:

1. **ADMIN → Usuarios:** crear un usuario con rol **Almacén**.
2. **Iniciar sesión como ALMACEN:** ver menú con "Inventario de compra" e "Inventario de venta" (sin Ventas/Reportes/etc.).
3. **Inventario de compra:** registrar un auto → guardar borrador → agregar 2 gastos → ver "Costo Puesto en México", "Costo total" y "Utilidad" en vivo → capturar precio de venta → "Pasar a venta". El auto desaparece de compra.
4. **Inventario de venta (ALMACEN):** el auto aparece con utilidad y días en venta.
5. **Iniciar sesión como VENDEDOR:** en inventario de venta NO se ven costos ni utilidad, solo precio; no existe menú de compra; intentar `GET /api/vehiculos` no devuelve campos de costo.
6. **Pasar a venta sin precio:** intentar con precio 0 → mensaje de error.
7. **ADMIN → Reportes:** registrar una venta del auto y confirmar que la utilidad refleja costo total real (incluye los gastos).

- [ ] **Step 3: Commit (si hubo ajustes)**

Si la verificación obligó a algún ajuste, commitearlo. Si no, no hay commit en esta tarea.

---

## Notas de ejecución

- Suite completa de backend tras las Tasks 1–8: `cd backend && npm test`.
- Frontend se valida con `cd frontend && npm run build` (no hay runner de tests).
- El flujo de migración usa `--create-only` + edición manual del SQL para **no perder** los valores de `costoCompra` ni la antigüedad de autos ya en venta.
