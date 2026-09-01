# Alerta de VIN duplicado en inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir registrar dos vehículos con el mismo VIN, avisando al usuario cuál vehículo ya lo tiene.

**Architecture:** Validación en tres capas: normalización + chequeo en el controlador de backend (fuente de verdad, error 409), restricción `@unique` en Postgres como respaldo contra condiciones de carrera, y aviso en vivo en el formulario del frontend. El VIN es opcional: la validación solo aplica cuando se captura un VIN no vacío.

**Tech Stack:** Node/Express, Prisma + PostgreSQL, React (Vite), Jest + supertest (tests unitarios con prisma mockeado).

## Global Constraints

- El VIN se normaliza a **mayúsculas y sin espacios** (`trim().toUpperCase()`) al guardar; un VIN vacío se persiste como `null` (no como `''`), para que múltiples vehículos sin VIN no choquen con `@unique`.
- Alcance de unicidad: **global** (todas las sucursales, todos los estados incluido `VENDIDO`).
- Comportamiento ante duplicado: **bloquear** (rechazar el guardado).
- El endpoint `GET /vehiculos/vin-existe` debe registrarse **antes** de `router.get('/:id')` para no ser capturado como `:id`.
- Los tests del backend mockean `prisma` con `jest.mock` al inicio de cada archivo; hay que añadir `findFirst` al mock.
- Correr tests: desde `backend/`, `npm test` (jest --runInBand). Un test individual: `npx jest tests/vehiculos.test.js -t "<nombre>"`.

**Estado verificado de la BD (2026-07-08):** 5 vehículos, los 5 con VIN, 0 vacíos, 0 duplicados. La migración `@unique` puede aplicarse sin limpieza previa.

---

## File Structure

- **Modificar** `backend/src/controllers/vehiculos.controller.js` — normalizar VIN en `datosBase()`, nueva función `validarVinUnico()`, nuevo handler `vinExiste()`, llamar la validación en `crear()`/`actualizar()`, exportar `vinExiste`.
- **Modificar** `backend/src/routes/vehiculos.routes.js` — registrar `GET /vin-existe` antes de `/:id`.
- **Modificar** `backend/prisma/schema.prisma` — `vin String? @unique`.
- **Modificar** `backend/tests/vehiculos.test.js` — añadir `findFirst` al mock y casos de VIN duplicado/normalización/endpoint.
- **Modificar** `frontend/src/pages/Compra.jsx` — estado `vinAviso`, función `verificarVin()`, `onBlur` en el input de VIN, render del aviso.

El orden de tareas es: backend lógica → rutas → tests backend → migración BD → frontend. Cada tarea deja un entregable probable de forma independiente.

---

## Task 1: Normalización de VIN y validación de unicidad en el backend

**Files:**
- Modify: `backend/src/controllers/vehiculos.controller.js`
- Modify: `backend/tests/vehiculos.test.js`

**Interfaces:**
- Consumes: `prisma.vehiculo.findFirst`, `ApiError` (ya importado en el controlador).
- Produces:
  - `datosBase(body)` — ahora normaliza `vin` a mayúsculas/`null`.
  - `async validarVinUnico(vin, idExcluir)` — lanza `ApiError(409, ...)` si otro vehículo (id ≠ `idExcluir`) tiene ese `vin`; no hace nada si `vin` es falsy.

- [ ] **Step 1: Añadir `findFirst` al mock de prisma en el test**

En `backend/tests/vehiculos.test.js`, dentro del objeto `vehiculo` del mock (línea ~3), añadir `findFirst`:

```js
jest.mock('../src/config/prisma', () => {
  const prisma = {
    vehiculo: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    vehiculoFoto: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
    auditoria: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn(async (fn) => fn(prisma));
  return prisma;
});
```

- [ ] **Step 2: Escribir los tests que fallan (VIN duplicado y normalización)**

Añadir dentro del `describe('Vehiculos', ...)` en `backend/tests/vehiculos.test.js`:

```js
test('POST con VIN ya existente => 409', async () => {
  prisma.vehiculo.findFirst.mockResolvedValue({ id: 7, marca: 'Nissan', modelo: 'Versa', anio: 2018, sucursal: { nombre: 'Empalme' } });
  const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`)
    .send({ anio: 2019, marca: 'VW', modelo: 'Jetta', vin: '1n4al3ap8jc123456', sucursalId: 2, socioId: 1 });
  expect(res.status).toBe(409);
  expect(res.body.error).toContain('Nissan');
});

