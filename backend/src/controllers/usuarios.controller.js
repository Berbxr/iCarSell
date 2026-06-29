const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { hashPassword } = require('../utils/password');
const auditoria = require('../services/auditoria.service');

function pub(u) {
  return { id: u.id, username: u.username, rol: u.rol, activo: u.activo, debeCambiarPassword: u.debeCambiarPassword, empleadoId: u.empleadoId ?? null, empleado: u.empleado ?? undefined };
}

async function listar(req, res, next) {
  try {
    const usuarios = await prisma.usuario.findMany({ orderBy: { username: 'asc' }, include: { empleado: { select: { id: true, nombre: true, apellidos: true, sucursalId: true } } } });
    res.json(usuarios.map(pub));
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const { username, password, rol, empleadoId } = req.body;
    if (!username || !password || !rol) throw new ApiError(400, 'username, password y rol son obligatorios');
    if (!['ADMIN', 'VENDEDOR', 'ALMACEN'].includes(rol)) throw new ApiError(400, 'Rol inválido');
    if (password.length < 6) throw new ApiError(400, 'La contraseña debe tener al menos 6 caracteres');
    const existe = await prisma.usuario.findUnique({ where: { username } });
    if (existe) throw new ApiError(409, 'El username ya existe');
    const passwordHash = await hashPassword(password);
    const u = await prisma.usuario.create({ data: { username, passwordHash, rol, empleadoId: empleadoId ? Number(empleadoId) : null, debeCambiarPassword: true } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_USUARIO', entidad: 'Usuario', entidadId: u.id, datos: { username, rol }, ip: req.ip });
    res.status(201).json(pub(u));
  } catch (e) { next(e); }
}

async function cambiarEstado(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body;
    if (typeof activo !== 'boolean') throw new ApiError(400, 'activo debe ser booleano');
    const u = await prisma.usuario.update({ where: { id }, data: { activo } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: activo ? 'HABILITAR_USUARIO' : 'DESHABILITAR_USUARIO', entidad: 'Usuario', entidadId: id, ip: req.ip });
    res.json(pub(u));
  } catch (e) { next(e); }
}

async function resetPassword(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { password } = req.body;
    if (!password || password.length < 6) throw new ApiError(400, 'La contraseña debe tener al menos 6 caracteres');
    const passwordHash = await hashPassword(password);
    await prisma.usuario.update({ where: { id }, data: { passwordHash, debeCambiarPassword: true } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'RESET_PASSWORD', entidad: 'Usuario', entidadId: id, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

module.exports = { listar, crear, cambiarEstado, resetPassword };
