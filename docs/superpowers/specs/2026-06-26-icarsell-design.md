# iCarSell — Diseño del sistema

**Fecha:** 2026-06-26
**Base:** Reutiliza el esqueleto de iBarber (Node/Express + Prisma + PostgreSQL, React/Vite, Docker, JWT, roles, auditoría).

## 1. Propósito

Sistema para gestionar la venta de autos de un lote con **varias sucursales**. Desarrollo local en Windows 11; despliegue en un VPS Debian. El administrador ve los reportes y el dashboard consolidado de todas las sucursales; el vendedor opera únicamente su sucursal. Login simple de usuario + contraseña (sin email/OAuth), igual que iBarber.

## 2. Stack y arquitectura

- **Backend:** Node + Express + Prisma + PostgreSQL. JWT, middleware de roles y auditoría. Estructura `src/{app,index,config,controllers,routes,services,middlewares,utils}` igual que iBarber.
- **Frontend:** React (Vite). Convenciones `src/{pages,components,context,api,routes,ui}` de iBarber.
- **Docker:** `docker-compose` con servicios `db`, `backend`, `frontend` (nginx).
- **Puertos (para no chocar con otros sistemas locales):**
  - Frontend (nginx): **8082** (iBarber usa 8080)
  - PostgreSQL: **5437** (iBarber 5435; iNET/iPET 5436)
  - Backend interno: 4000
- **Generación de PDF:** plantilla **HTML/CSS + Puppeteer** (Chrome headless) para máxima fidelidad al contrato impreso.

## 3. Roles y autenticación

- Roles: **ADMIN** y **VENDEDOR**.
  - ADMIN: acceso total; dashboard y reportes consolidados de todas las sucursales; gestiona sucursales, empleados, usuarios y configuración.
  - VENDEDOR: limitado a **su** sucursal (inventario, ventas, su dashboard).
- Login solo usuario + contraseña. El **Usuario** se liga a un **Empleado**, y el empleado define la **Sucursal**. La sucursal del usuario se deriva de su empleado.
- `debeCambiarPassword` y password inicial de admin como en iBarber.

## 4. Modelo de datos (Prisma)

### Enums
- `Rol { ADMIN, VENDEDOR }`
- `EstadoVehiculo { DISPONIBLE, RESERVADO, VENDIDO }`
- `Transmision { AUTOMATICA, ESTANDAR }`
- `Combustible { GASOLINA, DIESEL, HIBRIDO, ELECTRICO }`

### Sucursal
Datos que alimentan el bloque **VENDEDOR** del contrato.
- `id`, `nombre` (nombre comercial, p. ej. "EMPALME MOTORS"), `domicilio`, `colonia`, `codigoPostal`, `ciudadEstado`, `telefono`, `logo` (ruta de archivo)
- `serieFolio` (prefijo, p. ej. "A"), `consecutivoFolio` (entero, último folio usado)
- `activo`, timestamps
- Relaciones: empleados, vehículos, ventas

### Empleado
- `id`, `nombre`, `apellidos`, `telefono?`, `email?`, `puesto`, `sucursalId`, `fechaIngreso`, `activo`, timestamps
- Relaciones: `usuario?` (1:1), `ventas` (como vendedor), `sucursal`

### Usuario
- `id`, `username` (único), `passwordHash`, `rol`, `activo`, `debeCambiarPassword`, `empleadoId?` (único), timestamps

### Cliente (catálogo reutilizable)
- `id`, `nombre`, `domicilio?`, `colonia?`, `codigoPostal?`, `ciudadEstado?`, `telefono?`, timestamps
- Relaciones: `ventas`

### Vehiculo (inventario, ligado a sucursal)
- `id`, `sucursalId`
- Datos del contrato: `anio`, `marca`, `modelo`, `color`, `vin` (17 caract.), `placa?`
- Extras: `kilometraje?`, `transmision?`, `combustible?`
- Económicos: `costoCompra`, `precioVenta`
- `fechaIngreso` (para antigüedad), `estado` (default `DISPONIBLE`), `notas?`, timestamps
- Relaciones: `fotos` (VehiculoFoto[]), `venta?`, `sucursal`

### VehiculoFoto
- `id`, `vehiculoId`, `ruta`, `orden`, timestamps

