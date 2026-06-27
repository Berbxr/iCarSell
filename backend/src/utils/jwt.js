const jwt = require('jsonwebtoken');

function firmarToken({ id, rol, sucursalId = null }) {
  return jwt.sign({ id, rol, sucursalId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function verificarToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { firmarToken, verificarToken };
