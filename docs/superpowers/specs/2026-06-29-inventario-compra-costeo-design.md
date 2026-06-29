# Diseño: Inventario de compra, costeo y utilidad por auto

**Fecha:** 2026-06-29
**Estado:** Aprobado

## Contexto

Los autos se compran en subastas y requieren una etapa de preparación (costos de
adquisición, transporte, trámites, reparación/pintura) antes de salir a la
venta. Hoy el sistema tiene un único inventario (`Vehiculo` con `costoCompra` y
`precioVenta`) y dos roles (ADMIN, VENDEDOR). Se necesita:

1. Un **inventario de compra** donde se captura el auto y se le suman costos como
   borrador, hasta definir el precio de venta.
2. Un **inventario de venta** (el que ya usan los vendedores) al que el auto pasa
   explícitamente.
3. Un **nuevo rol ALMACEN** que gestiona el inventario de compra y los costos.
4. Control de **días** en cada inventario y de la **utilidad** por auto.
5. Que los **vendedores nunca vean los costos**, solo el precio de venta final.

## Decisiones de negocio

1. **Moneda:** todo en USD (costos y precio de venta). La utilidad se calcula en
   USD sin tipo de cambio.
2. **Estructura de costos:** campos fijos (precio compra, comisión proveedor,
   transporte, registro/placas, salidas) que suman el subtotal **"Costo Puesto
   en México"**, más una lista de **otros gastos** (descripción + monto).
3. **Paso a venta:** mediante **botón explícito "Pasar a venta"**, que requiere
   precio de venta > 0. Permite tener el precio capturado y seguir en borrador.
4. **Nuevo rol:** `ALMACEN`. Accede a: inventario de compra (CRUD con costos),
   utilidad por auto, e inventario de venta en modo lectura.
5. **Costos editables siempre:** ALMACEN y ADMIN pueden editar costos/gastos
   incluso después de pasar a venta o vender; la utilidad se recalcula.
6. **Utilidad real:** el cálculo de utilidad (en reportes y por auto) pasa a ser
   `precioVenta − costo total real`, reemplazando el viejo
   `precioVenta − costoCompra`.
7. **Visibilidad:** los vendedores nunca ven costos ni utilidad; solo datos del
   auto y precio de venta.

## Estados y flujo

Se agrega `EN_COMPRA` al enum `EstadoVehiculo`. Valores resultantes:
`EN_COMPRA`, `DISPONIBLE`, `RESERVADO`, `VENDIDO`.

```
EN_COMPRA → DISPONIBLE → (RESERVADO) → VENDIDO
```

- Un auto creado por ALMACEN/ADMIN nace en `EN_COMPRA` (inventario de compra).
- "Pasar a venta": `EN_COMPRA` → `DISPONIBLE` y registra `fechaPaseAVenta`.
- La venta (módulo existente) lleva el auto a `VENDIDO`.

## Modelo de datos (Prisma)

### Cambios en `Vehiculo` (montos en USD)

```prisma
  // Costos fijos → subtotal "Costo Puesto en México"
  precioCompra      Float     @default(0)
  comisionProveedor Float     @default(0)
  transporte        Float     @default(0)
  registroPlacas    Float     @default(0)
  salidas           Float     @default(0)
  // precioVenta ya existe (precio final de venta)
  fechaPaseAVenta   DateTime?
  gastos            GastoVehiculo[]
```

- Se **elimina** el campo `costoCompra`; su valor se migra a `precioCompra`.
- El enum `EstadoVehiculo` agrega `EN_COMPRA` (como primer valor del flujo).

### Nuevo modelo `GastoVehiculo`

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

### Nuevo rol

El enum `Rol` agrega `ALMACEN` (queda `ADMIN`, `VENDEDOR`, `ALMACEN`).

## Cálculos derivados (no se almacenan)

- **Costo Puesto en México** = `precioCompra + comisionProveedor + transporte + registroPlacas + salidas`
- **Costo total** = `Costo Puesto en México + Σ(gastos.monto)`
- **Utilidad** = `precioVenta − Costo total`
- **Días en compra** = `floor((fechaPaseAVenta ?? hoy) − fechaIngreso)` en días
- **Días en venta** = si hay `fechaPaseAVenta`: `floor((fechaVenta ?? hoy) − fechaPaseAVenta)`; si no, `null`

`fechaVenta` proviene de la `Venta` asociada (`Vehiculo.venta.fecha`).

## Permisos por rol

| Acción | VENDEDOR | ALMACEN | ADMIN |
| --- | --- | --- | --- |
| Inventario de compra (CRUD, costos, gastos) | ❌ | ✅ | ✅ |
| "Pasar a venta" | ❌ | ✅ | ✅ |
| Editar costos tras pasar a venta / vender | ❌ | ✅ | ✅ |
| Ver utilidad por auto | ❌ | ✅ | ✅ |
| Inventario de venta | ✅ (sin costos) | ✅ (lectura) | ✅ |
| Registrar ventas | ✅ | ❌ | ✅ |
| Comisiones / Configuración / Reportes | ❌ | ❌ | ✅ |

