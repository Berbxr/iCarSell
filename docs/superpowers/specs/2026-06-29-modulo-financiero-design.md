# Diseño: Módulo financiero (tipo de cambio, gastos, socios, método de pago, inventario entre sucursales)

**Fecha:** 2026-06-29
**Estado:** Aprobado

## Contexto

El negocio compra y vende autos en USD, pero opera y paga en México en MXN
(insumos, sueldos). Además varios **socios** aportan autos al mismo negocio y se
necesita saber de quién es cada auto y cuánto genera cada uno. Hace falta:

1. Un **tipo de cambio** configurable para convertir las ganancias en USD a MXN,
   visible como recordatorio en el header.
2. Un módulo de **gastos generales** en MXN (insumos, pago a empleados, etc.).
3. **Socios** asociados a cada auto, con reportes de ganancia por socio.
4. **Método de pago** (efectivo/transferencia) en la venta, desglosado en reportes.
5. Que los vendedores puedan **ver y vender** autos de cualquier sucursal.

Estado actual relevante: `Vehiculo` con costos y utilidad (USD), serializador
`vistaVehiculo(v, rol)` que oculta costos al VENDEDOR; `Venta` con `comision`
(snapshot MXN); `Configuracion` con `diasAntiguedadAlerta` y `terminosContrato`;
roles ADMIN/VENDEDOR/ALMACEN; `Layout` sin barra superior (solo sidebar +
contenido).

## Decisiones de negocio

1. **Tipo de cambio global actual:** un único valor en configuración. Todas las
   conversiones a MXN usan SIEMPRE el TC vigente (no se congela por venta).
2. **Gastos con categoría:** cada gasto tiene categoría + descripción + monto
   (MXN) + fecha.
3. **Un socio por auto, obligatorio.**
4. **Permisos de gestión (gastos, catálogo de socios, TC): solo ADMIN.**
5. **Método de pago: efectivo o transferencia** (uno por venta).
6. **Inventario entre sucursales:** los vendedores ven autos de todas las
   sucursales y pueden vender cualquiera.
7. **TC en header: visible para todos los roles.**
8. **Reportes de ganancias en USD y MXN** (MXN con el TC configurado).

## Módulos

### 1. Tipo de cambio (base)

- `Configuracion.tipoCambioDolar Float @default(0)` — pesos por dólar.
- Edición solo ADMIN en la página de Configuración (sección nueva).
- **Header (topbar) nuevo** en `Layout`: muestra "Dólar: $XX.XX MXN" para todos
  los roles. Si `tipoCambioDolar` es 0, muestra "Dólar: sin configurar".
- Helper puro `usdAMxn(usd, tc)` → `usd * tc` (en `backend/src/utils/cambio.js`).
  El frontend hace la misma conversión con el TC que ya consume de
  `/configuracion` o de un endpoint público de TC.

### 2. Gastos generales (MXN)

- Modelo:
  ```prisma
  model GastoGeneral {
    id          Int      @id @default(autoincrement())
    fecha       DateTime @default(now())
    categoria   String
    descripcion String
    monto       Float    // MXN
    sucursalId  Int?
    sucursal    Sucursal? @relation(fields: [sucursalId], references: [id])
    createdAt   DateTime @default(now())
  }
  ```
- API (solo ADMIN): `GET /gastos?desde&hasta&sucursalId`, `POST /gastos`,
  `DELETE /gastos/:id`.
- Validación: `categoria` y `descripcion` no vacías; `monto` número >= 0.
- Frontend: página "Gastos" (solo ADMIN) con alta (categoría vía `datalist`
  sugerencias: Insumos, Pago empleados, Renta, Servicios, Otro), lista y borrado.

### 3. Socios

- Modelo:
  ```prisma
  model Socio {
    id        Int        @id @default(autoincrement())
    nombre    String
    activo    Boolean    @default(true)
    vehiculos Vehiculo[]
    createdAt DateTime   @default(now())
  }
  ```
- `Vehiculo.socioId Int` (obligatorio) + relación `socio`.
- API catálogo (solo ADMIN): `GET /socios`, `POST /socios`, `PUT /socios/:id`,
  `PATCH /socios/:id/estado`. **Lectura** (`GET /socios`) permitida a ADMIN y
  ALMACEN (para el selector y el filtro); **no** a VENDEDOR.
- Asignación: `crear`/`actualizar` de vehículo aceptan `socioId` (ALMACEN/ADMIN).
  `crear` valida que `socioId` exista.
- **Visibilidad:** `vistaVehiculo` elimina `socio` y `socioId` cuando
  `rol === 'VENDEDOR'` (se añade a la lógica de ocultamiento existente).
- **Filtro:** `GET /vehiculos?socioId=` filtra por socio (inventario de compra).
- Frontend: página "Socios" (solo ADMIN); selector de socio en el formulario de
  inventario de compra; filtro por socio en la lista de compra.

### 4. Método de pago en venta

- `enum MetodoPago { EFECTIVO TRANSFERENCIA }`.
- `Venta.metodoPago MetodoPago @default(EFECTIVO)`.
- `crearVenta` acepta `metodoPago` (validado contra el enum; default EFECTIVO).
- Frontend: selector efectivo/transferencia en el formulario de venta.
- Reporte de ventas: totales `efectivo` y `transferencia` (suma de `total` por
  método), además de los totales existentes.

