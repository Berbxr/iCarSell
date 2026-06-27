const { ApiError } = require('../middlewares/error');

// Para listados/reportes. ADMIN: undefined = todas, o filtra por ?sucursalId.
// VENDEDOR: siempre su sucursal.
function resolverSucursalLectura(req) {
  if (req.usuario.rol === 'ADMIN') {
    const q = req.query ? req.query.sucursalId : undefined;
    return q ? Number(q) : undefined;
  }
  if (!req.usuario.sucursalId) throw new ApiError(403, 'Usuario sin sucursal asignada');
  return req.usuario.sucursalId;
}

// Para crear/editar. ADMIN: debe indicar sucursalId. VENDEDOR: forzado al suyo.
function resolverSucursalEscritura(req, sucursalIdSolicitada) {
  if (req.usuario.rol === 'ADMIN') {
    if (!sucursalIdSolicitada) throw new ApiError(400, 'sucursalId es obligatorio');
    return Number(sucursalIdSolicitada);
  }
  if (!req.usuario.sucursalId) throw new ApiError(403, 'Usuario sin sucursal asignada');
  if (sucursalIdSolicitada && Number(sucursalIdSolicitada) !== req.usuario.sucursalId) {
    throw new ApiError(403, 'No puede operar en otra sucursal');
  }
  return req.usuario.sucursalId;
}

module.exports = { resolverSucursalLectura, resolverSucursalEscritura };
