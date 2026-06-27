class ApiError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function manejadorErrores(err, req, res, next) {
  const status = err.status || 500;
  const error = status === 500 ? 'Error interno del servidor' : err.message;
  if (status === 500) console.error(err);
  res.status(status).json({ error });
}

module.exports = { ApiError, manejadorErrores };