### 5. Inventario entre sucursales (ver y vender)

- `vehiculos.listar`: deja de forzar la sucursal del vendedor; todos los roles
  ven todas las sucursales, con filtro opcional `?sucursalId`. (El cambio es
  específico de vehículos; `resolverSucursalLectura` se mantiene para los demás
  módulos.)
- Frontend inventario de venta: mostrar `SelectorSucursal` también al VENDEDOR.
- `crearVenta`: la venta se registra en la **sucursal del vehículo**
  (`vehiculo.sucursalId`), no en la del vendedor. Se elimina la validación
  `vehiculo.sucursalId !== sucursalId`. El folio se genera con la serie de la
  sucursal del vehículo. El `empleadoId` sigue siendo el vendedor logueado (o el
  indicado por ADMIN).

### 6. Reportes (USD y MXN)

- **Ganancias por socio** (`GET /reportes/socios?desde&hasta`, solo ADMIN):
  agrupa los autos **vendidos** en el periodo por socio; por cada socio: lista de
  autos con utilidad USD, total USD, total MXN (con TC), cantidad. Total general
  USD y MXN. La utilidad por auto = `precioVenta − costoTotal` (mismo cálculo que
  el reporte de ventas).
- **Por mes:** el reporte de socios acepta agrupación mensual (devuelve, por
  socio y en general, totales por mes dentro del periodo).
- **Reporte de ventas:** añadir columna `metodoPago` por fila y totales
  `efectivo`/`transferencia`; la utilidad ya se muestra y se convierte a MXN en
  el frontend con el TC.
- **Gastos generales** (`GET /reportes/gastos?desde&hasta&sucursalId`, solo
  ADMIN): total del periodo y desglose por categoría.
- Todas las conversiones MXN usan `tipoCambioDolar` de `Configuracion`.

### 7. Permisos

| Acción | VENDEDOR | ALMACEN | ADMIN |
| --- | --- | --- | --- |
| Ver TC en header | ✅ | ✅ | ✅ |
| Editar TC / gastos / catálogo de socios | ❌ | ❌ | ✅ |
| Leer lista de socios | ❌ | ✅ | ✅ |
| Ver/asignar socio de un auto | ❌ | ✅ | ✅ |
| Ver inventario de todas las sucursales | ✅ | ✅ | ✅ |
| Vender auto de cualquier sucursal | ✅ | — | ✅ |
| Reportes de socios / ganancias / gastos | ❌ | ❌ | ✅ |
| Elegir método de pago en venta | ✅ | — | ✅ |

**Regla de seguridad:** el backend nunca envía `socio`/`socioId` (ni costos ni
utilidad) a un VENDEDOR, vía el serializador `vistaVehiculo`.

## Migraciones

- `Configuracion.tipoCambioDolar` (default 0).
- `enum MetodoPago` + `Venta.metodoPago` (default EFECTIVO; ventas existentes
  quedan EFECTIVO por el default).
- Modelo `GastoGeneral`.
- Modelo `Socio` + `Vehiculo.socioId` **obligatorio**. Como hay autos
  existentes, la migración: (1) crea la tabla `Socio`, (2) inserta un socio
  inicial "Sin asignar", (3) agrega `socioId` nullable, (4) backfillea todos los
  vehículos con el id del socio inicial, (5) aplica `NOT NULL` y la FK.
- Seed: asegurar que exista al menos un socio "Sin asignar" si la tabla está
  vacía (idempotente).
- Estrategia: crear la carpeta de migración manualmente con timestamp posterior
  al último y SQL que respete el orden anterior; aplicar con `prisma migrate
  deploy` (mismo patrón usado en la migración de inventario de compra).

## Tests

### Unitarios
- `usdAMxn(usd, tc)`: conversión correcta; tc 0 → 0.
- `vistaVehiculo`: VENDEDOR no recibe `socio`/`socioId`; ADMIN/ALMACEN sí.

### Integración (Jest + Supertest, mocks de Prisma)
- Socios: `POST/PUT/PATCH` solo ADMIN (VENDEDOR 403); `GET /socios` permitido a
  ALMACEN, prohibido a VENDEDOR.
- Gastos: CRUD solo ADMIN (VENDEDOR/ALMACEN 403 en escritura); validación de
  campos.
- `GET /vehiculos?socioId=` filtra por socio; `?sucursalId=` funciona para
  VENDEDOR (ve todas si no filtra).
- Venta: `metodoPago` se guarda; vender un auto de **otra** sucursal funciona y
  la venta queda en la sucursal del auto.
- Reporte de socios: agrupa por socio, suma utilidad USD y convierte a MXN con el
  TC; respeta el periodo.
- Reporte de gastos: total y desglose por categoría.
- Reporte de ventas: totales por método de pago.

## Fuera de alcance (YAGNI)

- Tipo de cambio histórico / por venta (se usa el global actual).
- Copropiedad de un auto entre varios socios (un socio por auto).
- Pago mixto efectivo+transferencia en una sola venta.
- Catálogo de categorías de gasto como entidad (se usa texto con sugerencias).
- Vincular formalmente cada gasto "Pago empleados" a un `Empleado` (se usa
  descripción libre).
- Estado de resultados consolidado (ventas − costos − comisiones − gastos) como
  vista única; por ahora los reportes se consultan por separado.
