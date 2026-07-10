# Alerta de VIN duplicado en inventario

**Fecha:** 2026-07-08
**Proyecto:** iCarSell

## Problema

Actualmente el campo `vin` del modelo `Vehiculo` es opcional (`String?`) y no tiene
restricción de unicidad. Es posible registrar dos veces el mismo auto físico (mismo
VIN) en el inventario, lo que genera duplicados y descuadres.

## Objetivo

Impedir el registro de vehículos con un VIN que ya existe en el sistema, avisando al
usuario de forma clara **cuál** vehículo ya lo tiene.

## Decisiones de diseño (confirmadas)

1. **Comportamiento:** Bloquear (rechazar) el guardado si el VIN ya existe.
2. **Alcance:** Global — el VIN es único en todo el sistema, sin importar la sucursal.
3. **Estados:** Cuenta cualquier estado, incluidos los `VENDIDO`.
4. **Normalización:** El VIN se guarda en mayúsculas y sin espacios
   (`trim().toUpperCase()`), para que la comparación sea confiable.
5. **Chequeo en vivo:** Sí, aviso inmediato al salir del campo VIN (`onBlur`), además
   del bloqueo al guardar.
6. **Garantía en BD:** Sí, restricción `@unique` en `vin` como respaldo definitivo.

El VIN es opcional: **la validación solo aplica cuando se captura un VIN no vacío.**
Varios vehículos sin VIN (`null`) siguen siendo válidos (Postgres permite múltiples
`NULL` bajo una restricción `@unique`).

## Cambios

### 1. Base de datos — `backend/prisma/schema.prisma`

Añadir `@unique` al campo `vin` del modelo `Vehiculo`:

```prisma
vin          String?  @unique
```

**Pasos previos obligatorios** (antes de aplicar la migración `@unique`):

1. **Normalizar los VINs existentes** a mayúsculas y convertir vacíos en `null`, para
   que coincidan con la nueva normalización de la aplicación:

   ```sql
   UPDATE "Vehiculo" SET vin = NULL WHERE vin = '';
   UPDATE "Vehiculo" SET vin = UPPER(TRIM(vin)) WHERE vin IS NOT NULL;
   ```

2. **Detectar duplicados** (case-insensitive, porque tras normalizar dos VINs que hoy
   difieren solo en mayúsculas chocarán):

   ```sql
   SELECT UPPER(TRIM(vin)) AS v, COUNT(*) FROM "Vehiculo"
   WHERE vin IS NOT NULL AND vin <> ''
   GROUP BY UPPER(TRIM(vin)) HAVING COUNT(*) > 1;
   ```

Si hay resultados, se limpian/corrigen manualmente antes de migrar. La migración se
aplica con el flujo Prisma habitual del proyecto (contra la BD dockerizada) y luego se
reconstruyen los contenedores.

**Nota sobre cadenas vacías:** para que la unicidad funcione bien con la
normalización, un VIN vacío (`''`) debe guardarse como `null`, no como cadena vacía
(dos `''` chocarían con `@unique`). Esto se maneja en la normalización (ver abajo).

### 2. Backend — `backend/src/controllers/vehiculos.controller.js`

**Normalización en `datosBase()`:** al procesar el campo `vin`, aplicar
`trim().toUpperCase()`; si queda vacío, guardar `null`.

```js
if (body.vin !== undefined) {
  const v = String(body.vin).trim().toUpperCase();
  data.vin = v === '' ? null : v;
}
```

(Se saca `vin` del bucle genérico `CAMPOS` para darle este tratamiento especial, o se
normaliza después del bucle.)

**Nueva función `validarVinUnico(vin, idExcluir)`:**

```js
async function validarVinUnico(vin, idExcluir) {
  if (!vin) return; // sin VIN no se valida
  const existente = await prisma.vehiculo.findFirst({
    where: { vin, ...(idExcluir ? { id: { not: idExcluir } } : {}) },
    include: { sucursal: { select: { nombre: true } } },
  });
  if (existente) {
    throw new ApiError(409,
      `El VIN ${vin} ya está registrado en ${existente.marca} ${existente.modelo} ` +
      `${existente.anio} (sucursal ${existente.sucursal.nombre}).`);
  }
}
```

- En `crear()`: llamar `await validarVinUnico(data.vin, null)` tras construir `data` y
  antes de la transacción.
- En `actualizar()`: llamar `await validarVinUnico(data.vin, id)` (excluye el propio
  vehículo) antes de la transacción. Solo se valida si `data.vin` viene definido en el
  payload.

**Nuevo endpoint de chequeo en vivo — `vinExiste(req, res, next)`:**

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

### 3. Rutas — `backend/src/routes/vehiculos.routes.js`

Registrar el endpoint **antes** de `router.get('/:id', ...)` para que `vin-existe` no
se capture como un `:id`:

```js
router.get('/vin-existe', ctrl.vinExiste);
```

Mismo nivel de permisos que la lectura de vehículos (autenticado; sin `rbac`
adicional, igual que `listar`/`obtener`).

### 4. Frontend — `frontend/src/pages/Compra.jsx`

**Bloqueo al guardar:** ya funciona sin cambios. `guardar()` captura el error y hace
`setError(err.response?.data?.error || 'Error al guardar')`, así que el mensaje 409 del
backend se muestra automáticamente.

**Chequeo en vivo (`onBlur` del campo VIN):**

- Nuevo estado `const [vinAviso, setVinAviso] = useState('')`.
- Función `async function verificarVin()` que, si `form.vin` no está vacío, llama a
  `GET /vehiculos/vin-existe?vin=<vin>&excluir=<editId||''>` y setea `vinAviso` con un
  texto tipo `Este VIN ya está registrado en <descripcion>`, o lo limpia si no existe.
- En el `<input>` del VIN: añadir `onBlur={verificarVin}` y, al cambiar el valor,
  limpiar el aviso (`set('vin', ...)` → también `setVinAviso('')`).
- Debajo del input, mostrar `vinAviso` en rojo cuando exista (mismo estilo que los
  mensajes de error del formulario).

El aviso en vivo es informativo/temprano; la barrera real es el bloqueo del backend
(y la restricción `@unique`), que evita condiciones de carrera.

## Pruebas

- **Backend (`backend/tests/`):** siguiendo el patrón de `contrato.test.js`:
  - Crear vehículo con VIN nuevo → 201.
  - Crear segundo vehículo con el mismo VIN (misma y distinta sucursal) → 409.
  - Mismo VIN en distinta capitalización/espacios → 409 (normalización).
  - Crear dos vehículos sin VIN → ambos 201 (los `null` no chocan).
  - Editar un vehículo conservando su propio VIN → OK (no choca consigo mismo).
  - Endpoint `vin-existe`: responde `{existe:true, descripcion}` y `{existe:false}`.
- **Manual:** verificar el aviso en vivo `onBlur` en Compra.jsx.

## Fuera de alcance

- Búsqueda difusa o sugerencia de VINs similares.
- Validación del formato/checksum del VIN de 17 caracteres (solo se limita longitud en
  el input, como hoy).
