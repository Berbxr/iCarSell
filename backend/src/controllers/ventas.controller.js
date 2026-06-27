const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { resolverSucursalLectura, resolverSucursalEscritura } = require('../utils/alcance');
const { crearVenta } = require('../services/ventas.service');
const { generarContratoPDF } = require('../services/contrato.service');
const auditoria = require('../services/auditoria.service');

const incluir = {
  vehiculo: true,
  cliente: true,
  empleado: { select: { id: true, nombre: true, apellidos: true } },
  sucursal: { select: { id: true, nombre: true } },
};

async function listar(req, res, next) {
  try {
    const where = {};
    const sucursalId = resolverSucursalLectura(req);
    if (sucursalId !== undefined) where.sucursalId = sucursalId;
    res.json(await prisma.venta.findMany({ where, orderBy: { fecha: 'desc' }, include: incluir }));
  } catch (e) { next(e); }
}

async function obtener(req, res, next) {
  try {
    const v = await prisma.venta.findUnique({ where: { id: Number(req.params.id) }, include: { ...incluir, sucursal: true } });
    if (!v) throw new ApiError(404, 'Venta no encontrada');
    res.json(v);
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const { vehiculoId, clienteId, total } = req.body;
    if (!vehiculoId || !clienteId || total == null) throw new ApiError(400, 'vehiculoId, clienteId y total son obligatorios');
    const sucursalId = resolverSucursalEscritura(req, req.body.sucursalId);
    let empleadoId = req.body.empleadoId;
    if (!empleadoId && req.usuario.rol === 'VENDEDOR') {
      const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
      empleadoId = u && u.empleadoId;
    }
    if (!empleadoId) throw new ApiError(400, 'empleadoId es obligatorio');
    const venta = await crearVenta({ sucursalId, vehiculoId, clienteId, empleadoId, total, observaciones: req.body.observaciones });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_VENTA', entidad: 'Venta', entidadId: venta.id, datos: { folio: venta.folio, total: venta.total }, ip: req.ip });
    res.status(201).json(venta);
  } catch (e) { next(e); }
}

// Genera un borrador del contrato (PDF) SIN registrar la venta. Folio = "BORRADOR".
async function contratoBorrador(req, res, next) {
  try {
    const sucursalId = resolverSucursalEscritura(req, req.body.sucursalId);
    const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!sucursal) throw new ApiError(404, 'Sucursal no encontrada');
    const vehiculo = req.body.vehiculoId ? await prisma.vehiculo.findUnique({ where: { id: Number(req.body.vehiculoId) } }) : null;
    let cliente = req.body.cliente || null;
    if (!cliente && req.body.clienteId) cliente = await prisma.cliente.findUnique({ where: { id: Number(req.body.clienteId) } });
    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    const pdf = await generarContratoPDF({
      folio: 'BORRADOR', total: Number(req.body.total) || 0,
      observaciones: req.body.observaciones && req.body.observaciones.trim() ? req.body.observaciones : 'SIN GARANTÍA',
      fecha: new Date(), terminos: config ? config.terminosContrato : '',
      sucursal, vehiculo: vehiculo || {}, cliente: cliente || {},
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="contrato-borrador.pdf"');
    res.send(pdf);
  } catch (e) { next(e); }
}

async function contratoPdf(req, res, next) {
  try {
    const v = await prisma.venta.findUnique({ where: { id: Number(req.params.id) }, include: { sucursal: true, vehiculo: true, cliente: true } });
    if (!v) throw new ApiError(404, 'Venta no encontrada');
    if (req.usuario.rol === 'VENDEDOR' && v.sucursalId !== req.usuario.sucursalId) throw new ApiError(403, 'No autorizado');
    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    const pdf = await generarContratoPDF({ ...v, terminos: config ? config.terminosContrato : '' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrato-${v.folio}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
}

module.exports = { listar, obtener, crear, contratoBorrador, contratoPdf };
