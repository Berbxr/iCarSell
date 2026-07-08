const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { resolverSucursalEscritura } = require('../utils/alcance');
const { procesarEntradas, eliminarArchivo } = require('../utils/fotosVehiculo');
const { vistaVehiculo } = require('../utils/costos');
const auditoria = require('../services/auditoria.service');

const ESTADOS = ['EN_COMPRA', 'DISPONIBLE', 'RESERVADO', 'VENDIDO'];
const CAMPOS = ['marca', 'modelo', 'color', 'placa', 'notas'];
const SOCIO_SEL = { select: { id: true, nombre: true } };
const INCLUDE_DETALLE = { fotos: { orderBy: { orden: 'asc' } }, gastos: true, venta: { select: { fecha: true } }, socio: SOCIO_SEL };

function datosBase(body) {
  const data = {};
  for (const k of CAMPOS) if (body[k] !== undefined) data[k] = body[k];
  if (body.vin !== undefined) {
    const v = String(body.vin).trim().toUpperCase();
    data.vin = v === '' ? null : v;
  }
  if (body.anio !== undefined) data.anio = Number(body.anio);
  if (body.kilometraje !== undefined) data.kilometraje = body.kilometraje === '' || body.kilometraje == null ? null : Number(body.kilometraje);
  for (const k of ['precioCompra', 'comisionProveedor', 'transporte', 'registroPlacas', 'salidas']) {
    if (body[k] !== undefined) data[k] = Number(body[k]) || 0;
  }
  if (body.precioVenta !== undefined) data.precioVenta = Number(body.precioVenta) || 0;
  if (body.transmision !== undefined) data.transmision = body.transmision || null;
  if (body.combustible !== undefined) data.combustible = body.combustible || null;
  if (body.socioId !== undefined) data.socioId = Number(body.socioId);
  return data;
}

async function validarVinUnico(vin, idExcluir) {
  if (!vin) return;
  const existente = await prisma.vehiculo.findFirst({
    where: { vin, ...(idExcluir ? { id: { not: idExcluir } } : {}) },
    include: { sucursal: { select: { nombre: true } } },
  });
  if (existente) {
    throw new ApiError(409,
      `El VIN ${vin} ya está registrado en ${existente.marca} ${existente.modelo} ${existente.anio} (sucursal ${existente.sucursal.nombre}).`);
  }
}

async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.sucursalId) where.sucursalId = Number(req.query.sucursalId);
    if (req.query.socioId) where.socioId = Number(req.query.socioId);
    if (req.query.inventario === 'compra') where.estado = 'EN_COMPRA';
    else if (req.query.inventario === 'venta') where.estado = { in: ['DISPONIBLE', 'RESERVADO', 'VENDIDO'] };
    else if (req.query.estado && ESTADOS.includes(req.query.estado)) where.estado = req.query.estado;
    if (req.query.buscar) {
      where.OR = [
        { marca: { contains: req.query.buscar, mode: 'insensitive' } },
        { modelo: { contains: req.query.buscar, mode: 'insensitive' } },
        { vin: { contains: req.query.buscar, mode: 'insensitive' } },
      ];
    }
    const lista = await prisma.vehiculo.findMany({ where, orderBy: { fechaIngreso: 'desc' }, include: { sucursal: { select: { id: true, nombre: true } }, fotos: { orderBy: { orden: 'asc' }, take: 1 }, gastos: true, venta: { select: { fecha: true } }, socio: SOCIO_SEL } });
    res.json(lista.map((v) => vistaVehiculo(v, req.usuario.rol)));
  } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try {
    const v = await prisma.vehiculo.findUnique({ where: { id: Number(req.params.id) }, include: { fotos: { orderBy: { orden: 'asc' } }, sucursal: true, gastos: { orderBy: { createdAt: 'asc' } }, venta: { select: { fecha: true } }, socio: SOCIO_SEL } });
    if (!v) throw new ApiError(404, 'Vehículo no encontrado');
    res.json(vistaVehiculo(v, req.usuario.rol));
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const { anio, marca, modelo } = req.body;
    if (!anio || !marca || !modelo) throw new ApiError(400, 'anio, marca y modelo son obligatorios');
    if (!req.body.socioId) throw new ApiError(400, 'El socio es obligatorio');
    const sucursalId = resolverSucursalEscritura(req, req.body.sucursalId);
    const data = { ...datosBase(req.body), sucursalId, estado: 'EN_COMPRA' };
    await validarVinUnico(data.vin, null);
    // Comprimir y escribir las fotos a disco ANTES de la transacción (trabajo pesado fuera de la BD).
    const rutas = Array.isArray(req.body.fotos) ? await procesarEntradas(req.body.fotos) : [];
    const v = await prisma.$transaction(async (tx) => {
      const creado = await tx.vehiculo.create({ data });
      if (rutas.length) await tx.vehiculoFoto.createMany({ data: rutas.map((d, i) => ({ vehiculoId: creado.id, data: d, orden: i })) });
      return tx.vehiculo.findUnique({ where: { id: creado.id }, include: INCLUDE_DETALLE });
    });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_VEHICULO', entidad: 'Vehiculo', entidadId: v.id, datos: { marca, modelo, anio }, ip: req.ip });
    res.status(201).json(vistaVehiculo(v, req.usuario.rol));
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = datosBase(req.body);
    if (data.vin !== undefined) await validarVinUnico(data.vin, id);
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
      return tx.vehiculo.findUnique({ where: { id }, include: INCLUDE_DETALLE });
    });
    // Eliminar de disco las fotos quitadas (tras confirmar el commit).
    aBorrar.forEach(eliminarArchivo);

    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_VEHICULO', entidad: 'Vehiculo', entidadId: id, ip: req.ip });
    res.json(vistaVehiculo(v, req.usuario.rol));
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

