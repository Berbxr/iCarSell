# Rangos de Comisión de Vendedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular y mostrar la comisión (MXN) que gana un vendedor por cada venta, según el rango en que cae el precio de lista del auto (USD), con configuración por ADMIN y un reporte semanal por vendedor.

**Architecture:** Modelo `RangoComision` configurable + campo snapshot `Venta.comision`. Una función pura decide la comisión por venta a partir del precio de lista. El snapshot se calcula dentro de la transacción de `crearVenta`. Endpoints solo-ADMIN para editar rangos y para el reporte semanal; el reporte de ventas existente suma comisiones.

**Tech Stack:** Node + Express + Prisma + PostgreSQL (backend, Jest + Supertest con mocks de Prisma), React + Vite + Axios (frontend, sin runner de tests).

## Global Constraints

- **Base del rango:** `Vehiculo.precioVenta` (USD). NUNCA el `total` de la venta ni una suma de ventas.
- **Comisión por venta individual:** cada venta = una comisión. Los totales de reportes son sumas de pagos, nunca recalculan rango sobre acumulado.
- **Snapshot:** la comisión se congela en `Venta.comision` al crear la venta; cambios posteriores de rangos no afectan ventas pasadas.
- **Moneda:** rangos `desdeUsd` en USD, `monto` de comisión en MXN.
- **Defaults de rangos:** `{desdeUsd:0, monto:1000}`, `{desdeUsd:6000, monto:1600}`, `{desdeUsd:10000, monto:2600}`.
- **Selección de rango:** el rango aplicable es el de mayor `desdeUsd` que sea `<=` al precio de lista; si ninguno aplica, comisión = 0.
- **Visibilidad:** comisiones solo para ADMIN (backend y frontend).
- **Semana:** lunes 00:00:00.000 a domingo 23:59:59.999, zona horaria del servidor (`TZ`, default `America/Tijuana`).
- **Tests backend:** mockear `../src/config/prisma`, usar `supertest` + `firmarToken` (ver `tests/reportes.test.js`). Correr con `npm test` (jest --runInBand) desde `backend/`.

---

### Task 1: Modelo de datos, migración, seed y backfill

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migración generada por Prisma en `backend/prisma/migrations/`
- Modify: `backend/prisma/seed.js`

**Interfaces:**
- Produces: modelo Prisma `RangoComision { id, orden, desdeUsd:Float, monto:Float, updatedAt }` y campo `Venta.comision Float @default(0)`. Tras el seed, la tabla `RangoComision` contiene los 3 rangos default y toda `Venta` existente tiene su `comision` calculada.

- [ ] **Step 1: Añadir el modelo y el campo al schema**

En `backend/prisma/schema.prisma`, dentro del `model Venta`, después de la línea `total Float`, agregar:

```prisma
  comision      Float    @default(0)
```

Y al final del archivo (después del `model Auditoria`), agregar:

```prisma
model RangoComision {
  id        Int      @id @default(autoincrement())
  orden     Int
  desdeUsd  Float
  monto     Float
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Levantar la base y crear la migración**

Run (la BD debe estar arriba; `backend/.env` apunta a `localhost:5437`):

```bash
cd backend
docker compose -f ../docker-compose.yml up -d db
npx prisma migrate dev --name agregar_comisiones
```

Expected: crea `backend/prisma/migrations/<timestamp>_agregar_comisiones/migration.sql` con `CREATE TABLE "RangoComision"` y `ALTER TABLE "Venta" ADD COLUMN "comision"`, y regenera el client sin error.

- [ ] **Step 3: Sembrar rangos default y backfillear ventas en el seed**

En `backend/prisma/seed.js`, dentro de `main()` y ANTES del `const existe = await prisma.usuario.findUnique(...)` (para que sea idempotente aunque el admin ya exista), insertar:

```js
  const RANGOS_DEFAULT = [
    { orden: 1, desdeUsd: 0, monto: 1000 },
    { orden: 2, desdeUsd: 6000, monto: 1600 },
    { orden: 3, desdeUsd: 10000, monto: 2600 },
  ];
  if ((await prisma.rangoComision.count()) === 0) {
    await prisma.rangoComision.createMany({ data: RANGOS_DEFAULT });
    console.log('Rangos de comisión por defecto creados.');
  }

  // Backfill: calcular comisión de ventas existentes que aún no la tienen.
  const { calcularComision } = require('../src/utils/comision');
  const rangos = await prisma.rangoComision.findMany();
  const ventasSinComision = await prisma.venta.findMany({
    where: { comision: 0 },
    include: { vehiculo: { select: { precioVenta: true } } },
  });
  for (const v of ventasSinComision) {
    const monto = calcularComision(v.vehiculo?.precioVenta ?? 0, rangos);
    if (monto > 0) await prisma.venta.update({ where: { id: v.id }, data: { comision: monto } });
  }
  if (ventasSinComision.length) console.log(`Backfill de comisión en ${ventasSinComision.length} venta(s).`);
