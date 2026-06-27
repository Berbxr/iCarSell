const { ApiError } = require('./error');

function rbac(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return next(new ApiError(401, 'No autenticado'));
    if (!roles.includes(req.usuario.rol)) return next(new ApiError(403, 'No autorizado'));
    next();
  };
}

module.exports = rbac;
