const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { validarFoto } = require('../utils/foto');
const auditoria = require('../services/auditoria.service');

const CAMPOS = ['nombre', 'nombreComercial', 'domicilio', 'colonia', 'codigoPostal', 'ciudadEstado', 'telefono', 'serieFolio'];

async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.activo === 'true') where.activo = true;
    if (req.query.activo === 'false') where.activo = false;
    res.json(await prisma.sucursal.findMany({ where, orderBy: { nombre: 'asc' } }));
  } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try {
    const s = await prisma.sucursal.findUnique({ where: { id: Number(req.params.id) } });
    if (!s) throw new ApiError(404, 'Sucursal no encontrada');
    res.json(s);
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    if (!req.body.nombre) throw new ApiError(400, 'El nombre es obligatorio');
    const data = {};
    for (const c of CAMPOS) if (req.body[c] !== undefined) data[c] = req.body[c];
    data.logo = validarFoto(req.body.logo) ?? null;
    if (!data.serieFolio) data.serieFolio = 'A';
    const s = await prisma.sucursal.create({ data });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_SUCURSAL', entidad: 'Sucursal', entidadId: s.id, datos: { nombre: s.nombre }, ip: req.ip });
    res.status(201).json(s);
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = {};
    for (const c of CAMPOS) if (req.body[c] !== undefined) data[c] = req.body[c];
    const logo = validarFoto(req.body.logo);
    if (logo !== undefined) data.logo = logo;
    const s = await prisma.sucursal.update({ where: { id }, data });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_SUCURSAL', entidad: 'Sucursal', entidadId: id, ip: req.ip });
    res.json(s);
  } catch (e) { next(e); }
}

async function cambiarEstado(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body;
    if (typeof activo !== 'boolean') throw new ApiError(400, 'activo debe ser booleano');
    const s = await prisma.sucursal.update({ where: { id }, data: { activo } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: activo ? 'HABILITAR_SUCURSAL' : 'DESHABILITAR_SUCURSAL', entidad: 'Sucursal', entidadId: id, ip: req.ip });
    res.json(s);
  } catch (e) { next(e); }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
