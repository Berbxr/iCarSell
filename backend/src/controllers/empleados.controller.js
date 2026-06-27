const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { resolverSucursalLectura, resolverSucursalEscritura } = require('../utils/alcance');
const auditoria = require('../services/auditoria.service');

async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.activo === 'true') where.activo = true;
    if (req.query.activo === 'false') where.activo = false;
    const sucursalId = resolverSucursalLectura(req);
    if (sucursalId !== undefined) where.sucursalId = sucursalId;
    res.json(await prisma.empleado.findMany({ where, orderBy: { nombre: 'asc' }, include: { sucursal: { select: { id: true, nombre: true } } } }));
  } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try {
    const empleado = await prisma.empleado.findUnique({ where: { id: Number(req.params.id) }, include: { sucursal: true } });
    if (!empleado) throw new ApiError(404, 'Empleado no encontrado');
    res.json(empleado);
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const { nombre, apellidos, telefono, email, puesto } = req.body;
    if (!nombre || !apellidos || !puesto) throw new ApiError(400, 'nombre, apellidos y puesto son obligatorios');
    const sucursalId = resolverSucursalEscritura(req, req.body.sucursalId);
    const empleado = await prisma.empleado.create({ data: { nombre, apellidos, telefono, email, puesto, sucursalId } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_EMPLEADO', entidad: 'Empleado', entidadId: empleado.id, datos: { nombre, apellidos, puesto }, ip: req.ip });
    res.status(201).json(empleado);
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { nombre, apellidos, telefono, email, puesto } = req.body;
    const data = { nombre, apellidos, telefono, email, puesto };
    if (req.body.sucursalId !== undefined) data.sucursalId = resolverSucursalEscritura(req, req.body.sucursalId);
    const empleado = await prisma.empleado.update({ where: { id }, data });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_EMPLEADO', entidad: 'Empleado', entidadId: id, ip: req.ip });
    res.json(empleado);
  } catch (e) { next(e); }
}

async function cambiarEstado(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body;
    if (typeof activo !== 'boolean') throw new ApiError(400, 'activo debe ser booleano');
    const empleado = await prisma.empleado.update({ where: { id }, data: { activo } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: activo ? 'HABILITAR_EMPLEADO' : 'DESHABILITAR_EMPLEADO', entidad: 'Empleado', entidadId: id, ip: req.ip });
    res.json(empleado);
  } catch (e) { next(e); }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
