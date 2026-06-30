const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');

async function listar(req, res, next) {
  try {
    res.json(await prisma.socio.findMany({ orderBy: { nombre: 'asc' } }));
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) throw new ApiError(400, 'El nombre es obligatorio');
    const socio = await prisma.socio.create({ data: { nombre } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_SOCIO', entidad: 'Socio', entidadId: socio.id, ip: req.ip });
    res.status(201).json(socio);
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) throw new ApiError(400, 'El nombre es obligatorio');
    const socio = await prisma.socio.update({ where: { id }, data: { nombre } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_SOCIO', entidad: 'Socio', entidadId: id, ip: req.ip });
    res.json(socio);
  } catch (e) { next(e); }
}

async function cambiarEstado(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (typeof req.body.activo !== 'boolean') throw new ApiError(400, 'activo debe ser booleano');
    const socio = await prisma.socio.update({ where: { id }, data: { activo: req.body.activo } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'ESTADO_SOCIO', entidad: 'Socio', entidadId: id, ip: req.ip });
    res.json(socio);
  } catch (e) { next(e); }
}

module.exports = { listar, crear, actualizar, cambiarEstado };
