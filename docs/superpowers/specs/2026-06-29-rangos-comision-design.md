# Diseño: Rangos de comisión para vendedores

**Fecha:** 2026-06-29
**Estado:** Aprobado

## Contexto

Los vendedores de iCarSell ganan una comisión fija (en pesos mexicanos, MXN) por
cada venta. El monto depende del rango en que cae el **precio de lista del
vehículo** (`Vehiculo.precioVenta`, expresado en dólares estadounidenses, USD).

Rangos solicitados por el negocio:

| Precio de lista (USD) | Comisión (MXN) |
| --------------------- | -------------- |
| 1 – 5,999             | 1,000          |
| 6,000 – 9,999         | 1,600          |
| 10,000 y más          | 2,600          |

Actualmente no existe ningún concepto de comisión en el sistema.

## Decisiones de diseño

1. **Base del cálculo:** el rango se decide por el **precio de lista**
   (`Vehiculo.precioVenta`, USD), no por el `total` de la venta ni por el
   `costoCompra`.
2. **Configurable:** los montos y límites de los rangos son editables por el
   ADMIN desde la app (se persisten en BD).
3. **Snapshot al vender:** cada venta congela la comisión calculada en el
   momento de registrarse. Cambios posteriores a los rangos **no** afectan
   ventas ya registradas.
4. **Visibilidad:** las comisiones solo las ve el ADMIN. El VENDEDOR no ve
   comisiones en la app.
5. **Ubicación:** las comisiones se muestran en (a) un nuevo reporte de
   comisiones por vendedor y periodo, y (b) una columna/total en el reporte de
   ventas existente.
6. **Comisión por venta individual:** cada venta genera UNA comisión según el
   rango del auto vendido. La comisión NUNCA se calcula sobre una suma de
   ventas. En los reportes, los totales son una simple suma de los pagos
   individuales (cuánto pagarle al vendedor en el periodo); jamás recalculan el
   rango sobre el monto acumulado.

## Modelo de datos (Prisma)

### Nuevo modelo `RangoComision`

```prisma
model RangoComision {
  id        Int      @id @default(autoincrement())
  orden     Int                  // para mostrarlos ordenados en la UI
  desdeUsd  Float                // límite inferior INCLUSIVO en USD
  monto     Float                // comisión en MXN
  updatedAt DateTime @updatedAt
}
```

**Por qué solo límite inferior:** manejar pares "desde–hasta" crea huecos
ambiguos (¿qué pasa con 5,999.50?). En su lugar cada rango guarda únicamente su
límite inferior inclusivo; el rango aplicable es el de mayor `desdeUsd` que sea
`<=` al precio de lista. Esto cubre todo el dominio sin huecos.

**Seed / valores por defecto:**

| orden | desdeUsd | monto |
| ----- | -------- | ----- |
| 1     | 0        | 1000  |
| 2     | 6000     | 1600  |
| 3     | 10000    | 2600  |

Estos defaults reproducen exactamente los 3 rangos solicitados.

### Campo nuevo en `Venta`

```prisma
comision Float @default(0)   // snapshot en MXN, congelado al vender
```

## Lógica de cálculo

Función pura, sin acceso a BD:

```
calcularComision(precioVentaUsd, rangos) -> monto MXN
```

- `rangos` es la lista de `RangoComision` cargada de BD.
- Selecciona el rango con mayor `desdeUsd` tal que `desdeUsd <= precioVentaUsd`.
- Si no hay rangos o ninguno aplica (precio menor al menor `desdeUsd`),
  devuelve `0`.

Se invoca dentro de `crearVenta` (misma transacción que ya existe en
`ventas.service.js`): se lee `vehiculo.precioVenta`, se cargan los rangos
vigentes, se calcula y se guarda en `Venta.comision`.

## Backend (API)

### Configuración de rangos (solo ADMIN)