### Venta
- `id`, `folio` (string, generado por sucursal: `serieFolio` + consecutivo), `sucursalId`, `vehiculoId` (único — un auto se vende una vez), `clienteId`, `empleadoId` (vendedor)
- `total`, `observaciones` (default "SIN GARANTÍA"), `fecha`, `pdfPath?`, timestamps
- Al registrar la venta: el vehículo pasa a `VENDIDO` y se incrementa el consecutivo de folio de la sucursal (en una transacción).

### Configuracion
- `diasAntiguedadAlerta` (int, editable — umbral para alertar autos con mucho tiempo en inventario)
- `terminosContrato` (texto editable de los términos y condiciones del contrato)
- (clave-valor o fila única)

### Auditoria
- `id`, `usuarioId`, `accion`, `entidad`, `entidadId?`, `datos?` (Json), `ip?`, `fecha` — igual que iBarber.

## 5. Generación de folio

Automático **por sucursal**. Cada sucursal tiene `serieFolio` (prefijo) y `consecutivoFolio`. Al crear una venta, dentro de una transacción Prisma se incrementa el consecutivo y se compone el folio (p. ej. `A-0602`). Esto evita duplicados y no depende del vendedor.

## 6. Módulos / pantallas (frontend)

- **Dashboard**
  - KPIs de ventas por **semana** y por **mes** (monto y cantidad).
  - Autos con **mayor antigüedad** en inventario, con alerta visual si superan el umbral configurado.
  - Gráfica de ventas de los **últimos 6 meses**.
  - ADMIN: consolidado de todas las sucursales + desglose por sucursal. VENDEDOR: solo su sucursal.
- **Ventas**
  - Flujo: seleccionar auto disponible del inventario → seleccionar/crear cliente → capturar total y observaciones → generar folio + **PDF del contrato**.
  - Pago en una sola exhibición (sin financiamiento/abonos, conforme al contrato).
  - Listado/registro de ventas con folio, fecha, sucursal, vehículo, cliente, vendedor, total; reimpresión del PDF.
- **Inventario**
  - Alta/edición de vehículos con fotos (subida de imágenes), filtros por sucursal/estado, indicador de antigüedad.
- **Reportes**
  - Ventas por periodo, por sucursal, por vendedor.
  - **Utilidad** (precioVenta − costoCompra).
  - Antigüedad del inventario.
- **Empleados**: alta/edición con selección de **sucursal**.
- **Sucursales**: alta/edición con logo y datos para el contrato (nombre, domicilio, colonia, CP, ciudad/estado, serie de folio).
- **Usuarios**: ADMIN / VENDEDOR, ligados a un empleado.
- **Configuración**: umbral de días de antigüedad y textos del contrato.

## 7. Contrato PDF (compra-venta)

Replica fiel del formato físico:
- Encabezado: **logo + nombre + domicilio de la sucursal**, recuadro **FOLIO** y **FECHA**.
- Recuadro del vehículo: Año, Marca, Modelo, Color, **las 17 casillas del VIN**, Placa.
- Texto legal fijo de responsabilidad.
- Bloque **VENDEDOR** (datos de la sucursal) y bloque **COMPRADOR** (datos del cliente), con líneas de firma.
- **TOTAL $**.
- **OBSERVACIONES** (default "SIN GARANTÍA").
- **Términos y condiciones** (texto editable desde Configuración).

Solo cambian los datos del comprador y del vehículo entre un contrato y otro. Implementado con plantilla HTML/CSS renderizada a PDF por Puppeteer; el PDF se guarda y se puede reimprimir.

## 8. Sucursales, inventario y ventas (regla de alcance)

- Inventario y ventas **por sucursal**: cada auto pertenece a una sucursal; la venta queda registrada en esa sucursal.
- El **vendedor** solo ve/vende autos de su sucursal; el **admin** ve todas.

## 9. Pruebas

- Tests de backend con Jest + Supertest (igual que iBarber): auth/roles, generación de folio por sucursal (transacción/consecutivo), creación de venta (cambio de estado del vehículo), aislamiento por sucursal (un vendedor no accede a otra sucursal), cálculo de KPIs/utilidad.

## 10. Fuera de alcance (YAGNI por ahora)

- Financiamiento, abonos o pagos parciales (el contrato es de una sola exhibición).
- Facturación fiscal (CFDI/FINKOK).
- App móvil.

## 11. Convenciones de despliegue/desarrollo

- Desarrollo local: migraciones Prisma contra `localhost:5437`; reconstrucción de contenedores como en iBarber (build + db push + renew-anon-volumes).
- Producción: VPS Debian con `docker-compose` (mismo patrón).
