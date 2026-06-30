# Diseño: Marca configurable (nombre + logo)

**Fecha:** 2026-06-30
**Estado:** Aprobado

## Contexto

La marca (nombre "iCarSell"/"EmpalmeMotors" y el logo) está hardcodeada en el
frontend (`Layout`, `Login`, `Bienvenida`, `index.html`). Se quiere hacerla
**configurable** desde la pantalla de Configuración (nombre + logo, preferencia
SVG) para que el sistema sea genérico y reutilizable por cualquier negocio. El
default vuelve a **iCarSell** con el **logo inet** original.

## Decisiones

1. **Almacenamiento:** el logo se guarda como **data URL** en `Configuracion.logo`
   (igual que `Sucursal.logo` y las fotos de vehículos). No se manejan archivos
   nuevos en disco. Preferencia SVG, pero acepta cualquier imagen.
2. **Nombre en texto plano** (un solo color) para que funcione con cualquier
   marca (se pierde el efecto de dos colores del nombre actual).
3. **Endpoint público de branding** para que el Login (sin sesión) pueda mostrar
   la marca.
4. **Title y favicon dinámicos** según la marca configurada.
5. **Default:** `nombreNegocio = "iCarSell"` y `frontend/public/logo.svg`
   restaurado al logo inet original (el del primer commit) como fallback.

## Backend

- `Configuracion`:
  - `nombreNegocio String @default("iCarSell")`
  - `logo String?` (data URL del logo; null = usar el fallback `/logo.svg`).
- `GET /api/configuracion/branding` — **público (sin auth)**, responde
  `{ nombre, logo }` (nombre = `nombreNegocio`, logo = `logo` o null).
- `PUT /api/configuracion` (ADMIN) acepta `nombreNegocio` (string no vacío) y
  `logo` (string data URL o null para quitarlo). El `GET /api/configuracion`
  (autenticado) sigue devolviendo la config completa, ahora con estos campos.
- Migración: agregar las dos columnas (manual, con timestamp posterior al
  último, aplicada con `migrate deploy`, siguiendo el patrón del proyecto).

## Frontend

- **Hook `useBranding()`** (`src/hooks/useBranding.js` o contexto): carga
  `/configuracion/branding` una vez al montar; expone `{ nombre, logo }` con
  defaults `{ nombre: 'iCarSell', logo: null }`. Como efecto secundario:
  - actualiza `document.title` al nombre;
  - actualiza el `<link rel="icon">` del documento al `logo` si existe (favicon
    dinámico).
- **Componentes que consumen la marca** (reemplazan el texto/logo hardcodeado):
  - `Layout` (sidebar): logo `<img src={logo || '/logo.svg'}>` + nombre como
    texto plano.
  - `Login`: logo + nombre.
  - `Bienvenida` (hero): nombre.
- **Logo fallback:** si `logo` es null, se usa `/logo.svg` (el logo inet por
  defecto que vive en `public/`).

## Configuración (UI)

- Nuevo apartado **"Identidad / Marca"** en `pages/Configuracion.jsx`:
  - Campo **Nombre del negocio**.
  - **Subir logo:** input `type=file` (acepta `image/svg+xml,image/*`); al
    seleccionar, se lee como **data URL** (`FileReader.readAsDataURL`) y se
    muestra una **vista previa**. Botón para **quitar** el logo (vuelve al
    fallback).
  - Guardar envía `nombreNegocio` y `logo` en el `PUT /configuracion`.
  - Tras guardar, refrescar el branding (recargar el hook o `window.location`)
    para que el sidebar/title/favicon reflejen el cambio.

## Default / "volver a iCarSell"

- El default de `nombreNegocio` es `"iCarSell"`; `logo` queda null (usa el
  fallback).
- Se restaura `frontend/public/logo.svg` al logo **inet** original (recuperado
  del primer commit del repo). Así, sin configurar nada, la app muestra iCarSell
  + logo inet; y desde Configuración se puede poner cualquier marca.

## Tests

- `GET /api/configuracion/branding` responde **sin token** con `{ nombre, logo }`.
- `PUT /api/configuracion` (ADMIN) guarda `nombreNegocio` y `logo`; rechaza
  `nombreNegocio` vacío.
- `GET /api/configuracion` incluye los nuevos campos.
- (Frontend sin runner: verificación por `npm run build` + manual.)

## Fuera de alcance (YAGNI)

- Múltiples temas/colores configurables (solo nombre + logo).
- Logo distinto por sucursal en la UI global (las sucursales ya tienen su propio
  logo para el contrato; esto es la marca global de la app).
- Recorte/redimensionado del logo en el navegador (se sube tal cual).