test('POST normaliza el VIN a mayúsculas y busca por ese valor', async () => {
  prisma.vehiculo.findFirst.mockResolvedValue(null);
  prisma.vehiculo.create.mockResolvedValue({ id: 11, marca: 'VW', sucursalId: 2 });
  prisma.vehiculo.findUnique.mockResolvedValue({ id: 11, marca: 'VW', sucursalId: 2, fotos: [], gastos: [] });
  const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`)
    .send({ anio: 2019, marca: 'VW', modelo: 'Jetta', vin: ' abc123 ', sucursalId: 2, socioId: 1 });
  expect(res.status).toBe(201);
  expect(prisma.vehiculo.findFirst.mock.calls[0][0].where.vin).toBe('ABC123');
  expect(prisma.vehiculo.create.mock.calls[0][0].data.vin).toBe('ABC123');
});

test('POST con VIN vacío se guarda como null y no valida unicidad', async () => {
  prisma.vehiculo.create.mockResolvedValue({ id: 12, marca: 'VW', sucursalId: 2 });
  prisma.vehiculo.findUnique.mockResolvedValue({ id: 12, marca: 'VW', sucursalId: 2, fotos: [], gastos: [] });
  const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`)
    .send({ anio: 2019, marca: 'VW', modelo: 'Jetta', vin: '   ', sucursalId: 2, socioId: 1 });
  expect(res.status).toBe(201);
  expect(prisma.vehiculo.create.mock.calls[0][0].data.vin).toBeNull();
  expect(prisma.vehiculo.findFirst).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/vehiculos.test.js -t "VIN"`
Expected: FAIL — el POST duplicado devuelve 201 (no hay validación aún) y la normalización no ocurre.

- [ ] **Step 4: Normalizar el VIN en `datosBase()`**

En `backend/src/controllers/vehiculos.controller.js`, quitar `'vin'` de la lista `CAMPOS` y tratarlo aparte. Cambiar la línea 9:

```js
const CAMPOS = ['marca', 'modelo', 'color', 'placa', 'notas'];
```

Y dentro de `datosBase(body)`, después del bucle `for (const k of CAMPOS)`, añadir:

```js
  if (body.vin !== undefined) {
    const v = String(body.vin).trim().toUpperCase();
    data.vin = v === '' ? null : v;
  }
```

- [ ] **Step 5: Añadir `validarVinUnico()` y llamarla en `crear()`/`actualizar()`**

En el mismo archivo, añadir la función (por ejemplo justo después de `datosBase`):

```js
async function validarVinUnico(vin, idExcluir) {
  if (!vin) return;
  const existente = await prisma.vehiculo.findFirst({
    where: { vin, ...(idExcluir ? { id: { not: idExcluir } } : {}) },
    include: { sucursal: { select: { nombre: true } } },
  });
  if (existente) {
    throw new ApiError(409,
      `El VIN ${vin} ya está registrado en ${existente.marca} ${existente.modelo} ${existente.anio} (sucursal ${existente.sucursal.nombre}).`);
  }
}
```

En `crear()`, tras construir `const data = { ...datosBase(req.body), sucursalId, estado: 'EN_COMPRA' };` y **antes** de procesar fotos/transacción, añadir:

```js
    await validarVinUnico(data.vin, null);
```

En `actualizar()`, tras `const data = datosBase(req.body);` (línea ~78) y antes del bloque de fotos, añadir:

```js
    if (data.vin !== undefined) await validarVinUnico(data.vin, id);
```

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `cd backend && npx jest tests/vehiculos.test.js -t "VIN"`
Expected: PASS (3 tests). Luego `npm test` completo para asegurar que no se rompió nada más.
Expected: todos los suites en verde.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/vehiculos.controller.js backend/tests/vehiculos.test.js
git commit -m "feat(vehiculos): normaliza VIN y bloquea duplicados con 409"
```

---

## Task 2: Endpoint de chequeo en vivo `GET /vehiculos/vin-existe`

**Files:**
- Modify: `backend/src/controllers/vehiculos.controller.js`
- Modify: `backend/src/routes/vehiculos.routes.js`
- Modify: `backend/tests/vehiculos.test.js`

**Interfaces:**
- Consumes: `prisma.vehiculo.findFirst`.
- Produces: `async vinExiste(req, res, next)` — responde `{ existe: boolean, descripcion?: string }`. Query params: `vin` (obligatorio, se normaliza), `excluir` (id opcional). Se exporta en `module.exports`.

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/tests/vehiculos.test.js`, añadir:

```js
test('GET /vin-existe con VIN existente => { existe: true, descripcion }', async () => {
  prisma.vehiculo.findFirst.mockResolvedValue({ id: 7, marca: 'Nissan', modelo: 'Versa', anio: 2018, sucursal: { nombre: 'Empalme' } });
  const res = await request(app).get('/api/vehiculos/vin-existe?vin=abc123').set('Authorization', `Bearer ${tokenVend}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ existe: true, descripcion: 'Nissan Versa 2018 (Empalme)' });
  expect(prisma.vehiculo.findFirst.mock.calls[0][0].where.vin).toBe('ABC123');
});

test('GET /vin-existe sin coincidencia => { existe: false }', async () => {
  prisma.vehiculo.findFirst.mockResolvedValue(null);
  const res = await request(app).get('/api/vehiculos/vin-existe?vin=zzz').set('Authorization', `Bearer ${tokenVend}`);
  expect(res.body).toEqual({ existe: false });
});

test('GET /vin-existe con ?excluir excluye ese id', async () => {
  prisma.vehiculo.findFirst.mockResolvedValue(null);
  await request(app).get('/api/vehiculos/vin-existe?vin=abc&excluir=5').set('Authorization', `Bearer ${tokenVend}`);
  expect(prisma.vehiculo.findFirst.mock.calls[0][0].where.id).toEqual({ not: 5 });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/vehiculos.test.js -t "vin-existe"`
Expected: FAIL — la ruta `/vin-existe` es capturada por `GET /:id` → `obtener` devuelve 404 o forma distinta.

- [ ] **Step 3: Añadir el handler `vinExiste()` y exportarlo**

En `backend/src/controllers/vehiculos.controller.js`, añadir la función:

```js
async function vinExiste(req, res, next) {
  try {
    const vin = String(req.query.vin || '').trim().toUpperCase();
    const excluir = req.query.excluir ? Number(req.query.excluir) : null;
    if (!vin) return res.json({ existe: false });
    const v = await prisma.vehiculo.findFirst({
      where: { vin, ...(excluir ? { id: { not: excluir } } : {}) },
      include: { sucursal: { select: { nombre: true } } },
    });
    res.json(v
      ? { existe: true, descripcion: `${v.marca} ${v.modelo} ${v.anio} (${v.sucursal.nombre})` }
      : { existe: false });
  } catch (e) { next(e); }
}
```

Actualizar la línea de `module.exports` (línea 152) para incluir `vinExiste`:

```js
module.exports = { listar, obtener, crear, actualizar, cambiarEstado, agregarGasto, eliminarGasto, pasarAVenta, vinExiste };
```

- [ ] **Step 4: Registrar la ruta antes de `/:id`**

En `backend/src/routes/vehiculos.routes.js`, insertar la ruta **entre** `router.get('/', ...)` (línea 8) y `router.get('/:id', ...)` (línea 9):

```js
router.get('/', ctrl.listar);
router.get('/vin-existe', ctrl.vinExiste);
router.get('/:id', ctrl.obtener);
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `cd backend && npx jest tests/vehiculos.test.js -t "vin-existe"`
Expected: PASS (3 tests). Luego `npm test` completo.
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/vehiculos.controller.js backend/src/routes/vehiculos.routes.js backend/tests/vehiculos.test.js
git commit -m "feat(vehiculos): endpoint GET /vin-existe para chequeo en vivo"
```

---

## Task 3: Restricción `@unique` en la base de datos

**Files:**
- Modify: `backend/prisma/schema.prisma:114`

**Interfaces:**
- Produces: columna `vin` con índice único en Postgres (múltiples `NULL` permitidos).

- [ ] **Step 1: Normalizar los VINs existentes y confirmar que no hay duplicados**

Run:
```bash
docker exec icarsell-db psql -U icarsell -d icarsell -c "UPDATE \"Vehiculo\" SET vin = NULL WHERE vin = ''; UPDATE \"Vehiculo\" SET vin = UPPER(TRIM(vin)) WHERE vin IS NOT NULL;"
docker exec icarsell-db psql -U icarsell -d icarsell -t -c "SELECT UPPER(TRIM(vin)) v, COUNT(*) FROM \"Vehiculo\" WHERE vin IS NOT NULL AND TRIM(vin) <> '' GROUP BY UPPER(TRIM(vin)) HAVING COUNT(*) > 1;"
```
Expected: la segunda consulta no devuelve filas (0 duplicados). Si devolviera filas, resolver manualmente antes de continuar.

- [ ] **Step 2: Editar el schema**

En `backend/prisma/schema.prisma`, línea 114, cambiar:

```prisma
  vin          String?
```
por:
```prisma
  vin          String?  @unique
```

- [ ] **Step 3: Aplicar el cambio a la BD dockerizada**

Run (según el flujo del proyecto — push contra la BD local en :5437):
```bash
cd backend && DATABASE_URL="postgresql://icarsell:icarsell_pass@localhost:5437/icarsell?schema=public" npx prisma db push
```
Expected: `Your database is now in sync with your Prisma schema`. Genera el índice único sin errores (datos ya limpios).

- [ ] **Step 4: Verificar el índice**

Run:
```bash
docker exec icarsell-db psql -U icarsell -d icarsell -c "\d \"Vehiculo\"" | grep -i unique
```
Expected: aparece un índice único sobre `vin` (p. ej. `Vehiculo_vin_key" UNIQUE`).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): VIN unico en Vehiculo"
```

---

## Task 4: Aviso en vivo del VIN en el formulario (frontend)

**Files:**
- Modify: `frontend/src/pages/Compra.jsx`

**Interfaces:**
- Consumes: `GET /vehiculos/vin-existe?vin=&excluir=` (Task 2), `api` client, `editId`, `form.vin`, `set(k, v)`.
- Produces: aviso visual bajo el campo VIN cuando el VIN ya existe.

- [ ] **Step 1: Añadir el estado del aviso**

En `frontend/src/pages/Compra.jsx`, junto a los demás `useState` del componente, añadir:

```jsx
  const [vinAviso, setVinAviso] = useState('');
```

- [ ] **Step 2: Añadir la función `verificarVin()`**

Dentro del componente (por ejemplo tras la función `set`), añadir:

```jsx
  async function verificarVin() {
    const vin = (form.vin || '').trim();
    if (!vin) { setVinAviso(''); return; }
    try {
      const params = new URLSearchParams({ vin });
      if (editId) params.set('excluir', String(editId));
      const { data } = await api.get(`/vehiculos/vin-existe?${params.toString()}`);
      setVinAviso(data.existe ? `Este VIN ya está registrado en ${data.descripcion}` : '');
    } catch { setVinAviso(''); }
  }
```

- [ ] **Step 3: Conectar el input de VIN**

En el `<input>` del VIN (línea ~121), añadir `onBlur` y limpiar el aviso al escribir. Reemplazar:

```jsx
              <div style={{ flex: 1 }}><label>VIN</label><input value={form.vin || ''} maxLength={17} onChange={(e) => set('vin', e.target.value)} /></div>
```
por:
```jsx
              <div style={{ flex: 1 }}>
                <label>VIN</label>
                <input value={form.vin || ''} maxLength={17}
                  onChange={(e) => { set('vin', e.target.value); if (vinAviso) setVinAviso(''); }}
                  onBlur={verificarVin} />
                {vinAviso && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}>{vinAviso}</div>}
              </div>
```

- [ ] **Step 4: Limpiar el aviso al abrir/crear una ficha**

Para que el aviso no quede colgado entre fichas, limpiarlo en `nuevo()` y en `abrir()`. En `nuevo()` añadir `setVinAviso('');` junto a los otros resets; en `abrir(id)` añadir `setVinAviso('');` tras `setMostrarForm(true)`.

- [ ] **Step 5: Verificación manual en la app**

Levantar el frontend (`http://localhost:8082`) o el dev server, ir a Inventario de compra → Registrar auto:
- Escribir un VIN que ya exista (usar uno de los 5 cargados) y salir del campo (Tab) → aparece el aviso rojo con la descripción del vehículo.
- Intentar **Guardar** con ese VIN → el guardado se bloquea y se muestra el error 409 del backend en el mensaje del formulario.
- Editar el mismo vehículo conservando su VIN → no aparece aviso ni error (se excluye a sí mismo).

Expected: los tres comportamientos ocurren como se describe.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Compra.jsx
git commit -m "feat(compra): aviso en vivo de VIN duplicado"
```

---

## Self-Review

- **Spec coverage:** normalización (Task 1) ✓, bloqueo 409 global todos los estados (Task 1) ✓, VIN opcional/`null` (Task 1) ✓, endpoint vin-existe antes de `/:id` (Task 2) ✓, `@unique` con limpieza previa (Task 3) ✓, bloqueo al guardar reutiliza `setError` existente + aviso `onBlur` (Task 4) ✓, tests (Tasks 1-2) ✓.
- **Consistencia de nombres/tipos:** `validarVinUnico(vin, idExcluir)`, `vinExiste(req,res,next)`, respuesta `{ existe, descripcion }`, estado `vinAviso`/`verificarVin` — usados consistentemente entre tareas.
- **Placeholders:** ninguno; todo el código está explícito.
