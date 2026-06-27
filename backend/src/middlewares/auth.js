const { verificarToken } = require('../utils/jwt');
const { ApiError } = require('./error');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Token no proporcionado'));
  }
  try {
    const payload = verificarToken(token);
    req.usuario = { id: payload.id, rol: payload.rol, sucursalId: payload.sucursalId ?? null };
    next();
  } catch (e) {
    next(new ApiError(401, 'Token inválido'));
  }
}

module.exports = auth;