```

> Nota: este paso depende de `backend/src/utils/comision.js`, creado en la Task 2. Si ejecutas el seed antes de la Task 2, fallará el `require`. Ejecuta la Task 2 primero o corre el seed después.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed.js
git commit -m "feat: modelo RangoComision, snapshot Venta.comision, seed y backfill"
```

---

### Task 2: Función pura `calcularComision`

**Files:**
- Create: `backend/src/utils/comision.js`
- Test: `backend/tests/comision.test.js`

**Interfaces:**
- Produces: `calcularComision(precioVentaUsd, rangos) -> number` donde `rangos` es un array de objetos con `{ desdeUsd, monto }`. Devuelve el `monto` del rango de mayor `desdeUsd` que sea `<= precioVentaUsd`, o `0` si ninguno aplica o la lista está vacía.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/comision.test.js`:

```js
const { calcularComision } = require('../src/utils/comision');

const RANGOS = [
  { desdeUsd: 0, monto: 1000 },
  { desdeUsd: 6000, monto: 1600 },
  { desdeUsd: 10000, monto: 2600 },
];

describe('calcularComision', () => {
  test.each([
    [0, 1000],
    [1, 1000],
    [5999, 1000],
    [6000, 1600],
    [9999, 1600],
    [10000, 2600],
    [10500, 2600],
  ])('precio %i USD => %i MXN', (precio, esperado) => {
    expect(calcularComision(precio, RANGOS)).toBe(esperado);
  });

  test('lista de rangos vacía => 0', () => {
    expect(calcularComision(8000, [])).toBe(0);
  });

  test('precio por debajo del menor desdeUsd => 0', () => {
    expect(calcularComision(50, [{ desdeUsd: 100, monto: 500 }])).toBe(0);
  });

  test('no depende del orden del array de entrada', () => {
    const desordenados = [
      { desdeUsd: 10000, monto: 2600 },
      { desdeUsd: 0, monto: 1000 },
      { desdeUsd: 6000, monto: 1600 },
    ];
    expect(calcularComision(7000, desordenados)).toBe(1600);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/comision.test.js`
Expected: FAIL con "Cannot find module '../src/utils/comision'".

- [ ] **Step 3: Implementar la función**

Crear `backend/src/utils/comision.js`:

```js
// Devuelve la comisión (MXN) del rango aplicable al precio de lista (USD).
// El rango aplicable es el de mayor desdeUsd que sea <= precioVentaUsd.
function calcularComision(precioVentaUsd, rangos) {
  if (!Array.isArray(rangos) || rangos.length === 0) return 0;
  const precio = Number(precioVentaUsd) || 0;
  const aplicables = rangos
    .filter((r) => precio >= r.desdeUsd)
    .sort((a, b) => a.desdeUsd - b.desdeUsd);
  if (aplicables.length === 0) return 0;
  return aplicables[aplicables.length - 1].monto;
}

module.exports = { calcularComision };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/comision.test.js`
Expected: PASS (todos los casos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/comision.js backend/tests/comision.test.js
git commit -m "feat: funcion pura calcularComision con tests de bordes"
```

---

### Task 3: Snapshot de comisión en `crearVenta`

**Files:**
- Modify: `backend/src/services/ventas.service.js`
- Test: `backend/tests/ventas.service.test.js`

**Interfaces:**
- Consumes: `calcularComision` de la Task 2.
- Produces: `crearVenta(...)` ahora guarda `comision` (number) en la venta creada, calculada con `vehiculo.precioVenta` y los rangos vigentes (`tx.rangoComision.findMany()`).

- [ ] **Step 1: Actualizar el test (añadir mock de rangos y aserción de comisión)**

En `backend/tests/ventas.service.test.js`, en el `jest.mock` del inicio, añadir `rangoComision` al objeto `tx`:

```js
    venta: { create: jest.fn() },
    rangoComision: { findMany: jest.fn().mockResolvedValue([
      { desdeUsd: 0, monto: 1000 },
      { desdeUsd: 6000, monto: 1600 },
      { desdeUsd: 10000, monto: 2600 },
    ]) },
```

Y añadir un test nuevo dentro del `describe('crearVenta', ...)`:

```js
  test('calcula y guarda la comisión según el precio de lista del vehículo', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, estado: 'DISPONIBLE', precioVenta: 12000 });
    tx.sucursal.update.mockResolvedValue({ id: 2, serieFolio: 'A', consecutivoFolio: 1 });
    tx.venta.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

    const venta = await crearVenta({ sucursalId: 2, vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 11000 });

    expect(venta.comision).toBe(2600); // precioVenta 12000 USD => rango 3
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/ventas.service.test.js`
Expected: FAIL — `venta.comision` es `undefined` (aún no se guarda).

- [ ] **Step 3: Implementar el cálculo del snapshot**

En `backend/src/services/ventas.service.js`, añadir el require arriba:

```js
const { calcularComision } = require('../utils/comision');
```

Dentro de `crearVenta`, después de obtener el `folio` y antes de `tx.venta.create`, añadir:

```js
    const rangos = await tx.rangoComision.findMany();
    const comision = calcularComision(vehiculo.precioVenta, rangos);
```

Y en el objeto `data` de `tx.venta.create`, añadir `comision`:

```js
        total: Number(total), comision, observaciones: observaciones && observaciones.trim() ? observaciones : 'SIN GARANTÍA',
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npx jest tests/ventas.service.test.js`
Expected: PASS (los 3 tests previos + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ventas.service.js backend/tests/ventas.service.test.js
git commit -m "feat: snapshot de comision al crear venta"
```

---

### Task 4: API de configuración de rangos (GET/PUT, solo ADMIN)

**Files:**
- Modify: `backend/src/controllers/configuracion.controller.js`
- Modify: `backend/src/routes/configuracion.routes.js`
- Test: `backend/tests/configuracion.comisiones.test.js`

**Interfaces:**
- Produces:
  - `GET /api/configuracion/comisiones` → `RangoComision[]` ordenado por `desdeUsd` asc.
  - `PUT /api/configuracion/comisiones` (ADMIN) → body `{ rangos: [{ desdeUsd:number, monto:number }, ...] }`. Reemplaza el conjunto completo; responde con la lista resultante. Valida: array no vacío, `desdeUsd>=0`, `monto>=0`, sin `desdeUsd` duplicados; normaliza `orden` por `desdeUsd` asc.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/configuracion.comisiones.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  rangoComision: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  auditoria: { create: jest.fn() },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Config comisiones', () => {
  test('GET devuelve los rangos', async () => {
    prisma.rangoComision.findMany.mockResolvedValue([{ id: 1, orden: 1, desdeUsd: 0, monto: 1000 }]);
    const res = await request(app).get('/api/configuracion/comisiones').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('PUT reemplaza los rangos (ADMIN)', async () => {
    prisma.rangoComision.findMany.mockResolvedValue([
      { id: 1, orden: 1, desdeUsd: 0, monto: 1000 },
      { id: 2, orden: 2, desdeUsd: 6000, monto: 1600 },
    ]);
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ rangos: [{ desdeUsd: 6000, monto: 1600 }, { desdeUsd: 0, monto: 1000 }] });
    expect(res.status).toBe(200);
    expect(prisma.rangoComision.deleteMany).toHaveBeenCalled();
    expect(prisma.rangoComision.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [
        { orden: 1, desdeUsd: 0, monto: 1000 },
        { orden: 2, desdeUsd: 6000, monto: 1600 },
      ] })
    );
  });

  test('PUT rechaza desdeUsd duplicados', async () => {
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ rangos: [{ desdeUsd: 0, monto: 1000 }, { desdeUsd: 0, monto: 1600 }] });
    expect(res.status).toBe(400);
  });

  test('PUT rechaza lista vacía', async () => {
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenAdmin}`).send({ rangos: [] });
    expect(res.status).toBe(400);
  });

  test('PUT prohibido para VENDEDOR', async () => {
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenVend}`)
      .send({ rangos: [{ desdeUsd: 0, monto: 1000 }] });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/configuracion.comisiones.test.js`
Expected: FAIL (404 en las rutas; aún no existen).

- [ ] **Step 3: Implementar controller**

En `backend/src/controllers/configuracion.controller.js`, añadir dos funciones antes del `module.exports`:

```js
async function obtenerComisiones(req, res, next) {
  try {
    const rangos = await prisma.rangoComision.findMany({ orderBy: { desdeUsd: 'asc' } });
    res.json(rangos);
  } catch (e) { next(e); }
}

async function actualizarComisiones(req, res, next) {
  try {
    const entrada = Array.isArray(req.body.rangos) ? req.body.rangos : null;
    if (!entrada || entrada.length === 0) throw new ApiError(400, 'Debe enviar al menos un rango');
    const normalizados = entrada.map((r) => ({ desdeUsd: Number(r.desdeUsd), monto: Number(r.monto) }));
    for (const r of normalizados) {
      if (!Number.isFinite(r.desdeUsd) || r.desdeUsd < 0) throw new ApiError(400, 'desdeUsd debe ser un número >= 0');
      if (!Number.isFinite(r.monto) || r.monto < 0) throw new ApiError(400, 'monto debe ser un número >= 0');
    }
    const llaves = new Set(normalizados.map((r) => r.desdeUsd));
    if (llaves.size !== normalizados.length) throw new ApiError(400, 'No puede haber dos rangos con el mismo desdeUsd');
    normalizados.sort((a, b) => a.desdeUsd - b.desdeUsd);
    const data = normalizados.map((r, i) => ({ orden: i + 1, desdeUsd: r.desdeUsd, monto: r.monto }));

    await prisma.$transaction([
      prisma.rangoComision.deleteMany({}),
      prisma.rangoComision.createMany({ data }),
    ]);
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_COMISIONES', entidad: 'RangoComision', ip: req.ip });
    res.json(await prisma.rangoComision.findMany({ orderBy: { desdeUsd: 'asc' } }));
  } catch (e) { next(e); }
}
```

Y exportarlas:

```js
module.exports = { obtener, actualizar, obtenerComisiones, actualizarComisiones };
```

- [ ] **Step 4: Implementar rutas**

En `backend/src/routes/configuracion.routes.js`, antes de `module.exports`, añadir:

```js
router.get('/comisiones', ctrl.obtenerComisiones);
router.put('/comisiones', rbac('ADMIN'), ctrl.actualizarComisiones);
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/configuracion.comisiones.test.js`
Expected: PASS (los 5 casos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/configuracion.controller.js backend/src/routes/configuracion.routes.js backend/tests/configuracion.comisiones.test.js
git commit -m "feat: API de configuracion de rangos de comision (GET/PUT solo ADMIN)"
```

---

### Task 5: Comisión en el reporte de ventas (solo ADMIN)

**Files:**
- Modify: `backend/src/services/reportes.service.js`
- Modify: `backend/src/controllers/reportes.controller.js`
- Test: `backend/tests/reportes.test.js`

**Interfaces:**
- Consumes: `Venta.comision` (campo escalar ya presente en las filas de `findMany`).
- Produces: `reportes.ventas({ sucursalId, desde, hasta, esAdmin })`. Si `esAdmin`, cada fila conserva `comision` y `totales` incluye `comision` (suma). Si no, las filas no exponen `comision` y `totales` no incluye `comision`.

- [ ] **Step 1: Añadir el test que falla**

En `backend/tests/reportes.test.js`, dentro del `describe('Reportes', ...)`, añadir:

```js
  test('GET /api/reportes/ventas suma comisiones para ADMIN', async () => {
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, total: 150000, comision: 2600, fecha: new Date(), vehiculo: { costoCompra: 100000, precioVenta: 150000 }, cliente: { nombre: 'Luis' }, empleado: { nombre: 'Ana' } },
      { id: 2, total: 80000, comision: 1000, fecha: new Date(), vehiculo: { costoCompra: 60000, precioVenta: 80000 }, cliente: { nombre: 'Pedro' }, empleado: { nombre: 'Ana' } },
    ]);
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.totales.comision).toBe(3600);
    expect(res.body.ventas[0].comision).toBe(2600);
  });

  test('GET /api/reportes/ventas oculta comisiones a VENDEDOR', async () => {
    const tokenVend = firmarToken({ id: 9, rol: 'VENDEDOR', sucursalId: 1 });
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, total: 150000, comision: 2600, fecha: new Date(), vehiculo: { costoCompra: 100000, precioVenta: 150000 }, cliente: { nombre: 'Luis' }, empleado: { nombre: 'Ana' } },
    ]);
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
    expect(res.body.totales.comision).toBeUndefined();
    expect(res.body.ventas[0].comision).toBeUndefined();
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/reportes.test.js`
Expected: FAIL — `totales.comision` es `undefined` para ADMIN.

- [ ] **Step 3: Implementar en el service**

En `backend/src/services/reportes.service.js`, reemplazar la firma y el cuerpo de `ventas` por:

```js
async function ventas({ sucursalId, desde, hasta, esAdmin }) {
  const where = {};
  if (sucursalId !== undefined) where.sucursalId = sucursalId;
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }
  const lista = await prisma.venta.findMany({
    where, orderBy: { fecha: 'desc' },
    include: { vehiculo: true, cliente: { select: { nombre: true } }, empleado: { select: { nombre: true, apellidos: true } }, sucursal: { select: { nombre: true } } },
  });
  const totales = lista.reduce((a, v) => ({
    monto: a.monto + v.total,
    cantidad: a.cantidad + 1,
    utilidad: a.utilidad + (v.vehiculo ? v.vehiculo.precioVenta - v.vehiculo.costoCompra : 0),
    comision: a.comision + (v.comision || 0),
  }), { monto: 0, cantidad: 0, utilidad: 0, comision: 0 });

  if (!esAdmin) {
    const sinComision = lista.map(({ comision, ...resto }) => resto);
    const { comision, ...totalesSinComision } = totales;
    return { ventas: sinComision, totales: totalesSinComision };
  }
  return { ventas: lista, totales };
}
```

- [ ] **Step 4: Pasar `esAdmin` desde el controller**

En `backend/src/controllers/reportes.controller.js`, en la función `ventas`, cambiar la llamada al service por:

```js
    res.json(await reportes.ventas({ sucursalId, desde: req.query.desde, hasta: req.query.hasta, esAdmin: req.usuario.rol === 'ADMIN' }));
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd backend && npx jest tests/reportes.test.js`
Expected: PASS (incluido el caso original de utilidad).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/reportes.service.js backend/src/controllers/reportes.controller.js backend/tests/reportes.test.js
git commit -m "feat: comision en reporte de ventas (solo ADMIN)"
```