- `GET /configuracion/comisiones` → lista de rangos ordenada por `orden`.
- `PUT /configuracion/comisiones` → reemplaza el conjunto de rangos.
  - **Validación:** al menos un rango; `desdeUsd >= 0`; `monto >= 0`; sin
    `desdeUsd` duplicados; se reordena/normaliza `orden` por `desdeUsd`
    ascendente.

### Reporte de ventas (existente)

- Añadir `comision` a cada fila del resultado.
- Añadir `totalComision` al objeto de totales.
- La comisión se devuelve solo si el solicitante es ADMIN.

### Nuevo reporte de comisiones (solo ADMIN)

- `GET /reportes/comisiones?fecha=YYYY-MM-DD&sucursalId`
- **Vista semanal:** el reporte se consulta por **semana** (lunes a domingo). El
  parámetro `fecha` es una fecha de referencia; el backend calcula el lunes
  00:00:00 y el domingo 23:59:59.999 de la semana que la contiene, usando la
  zona horaria del servidor (`TZ`, por defecto `America/Tijuana`). Si se omite
  `fecha`, se usa la semana actual.
- Agrupa las ventas de esa semana por vendedor (`empleado`), devolviendo por
  cada uno: nombre, lista de sus ventas (folio, auto, comisión) y suma de
  comisiones. Incluye total general a pagar de la semana.
- Devuelve también los límites calculados de la semana (`inicio`, `fin`) para
  que el frontend los muestre.

## Frontend

### Configuración

- Nueva sección "Rangos de comisión" en `pages/Configuracion.jsx`.
- El ADMIN edita límite inferior (USD) y monto (MXN) de cada rango; puede
  agregar/quitar rangos. Validación espejo de la del backend.

### Reporte de ventas

- Nueva columna "Comisión" y total de comisiones (visible solo a ADMIN).

### Nuevo reporte de comisiones

- Nueva vista/sección de reporte **por semana** (lunes a domingo), con total a
  pagar por vendedor.
- **Selector de semana** con flechas ‹ anterior / siguiente › y la semana
  actual por defecto. Muestra el rango de fechas de la semana visible
  (ej. "Lun 23 jun – Dom 29 jun").
- Por cada vendedor: sus ventas de la semana (folio, auto, comisión) y su total
  a pagar. Total general de la semana al final.

## Migración de datos

- Migración Prisma para `RangoComision` y `Venta.comision`.
- Seed de los 3 rangos por defecto si la tabla está vacía.
- Backfill: para cada venta existente, calcular su comisión con los rangos por
  defecto según el `precioVenta` de su vehículo y escribirla en
  `Venta.comision`.

## Tests

### Unitarios de `calcularComision`

| precioVentaUsd | comisión esperada (MXN) |
| -------------- | ----------------------- |
| 0              | 1000                    |
| 1              | 1000                    |
| 5999           | 1000                    |
| 6000           | 1600                    |
| 9999           | 1600                    |
| 10000          | 2600                    |
| 10500          | 2600                    |

### Integración (Jest + Supertest)

- Crear una venta guarda `comision` correcta según el precio de lista del
  vehículo.
- `PUT /configuracion/comisiones` valida (rechaza duplicados, montos negativos,
  lista vacía).
- `GET /reportes/comisiones` agrupa correctamente por vendedor y suma totales.
- `GET /reportes/comisiones` con `fecha` calcula la semana lunes–domingo
  correcta e incluye solo las ventas de esa semana (verificar bordes: venta el
  lunes 00:00 y el domingo 23:59 sí entran; lunes de la semana siguiente no).
- RBAC: un VENDEDOR no recibe comisiones en reportes ni puede editar rangos.

## Fuera de alcance (YAGNI)

- Comisiones por porcentaje del precio.
- Comisiones distintas por vendedor o por sucursal.
- Visibilidad de comisión para el VENDEDOR.
- Recálculo histórico al cambiar rangos (se usa snapshot).
