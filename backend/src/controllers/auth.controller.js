const prisma = require('../config/prisma');
const { verifyPassword, hashPassword } = require('../utils/password');
const { firmarToken } = require('../utils/jwt');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');

function usuarioPublico(u) {
  const sucursalId = u.empleado ? u.empleado.sucursalId : null;
  return {
    id: u.id, username: u.username, rol: u.rol,
    debeCambiarPassword: u.debeCambiarPassword,
    empleadoId: u.empleadoId ?? null,
    sucursalId,
    empleado: u.empleado
      ? { id: u.empleado.id, nombre: u.empleado.nombre, apellidos: u.empleado.apellidos, sucursalId: u.empleado.sucursalId }
      : null,
  };
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw new ApiError(400, 'username y password son obligatorios');
    const usuario = await prisma.usuario.findUnique({ where: { username }, include: { empleado: true } });
    if (!usuario) throw new ApiError(401, 'Credenciales inválidas');
    if (!usuario.activo) throw new ApiError(401, 'Usuario deshabilitado');
    const ok = await verifyPassword(password, usuario.passwordHash);
    if (!ok) throw new ApiError(401, 'Credenciales inválidas');
    const sucursalId = usuario.empleado ? usuario.empleado.sucursalId : null;
    const token = firmarToken({ id: usuario.id, rol: usuario.rol, sucursalId });
    await auditoria.registrar({ usuarioId: usuario.id, accion: 'LOGIN', entidad: 'Usuario', entidadId: usuario.id, ip: req.ip });
    res.json({ token, usuario: usuarioPublico(usuario) });
  } catch (e) { next(e); }
}

async function me(req, res, next) {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, include: { empleado: true } });
    if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
    res.json(usuarioPublico(usuario));
  } catch (e) { next(e); }
}

async function cambiarPassword(req, res, next) {
  try {
    const { passwordActual, passwordNueva } = req.body;
    if (!passwordActual || !passwordNueva) throw new ApiError(400, 'passwordActual y passwordNueva son obligatorios');
    if (passwordNueva.length < 6) throw new ApiError(400, 'La nueva contraseña debe tener al menos 6 caracteres');
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
    const ok = await verifyPassword(passwordActual, usuario.passwordHash);
    if (!ok) throw new ApiError(400, 'La contraseña actual es incorrecta');
    const passwordHash = await hashPassword(passwordNueva);
    await prisma.usuario.update({ where: { id: usuario.id }, data: { passwordHash, debeCambiarPassword: false } });
    await auditoria.registrar({ usuarioId: usuario.id, accion: 'CAMBIAR_PASSWORD_PROPIO', entidad: 'Usuario', entidadId: usuario.id, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

module.exports = { login, me, cambiarPassword };