---

### Task 6: Utilidad `rangoSemana` y reporte de comisiones semanal (backend)

**Files:**
- Create: `backend/src/utils/semana.js`
- Modify: `backend/src/services/reportes.service.js`
- Modify: `backend/src/controllers/reportes.controller.js`
- Modify: `backend/src/routes/reportes.routes.js`
- Test: `backend/tests/semana.test.js`
- Test: `backend/tests/reportes.comisiones.test.js`

**Interfaces:**
- Produces:
  - `rangoSemana(fechaRef) -> { inicio: Date, fin: Date }` — lunes 00:00:00.000 a domingo 23:59:59.999 (hora local del servidor) de la semana que contiene `fechaRef`.
  - `reportes.comisiones({ sucursalId, fecha }) -> { inicio, fin, vendedores, totalGeneral }` donde `vendedores` es `[{ empleadoId, nombre, apellidos, ventas: [{ id, folio, vehiculo, comision }], total }]`.
  - `GET /api/reportes/comisiones?fecha=YYYY-MM-DD&sucursalId` (ADMIN).

- [ ] **Step 1: Escribir el test de `rangoSemana` que falla**

Crear `backend/tests/semana.test.js`:

```js
const { rangoSemana } = require('../src/utils/semana');

describe('rangoSemana', () => {
  test('un miércoles cae en su semana lun-dom', () => {
    const { inicio, fin } = rangoSemana(new Date(2026, 5, 24)); // mié 24 jun 2026
    expect(inicio.getDay()).toBe(1); // lunes
    expect(fin.getDay()).toBe(0);    // domingo
    expect(inicio.getDate()).toBe(22);
    expect(fin.getDate()).toBe(28);
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(fin.getHours()).toBe(23);
    expect(fin.getMinutes()).toBe(59);
  });

  test('un domingo pertenece a la semana que termina ese día', () => {
    const { inicio, fin } = rangoSemana(new Date(2026, 5, 28)); // dom 28 jun
    expect(inicio.getDate()).toBe(22); // lunes 22
    expect(fin.getDate()).toBe(28);    // domingo 28
  });

  test('un lunes es el inicio de su propia semana', () => {
    const { inicio } = rangoSemana(new Date(2026, 5, 22)); // lun 22 jun
    expect(inicio.getDate()).toBe(22);
    expect(inicio.getHours()).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx jest tests/semana.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `rangoSemana`**

Crear `backend/src/utils/semana.js`:

```js
// Devuelve { inicio, fin } de la semana lunes-domingo (hora local) que contiene fechaRef.
function rangoSemana(fechaRef) {
  const base = fechaRef ? new Date(fechaRef) : new Date();
  const dia = base.getDay(); // 0=domingo .. 6=sábado
  const diffALunes = dia === 0 ? -6 : 1 - dia;
  const inicio = new Date(base);
  inicio.setDate(base.getDate() + diffALunes);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

module.exports = { rangoSemana };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/semana.test.js`
Expected: PASS.

- [ ] **Step 5: Escribir el test del reporte de comisiones que falla**

Crear `backend/tests/reportes.comisiones.test.js`:

```js
jest.mock('../src/config/prisma', () => ({
  venta: { findMany: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Reporte de comisiones', () => {
  test('agrupa por vendedor y suma total general', async () => {
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, folio: 'A-0001', comision: 1000, empleadoId: 3, empleado: { id: 3, nombre: 'Ana', apellidos: 'López' }, vehiculo: { anio: 2020, marca: 'Nissan', modelo: 'Versa' } },
      { id: 2, folio: 'A-0002', comision: 2600, empleadoId: 3, empleado: { id: 3, nombre: 'Ana', apellidos: 'López' }, vehiculo: { anio: 2021, marca: 'Kia', modelo: 'Rio' } },
      { id: 3, folio: 'A-0003', comision: 1600, empleadoId: 4, empleado: { id: 4, nombre: 'Beto', apellidos: 'Ruiz' }, vehiculo: { anio: 2019, marca: 'VW', modelo: 'Jetta' } },
    ]);
    const res = await request(app).get('/api/reportes/comisiones?fecha=2026-06-24').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.totalGeneral).toBe(5200);
    const ana = res.body.vendedores.find((v) => v.empleadoId === 3);
    expect(ana.total).toBe(3600);
    expect(ana.ventas).toHaveLength(2);
    expect(res.body.inicio).toBeDefined();
    expect(res.body.fin).toBeDefined();
  });

  test('filtra por la semana de la fecha (gte inicio, lte fin)', async () => {
    prisma.venta.findMany.mockResolvedValue([]);
    await request(app).get('/api/reportes/comisiones?fecha=2026-06-24').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.venta.findMany.mock.calls[0][0];
    expect(arg.where.fecha.gte).toBeInstanceOf(Date);
    expect(arg.where.fecha.lte).toBeInstanceOf(Date);
    expect(arg.where.fecha.lte.getTime()).toBeGreaterThan(arg.where.fecha.gte.getTime());
  });

  test('prohibido para VENDEDOR', async () => {
    const res = await request(app).get('/api/reportes/comisiones').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `cd backend && npx jest tests/reportes.comisiones.test.js`
Expected: FAIL (404; ruta inexistente).

- [ ] **Step 7: Implementar el service `comisiones`**

En `backend/src/services/reportes.service.js`, añadir el require arriba:

```js
const { rangoSemana } = require('../utils/semana');
```

Y añadir la función antes del `module.exports`:

```js
async function comisiones({ sucursalId, fecha }) {
  const { inicio, fin } = rangoSemana(fecha ? new Date(fecha) : new Date());
  const where = { fecha: { gte: inicio, lte: fin } };
  if (sucursalId !== undefined) where.sucursalId = sucursalId;
  const lista = await prisma.venta.findMany({
    where, orderBy: { fecha: 'asc' },
    include: { vehiculo: { select: { anio: true, marca: true, modelo: true } }, empleado: { select: { id: true, nombre: true, apellidos: true } } },
  });
  const porVendedor = new Map();
  for (const v of lista) {
    if (!porVendedor.has(v.empleadoId)) {
      porVendedor.set(v.empleadoId, { empleadoId: v.empleadoId, nombre: v.empleado?.nombre || '', apellidos: v.empleado?.apellidos || '', ventas: [], total: 0 });
    }
    const g = porVendedor.get(v.empleadoId);
    g.ventas.push({ id: v.id, folio: v.folio, vehiculo: `${v.vehiculo?.anio ?? ''} ${v.vehiculo?.marca ?? ''} ${v.vehiculo?.modelo ?? ''}`.trim(), comision: v.comision || 0 });
    g.total += v.comision || 0;
  }
  const vendedores = [...porVendedor.values()];
  const totalGeneral = vendedores.reduce((a, g) => a + g.total, 0);
  return { inicio, fin, vendedores, totalGeneral };
}
```

Actualizar el `module.exports` para incluir `comisiones`:

```js
module.exports = { ventas, inventario, comisiones };
```

- [ ] **Step 8: Implementar controller y ruta**

En `backend/src/controllers/reportes.controller.js`, añadir antes del `module.exports`:

```js
async function comisiones(req, res, next) {
  try {
    const sucursalId = resolverSucursalLectura(req);
    res.json(await reportes.comisiones({ sucursalId, fecha: req.query.fecha }));
  } catch (e) { next(e); }
}
```

Y actualizar el export:

```js
module.exports = { ventas, inventario, comisiones };
```

En `backend/src/routes/reportes.routes.js`, añadir el require de rbac y la ruta:

```js
const rbac = require('../middlewares/rbac');
```

```js
router.get('/comisiones', rbac('ADMIN'), ctrl.comisiones);
```

- [ ] **Step 9: Correr y verificar que pasa**

Run: `cd backend && npx jest tests/reportes.comisiones.test.js`
Expected: PASS (los 3 casos).

- [ ] **Step 10: Correr toda la suite backend**

Run: `cd backend && npm test`
Expected: PASS (todas las suites, incluidas las nuevas).

- [ ] **Step 11: Commit**

```bash
git add backend/src/utils/semana.js backend/src/services/reportes.service.js backend/src/controllers/reportes.controller.js backend/src/routes/reportes.routes.js backend/tests/semana.test.js backend/tests/reportes.comisiones.test.js
git commit -m "feat: reporte de comisiones semanal (rangoSemana + endpoint ADMIN)"
```

---

### Task 7: Frontend — Configuración de rangos de comisión

**Files:**
- Modify: `frontend/src/pages/Configuracion.jsx`

**Interfaces:**
- Consumes: `GET /configuracion/comisiones`, `PUT /configuracion/comisiones`.

> El frontend no tiene runner de tests; la verificación es `npm run build` + revisión manual.

- [ ] **Step 1: Añadir estado y carga de rangos**

En `frontend/src/pages/Configuracion.jsx`, añadir estado para rangos y cargarlos. Dentro del componente, junto a los `useState` existentes:

```jsx
  const [rangos, setRangos] = useState([]);
  const [okRangos, setOkRangos] = useState(false);
  const [errRangos, setErrRangos] = useState('');
```

En el `useEffect` existente (o uno nuevo), cargar los rangos:

```jsx
  useEffect(() => { api.get('/configuracion/comisiones').then((r) => setRangos(r.data.map((x) => ({ desdeUsd: x.desdeUsd, monto: x.monto })))); }, []);
```

- [ ] **Step 2: Añadir helpers de edición y guardado**

Dentro del componente, añadir:

```jsx
  function setRango(i, k, v) { setRangos((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r))); }
  function agregarRango() { setRangos((rs) => [...rs, { desdeUsd: 0, monto: 0 }]); }
  function quitarRango(i) { setRangos((rs) => rs.filter((_, idx) => idx !== i)); }

  async function guardarRangos(e) {
    e.preventDefault(); setErrRangos(''); setOkRangos(false);
    try {
      const payload = rangos.map((r) => ({ desdeUsd: Number(r.desdeUsd), monto: Number(r.monto) }));
      const r = await api.put('/configuracion/comisiones', { rangos: payload });
      setRangos(r.data.map((x) => ({ desdeUsd: x.desdeUsd, monto: x.monto })));
      setOkRangos(true);
    } catch (err) { setErrRangos(err.response?.data?.error || 'Error al guardar rangos'); }
  }
```

- [ ] **Step 3: Renderizar la sección de rangos**

Antes del `</div>` de cierre del componente (después de la `card` existente), añadir:

```jsx
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Rangos de comisión</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          La comisión (MXN) se asigna por venta según el precio de lista del auto (USD). Se aplica el rango de mayor "Desde (USD)" que sea menor o igual al precio.
        </p>
        <form onSubmit={guardarRangos}>
          <table>
            <thead><tr><th>Desde (USD)</th><th>Comisión (MXN)</th><th></th></tr></thead>
            <tbody>
              {rangos.map((r, i) => (
                <tr key={i}>
                  <td><input type="number" min="0" step="1" value={r.desdeUsd} onChange={(e) => setRango(i, 'desdeUsd', e.target.value)} style={{ maxWidth: 140 }} /></td>
                  <td><input type="number" min="0" step="1" value={r.monto} onChange={(e) => setRango(i, 'monto', e.target.value)} style={{ maxWidth: 140 }} /></td>
                  <td><button type="button" className="btn btn-sm" onClick={() => quitarRango(i)}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={agregarRango}>Agregar rango</button>
            <button type="submit" className="btn btn-primary">Guardar rangos</button>
          </div>
          {errRangos && <p className="error">{errRangos}</p>}
          {okRangos && <p style={{ color: 'var(--ok)' }}>Rangos guardados.</p>}
        </form>
      </div>
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Configuracion.jsx
git commit -m "feat(ui): editor de rangos de comision en Configuracion"
```

---

### Task 8: Frontend — Columna comisión en Reportes

**Files:**
- Modify: `frontend/src/pages/Reportes.jsx`

- [ ] **Step 1: Añadir KPI de comisiones**

En `frontend/src/pages/Reportes.jsx`, dentro del bloque `<div className="kpis">`, después del KPI de Utilidad, añadir (solo se muestra si el backend devolvió `comision`):

```jsx
            {ventas.totales.comision !== undefined && (
              <div className="kpi"><h3>Comisiones</h3><div className="valor">${ventas.totales.comision.toLocaleString('es-MX')}</div></div>
            )}
```

- [ ] **Step 2: Añadir la columna a la tabla**

En el `<thead>` de la tabla de ventas, añadir `<th>Comisión</th>` después de `<th>Utilidad</th>`. En cada fila (`<tbody>`), después de la celda de Utilidad, añadir:

```jsx
                <td>{v.comision !== undefined ? `$${Number(v.comision).toLocaleString('es-MX')}` : '—'}</td>
```

- [ ] **Step 3: Incluir comisión en el CSV**

En `exportarCSV`, añadir `'Comisión'` al final del encabezado y `v.comision ?? 0` al final de cada fila:

```jsx
    const filas = [['Folio', 'Fecha', 'Vehículo', 'Cliente', 'Vendedor', 'Total', 'Utilidad', 'Comisión']];
    ventas.ventas.forEach((v) => filas.push([
      v.folio, new Date(v.fecha).toLocaleDateString('es-MX'),
      `${v.vehiculo?.anio} ${v.vehiculo?.marca} ${v.vehiculo?.modelo}`,
      v.cliente?.nombre, `${v.empleado?.nombre || ''} ${v.empleado?.apellidos || ''}`,
      v.total, (v.vehiculo ? v.vehiculo.precioVenta - v.vehiculo.costoCompra : 0), v.comision ?? 0,
    ]));
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Reportes.jsx
git commit -m "feat(ui): columna y total de comision en Reportes"
```

---

### Task 9: Frontend — Página de comisiones por semana

**Files:**
- Create: `frontend/src/pages/Comisiones.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Consumes: `GET /reportes/comisiones?fecha=YYYY-MM-DD&sucursalId`.

- [ ] **Step 1: Crear la página**

Crear `frontend/src/pages/Comisiones.jsx`:

```jsx
import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';

// Devuelve 'YYYY-MM-DD' (local) de la fecha dada.
function iso(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function Comisiones() {
  const [sucursalId, setSucursalId] = useState(undefined);
  const [ref, setRef] = useState(new Date()); // fecha de referencia de la semana
  const [data, setData] = useState(null);

  function moverSemana(dias) {
    setRef((r) => { const n = new Date(r); n.setDate(r.getDate() + dias); return n; });
  }

  async function cargar() {
    const p = new URLSearchParams();
    p.set('fecha', iso(ref));
    if (sucursalId) p.set('sucursalId', sucursalId);
    const r = await api.get(`/reportes/comisiones?${p.toString()}`);
    setData(r.data);
  }
  useEffect(() => { cargar(); }, [sucursalId, ref]);

  const fmtRango = data
    ? `${new Date(data.inicio).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} – ${new Date(data.fin).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}`
    : '';

  return (
    <div>
      <h1>Comisiones por semana</h1>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button className="btn btn-sm" onClick={() => moverSemana(-7)}>‹ Anterior</button>
        <strong style={{ minWidth: 220, textAlign: 'center' }}>{fmtRango}</strong>
        <button className="btn btn-sm" onClick={() => moverSemana(7)}>Siguiente ›</button>
        <button className="btn btn-sm" onClick={() => setRef(new Date())}>Semana actual</button>
        <SelectorSucursal value={sucursalId} onChange={setSucursalId} incluirTodas />
      </div>

      {data && (
        <>
          <div className="kpis">
            <div className="kpi"><h3>Total a pagar</h3><div className="valor">${data.totalGeneral.toLocaleString('es-MX')}</div></div>
            <div className="kpi"><h3>Vendedores con ventas</h3><div className="valor">{data.vendedores.length}</div></div>
          </div>

          {data.vendedores.length === 0 && <p style={{ color: 'var(--muted)' }}>Sin ventas en esta semana.</p>}

          {data.vendedores.map((v) => (
            <div className="card" key={v.empleadoId} style={{ marginBottom: 14 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <h2 style={{ flex: 1 }}>{v.nombre} {v.apellidos}</h2>
                <strong>Total: ${v.total.toLocaleString('es-MX')}</strong>
              </div>
              <table>
                <thead><tr><th>Folio</th><th>Vehículo</th><th>Comisión</th></tr></thead>
                <tbody>{v.ventas.map((venta) => (
                  <tr key={venta.id}>
                    <td>{venta.folio}</td><td>{venta.vehiculo}</td>
                    <td>${Number(venta.comision).toLocaleString('es-MX')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Registrar la ruta (solo ADMIN)**

En `frontend/src/App.jsx`, añadir el import:

```jsx
import Comisiones from './pages/Comisiones';
```

Y la ruta, junto a la de `/reportes`:

```jsx
      <Route path="/comisiones" element={<Privada><RequireRol roles={SOLO_ADMIN}><Comisiones /></RequireRol></Privada>} />
```

- [ ] **Step 3: Añadir el enlace al menú**

En `frontend/src/components/Layout.jsx`, en el grupo `'Administración'`, después del item de `/reportes`, añadir:

```jsx
    { to: '/comisiones', label: 'Comisiones', roles: ['ADMIN'] },
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Comisiones.jsx frontend/src/App.jsx frontend/src/components/Layout.jsx
git commit -m "feat(ui): pagina de comisiones por semana con selector"
```

---

### Task 10: Aplicar a Docker y verificación end-to-end

**Files:** ninguno (operación de despliegue/migración).

- [ ] **Step 1: Aplicar migración y seed, reconstruir contenedores**

Run (desde la raíz del proyecto):

```bash
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend node prisma/seed.js
```

Expected: migración aplicada; seed reporta "Rangos de comisión por defecto creados" y, si había ventas, "Backfill de comisión en N venta(s)".

- [ ] **Step 2: Verificación manual**

Abrir `http://localhost:8082`, entrar como ADMIN y verificar:
1. **Configuración → Rangos de comisión:** se ven los 3 rangos default; editar un monto y guardar persiste.
2. **Registrar una venta** de un auto con `precioVenta` >= 10000 USD y confirmar (en Reportes) que su comisión es 2600.
3. **Reportes:** aparece KPI "Comisiones", la columna "Comisión" y el CSV la incluye.
4. **Comisiones:** la semana actual muestra la venta recién registrada bajo su vendedor; las flechas ‹ › cambian de semana; "Total a pagar" suma correctamente.
5. Iniciar sesión como VENDEDOR: no aparece el menú "Comisiones" y el reporte de ventas no muestra comisión.

- [ ] **Step 3: Commit (si hubo ajustes)**

Si la verificación obligó a algún ajuste, commitearlo con un mensaje descriptivo. Si no, no hay commit en esta tarea.

---

## Notas de ejecución

- Correr la suite completa de backend tras las Tasks 1–6: `cd backend && npm test`.
- El frontend se valida con `cd frontend && npm run build` (no hay runner de tests).
- Mensajes de commit terminan con la convención del repo si aplica; este plan usa prefijos `feat:`/`feat(ui):` siguiendo el historial existente.