**Regla de seguridad:** el backend nunca incluye campos de costo ni utilidad en
respuestas a un VENDEDOR. La omisión ocurre en el serializador del endpoint de
vehículos, no solo en el frontend.

## Backend (API)

- **Auth/RBAC:** agregar `ALMACEN` como rol válido (token, middleware, guards).
- **Vehículos:**
  - `crear`/`actualizar` aceptan los nuevos campos de costo. `crear` hecho por
    ALMACEN/ADMIN nace en `EN_COMPRA`.
  - Listado con filtro `?inventario=compra|venta`: `compra` ⇒ `estado =
    EN_COMPRA`; `venta` ⇒ `estado IN (DISPONIBLE, RESERVADO, VENDIDO)`.
  - Serializador que **omite** `precioCompra`, `comisionProveedor`,
    `transporte`, `registroPlacas`, `salidas`, `gastos`, costo total y utilidad
    cuando `req.usuario.rol === 'VENDEDOR'`.
- **Gastos:**
  - `POST /api/vehiculos/:id/gastos` (ALMACEN/ADMIN) body `{ descripcion, monto }`.
  - `DELETE /api/vehiculos/:id/gastos/:gastoId` (ALMACEN/ADMIN).
- **Pasar a venta:** `PUT /api/vehiculos/:id/pasar-a-venta` (ALMACEN/ADMIN).
  Valida `precioVenta > 0` y `estado === EN_COMPRA`; setea `estado = DISPONIBLE`
  y `fechaPaseAVenta = now()`.
- **Reportes:** utilidad = `precioVenta − costoTotal` (reemplaza el cálculo
  viejo en `reportes.service.ventas`); agregar días en compra/venta donde aplique
  al listado de ventas/inventario.

## Frontend

- **Inventario de venta** (`/inventario`, página actual): para VENDEDOR no
  muestra columnas de costo ni utilidad; para ALMACEN/ADMIN muestra además días
  en venta y utilidad. ALMACEN lo ve en modo lectura (sin crear/editar aquí).
- **Inventario de compra** (`/compra`, nueva página, ALMACEN/ADMIN):
  - Lista autos `EN_COMPRA` con días en compra.
  - Formulario: datos del auto (año, marca, modelo, etc.) + costos fijos con
    subtotal "Costo Puesto en México" calculado en vivo + sección "Otros
    costos/gastos" (descripción + monto, agregar/quitar) + precio de venta +
    utilidad calculada en vivo + botón **"Pasar a venta"**.
  - Guardado parcial (borrador) en cualquier momento.
- **Rol ALMACEN:** menú con "Inventario de compra" e "Inventario de venta".
  Guards de ruta actualizados.

## Migración de datos

- Migración Prisma para: campos de costo nuevos, `fechaPaseAVenta`, modelo
  `GastoVehiculo`, valor `EN_COMPRA` del enum `EstadoVehiculo`, valor `ALMACEN`
  del enum `Rol`.
- Copiar `costoCompra` → `precioCompra` en autos existentes, luego eliminar
  `costoCompra`.
- Para autos existentes que ya están en venta (`DISPONIBLE`/`RESERVADO`/
  `VENDIDO`): `fechaPaseAVenta = fechaIngreso`, para que "días en venta" sea
  coherente.

## Tests

### Unitarios de cálculos (función pura)

- `costoPuestoEnMexico` suma los 5 campos fijos.
- `costoTotal` = puesto en México + suma de gastos.
- `utilidad` = precioVenta − costo total (incluye caso utilidad negativa).
- `diasEnCompra` con y sin `fechaPaseAVenta`.
- `diasEnVenta` con/sin `fechaPaseAVenta` y con/sin venta.

### Integración (Jest + Supertest, mocks de Prisma)

- `PUT /vehiculos/:id/pasar-a-venta`: rechaza con `precioVenta = 0` (400);
  con precio válido cambia a `DISPONIBLE` y setea `fechaPaseAVenta`.
- `POST`/`DELETE` de gastos: ALMACEN/ADMIN sí; VENDEDOR 403.
- Serializador: respuesta a VENDEDOR no incluye campos de costo ni utilidad;
  a ALMACEN/ADMIN sí.
- Listado `?inventario=compra` solo trae `EN_COMPRA`; `?inventario=venta` excluye
  `EN_COMPRA`.
- RBAC: VENDEDOR no puede crear/editar en inventario de compra ni pasar a venta.
- Reportes: la utilidad usa el costo total real (no `costoCompra`).

## Fuera de alcance (YAGNI)

- Tipo de cambio / multi-moneda (todo es USD).
- Historial de cambios de costos (más allá de la auditoría existente).
- Aprobaciones/workflow de varios pasos para pasar a venta.
- Reportes financieros nuevos dedicados (la utilidad real se integra en los
  reportes existentes).
