const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { resolverSucursalLectura, resolverSucursalEscritura } = require('../utils/alcance');
const { procesarEntradas, eliminarArchivo } = require('../utils/fotosVehiculo');
const auditoria = require('../services/auditoria.service');

const ESTADOS = ['DISPONIBLE', 'RESERVADO', 'VENDIDO'];
const CAMPOS = ['marca', 'modelo', 'color', 'vin', 'placa', 'notas'];

function datosBase(body) {
  const data = {};
  for (const k of CAMPOS) if (body[k] !== undefined) data[k] = body[k];
  if (body.anio !== undefined) data.anio = Number(body.anio);
  if (body.kilometraje !== undefined) data.kilometraje = body.kilometraje === '' || body.kilometraje == null ? null : Number(body.kilometraje);
  if (body.costoCompra !== undefined) data.costoCompra = Number(body.costoCompra) || 0;
  if (body.precioVenta !== undefined) data.precioVenta = Number(body.precioVenta) || 0;
  if (body.transmision !== undefined) data.transmision = body.transmision || null;
  if (body.combustible !== undefined) data.combustible = body.combustible || null;
  return data;
}

async function listar(req, res, next) {
  try {
    const where = {};
    const sucursalId = resolverSucursalLectura(req);
    if (sucursalId !== undefined) where.sucursalId = sucursalId;
    if (req.query.estado && ESTADOS.includes(req.query.estado)) where.estado = req.query.estado;
    if (req.query.buscar) {
      where.OR = [
        { marca: { contains: req.query.buscar, mode: 'insensitive' } },
        { modelo: { contains: req.query.buscar, mode: 'insensitive' } },
        { vin: { contains: req.query.buscar, mode: 'insensitive' } },
      ];
    }
    res.json(await prisma.vehiculo.findMany({ where, orderBy: { fechaIngreso: 'desc' }, include: { sucursal: { select: { id: true, nombre: true } }, fotos: { orderBy: { orden: 'asc' }, take: 1 } } }));
  } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try {
    const v = await prisma.vehiculo.findUnique({ where: { id: Number(req.params.id) }, include: { fotos: { orderBy: { orden: 'asc' } }, sucursal: true } });
    if (!v) throw new ApiError(404, 'Vehículo no encontrado');
    res.json(v);
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const { anio, marca, modelo } = req.body;
    if (!anio || !marca || !modelo) throw new ApiError(400, 'anio, marca y modelo son obligatorios');
    const sucursalId = resolverSucursalEscritura(req, req.body.sucursalId);
    const data = { ...datosBase(req.body), sucursalId };
    // Comprimir y escribir las fotos a disco ANTES de la transacción (trabajo pesado fuera de la BD).
    const rutas = Array.isArray(req.body.fotos) ? await procesarEntradas(req.body.fotos) : [];
    const v = await prisma.$transaction(async (tx) => {
      const creado = await tx.vehiculo.create({ data });
      if (rutas.length) await tx.vehiculoFoto.createMany({ data: rutas.map((d, i) => ({ vehiculoId: creado.id, data: d, orden: i })) });
      return tx.vehiculo.findUnique({ where: { id: creado.id }, include: { fotos: { orderBy: { orden: 'asc' } } } });
    });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_VEHICULO', entidad: 'Vehiculo', entidadId: v.id, datos: { marca, modelo, anio }, ip: req.ip });
    res.status(201).json(v);
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = datosBase(req.body);
    if (req.body.sucursalId !== undefined) data.sucursalId = resolverSucursalEscritura(req, req.body.sucursalId);

    let rutas; let aBorrar = [];
    if (req.body.fotos !== undefined) {
      const existentes = await prisma.vehiculoFoto.findMany({ where: { vehiculoId: id } });
      rutas = Array.isArray(req.body.fotos) ? await procesarEntradas(req.body.fotos) : [];
      const conservadas = new Set(rutas);
      aBorrar = existentes.filter((e) => !conservadas.has(e.data)).map((e) => e.data);
    }

    const v = await prisma.$transaction(async (tx) => {
      await tx.vehiculo.update({ where: { id }, data });
      if (rutas !== undefined) {
        await tx.vehiculoFoto.deleteMany({ where: { vehiculoId: id } });
        if (rutas.length) await tx.vehiculoFoto.createMany({ data: rutas.map((d, i) => ({ vehiculoId: id, data: d, orden: i })) });
      }
      return tx.vehiculo.findUnique({ where: { id }, include: { fotos: { orderBy: { orden: 'asc' } } } });
    });
    // Eliminar de disco las fotos quitadas (tras confirmar el commit).
    aBorrar.forEach(eliminarArchivo);

    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_VEHICULO', entidad: 'Vehiculo', entidadId: id, ip: req.ip });
    res.json(v);
  } catch (e) { next(e); }
}

async function cambiarEstado(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;
    if (!ESTADOS.includes(estado)) throw new ApiError(400, 'Estado inválido');
    const v = await prisma.vehiculo.update({ where: { id }, data: { estado } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CAMBIAR_ESTADO_VEHICULO', entidad: 'Vehiculo', entidadId: id, datos: { estado }, ip: req.ip });
    res.json(v);
  } catch (e) { next(e); }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
