const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');

const CAMPOS = ['nombre', 'domicilio', 'colonia', 'codigoPostal', 'ciudadEstado', 'telefono'];

async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.buscar) where.nombre = { contains: req.query.buscar, mode: 'insensitive' };
    res.json(await prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' }, take: 100 }));
  } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try {
    const c = await prisma.cliente.findUnique({ where: { id: Number(req.params.id) } });
    if (!c) throw new ApiError(404, 'Cliente no encontrado');
    res.json(c);
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    if (!req.body.nombre) throw new ApiError(400, 'El nombre es obligatorio');
    const data = {};
    for (const k of CAMPOS) if (req.body[k] !== undefined) data[k] = req.body[k];
    const c = await prisma.cliente.create({ data });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_CLIENTE', entidad: 'Cliente', entidadId: c.id, ip: req.ip });
    res.status(201).json(c);
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = {};
    for (const k of CAMPOS) if (req.body[k] !== undefined) data[k] = req.body[k];
    const c = await prisma.cliente.update({ where: { id }, data });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_CLIENTE', entidad: 'Cliente', entidadId: id, ip: req.ip });
    res.json(c);
  } catch (e) { next(e); }
}

module.exports = { listar, obtener, crear, actualizar };