async function agregarGasto(req, res, next) {
  try {
    const vehiculoId = Number(req.params.id);
    const { descripcion, monto } = req.body;
    if (!descripcion || !String(descripcion).trim() || monto == null || !Number.isFinite(Number(monto))) {
      throw new ApiError(400, 'descripcion y monto son obligatorios');
    }
    const gasto = await prisma.gastoVehiculo.create({ data: { vehiculoId, descripcion: String(descripcion).trim(), monto: Number(monto) } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'AGREGAR_GASTO_VEHICULO', entidad: 'GastoVehiculo', entidadId: gasto.id, datos: { vehiculoId, monto: gasto.monto }, ip: req.ip });
    res.status(201).json(gasto);
  } catch (e) { next(e); }
}

async function eliminarGasto(req, res, next) {
  try {
    const gastoId = Number(req.params.gastoId);
    await prisma.gastoVehiculo.delete({ where: { id: gastoId } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'ELIMINAR_GASTO_VEHICULO', entidad: 'GastoVehiculo', entidadId: gastoId, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

async function pasarAVenta(req, res, next) {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.vehiculo.findUnique({ where: { id } });
    if (!actual) throw new ApiError(404, 'Vehículo no encontrado');
    if (!(Number(actual.precioVenta) > 0)) throw new ApiError(400, 'Debe capturar un precio de venta mayor a 0 antes de pasar a venta');
    if (actual.estado !== 'EN_COMPRA') throw new ApiError(409, 'El vehículo no está en el inventario de compra');
    await prisma.vehiculo.update({ where: { id }, data: { estado: 'DISPONIBLE', fechaPaseAVenta: new Date() } });
    const v = await prisma.vehiculo.findUnique({ where: { id }, include: { gastos: true, venta: { select: { fecha: true } } } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'PASAR_A_VENTA', entidad: 'Vehiculo', entidadId: id, ip: req.ip });
    res.json(vistaVehiculo(v, req.usuario.rol));
  } catch (e) { next(e); }
}

async function vinExiste(req, res, next) {
  try {
    const vin = String(req.query.vin || '').trim().toUpperCase();
    const excluir = req.query.excluir ? Number(req.query.excluir) : null;
    if (!vin) return res.json({ existe: false });
    const v = await prisma.vehiculo.findFirst({
      where: { vin, ...(excluir ? { id: { not: excluir } } : {}) },
      include: { sucursal: { select: { nombre: true } } },
    });
    res.json(v
      ? { existe: true, descripcion: `${v.marca} ${v.modelo} ${v.anio} (${v.sucursal.nombre})` }
      : { existe: false });
  } catch (e) { next(e); }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, agregarGasto, eliminarGasto, pasarAVenta, vinExiste };
