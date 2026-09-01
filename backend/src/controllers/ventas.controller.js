const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { resolverSucursalLectura } = require('../utils/alcance');
const { crearVenta, cancelarVenta } = require('../services/ventas.service');
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
    let empleadoId = req.body.empleadoId;
    if (!empleadoId && req.usuario.rol === 'VENDEDOR') {
      const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
      empleadoId = u && u.empleadoId;
    }
    if (!empleadoId) throw new ApiError(400, 'empleadoId es obligatorio');
    // El descuento (USD) solo lo aplica el ADMIN; para otros roles se ignora.
    const descuento = req.usuario.rol === 'ADMIN' ? req.body.descuento : 0;
    const venta = await crearVenta({ vehiculoId, clienteId, empleadoId, total, descuento, observaciones: req.body.observaciones, metodoPago: req.body.metodoPago });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_VENTA', entidad: 'Venta', entidadId: venta.id, datos: { folio: venta.folio, total: venta.total, descuento: venta.descuento }, ip: req.ip });
    res.status(201).json(venta);
  } catch (e) { next(e); }
}

// Cancela una venta (solo ADMIN, protegido en la ruta). Requiere motivo opcional.
async function cancelar(req, res, next) {
  try {
    const venta = await cancelarVenta({ ventaId: Number(req.params.id), motivo: req.body.motivo });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CANCELAR_VENTA', entidad: 'Venta', entidadId: venta.id, datos: { folio: venta.folio, total: venta.total, motivo: venta.motivoCancelacion }, ip: req.ip });
    res.json(venta);
  } catch (e) { next(e); }
}

// Genera un borrador del contrato (PDF) SIN registrar la venta. Folio = "BORRADOR".
async function contratoBorrador(req, res, next) {
  try {
    const vehiculo = req.body.vehiculoId ? await prisma.vehiculo.findUnique({ where: { id: Number(req.body.vehiculoId) } }) : null;
    const sucursalId = vehiculo ? vehiculo.sucursalId : (req.body.sucursalId ? Number(req.body.sucursalId) : null);
    if (!sucursalId) throw new ApiError(400, 'Seleccione un vehículo o una sucursal');
    const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!sucursal) throw new ApiError(404, 'Sucursal no encontrada');
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

module.exports = { listar, obtener, crear, cancelar, contratoBorrador, contratoPdf };
