const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');
const { gastosDeAutos, CATEGORIA_GASTOS_AUTO } = require('../utils/gastosAuto');

// "hasta" debe incluir todo el día, no solo la medianoche exacta (00:00:00),
// o excluye cualquier gasto registrado más tarde ese mismo día.
function finDeDia(fecha) {
  const d = new Date(fecha);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function enRango(fecha, desde, hasta) {
  if (!fecha) return false; // sin fecha capturada, no se puede ubicar en un rango
  const t = new Date(fecha).getTime();
  if (desde && t < new Date(desde).getTime()) return false;
  if (hasta && t > finDeDia(hasta).getTime()) return false;
  return true;
}

async function listar(req, res, next) {
  try {
    const { desde, hasta, sucursalId } = req.query;

    const whereGeneral = {};
    if (sucursalId) whereGeneral.sucursalId = Number(sucursalId);
    if (desde || hasta) {
      whereGeneral.fecha = {};
      if (desde) whereGeneral.fecha.gte = new Date(desde);
      if (hasta) whereGeneral.fecha.lte = finDeDia(hasta);
    }
    const generales = await prisma.gastoGeneral.findMany({ where: whereGeneral, orderBy: { fecha: 'desc' } });

    // Costos del inventario de compra (Precio compra, Comisión proveedor, Transporte,
    // Registro/Placas, Salidas y "Otros costos/gastos"): opcionalmente se muestran aquí como
    // "Gastos de autos", calculados al vuelo desde Vehiculo/GastoVehiculo (no se duplican en
    // GastoGeneral). Ocultos por defecto; se activan en Configuración > mostrarGastosAutos.
    let autos = [];
    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    if (config?.mostrarGastosAutos) {
      const whereVehiculo = { activo: true };
      if (sucursalId) whereVehiculo.sucursalId = Number(sucursalId);
      const vehiculos = await prisma.vehiculo.findMany({
        where: whereVehiculo,
        select: {
          id: true, marca: true, modelo: true, anio: true,
          precioCompra: true, fechaCompra: true,
          comisionProveedor: true, fechaComisionProveedor: true,
          transporte: true, fechaTransporte: true,
          registroPlacas: true, fechaRegistroPlacas: true,
          salidas: true, fechaSalidas: true,
          gastos: true,
        },
      });
      autos = gastosDeAutos(vehiculos);
      if (desde || hasta) autos = autos.filter((g) => enRango(g.fecha, desde, hasta));
    }

    const gastos = [...generales.map((g) => ({ ...g, tipo: 'general' })), ...autos]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const total = gastos.reduce((a, g) => a + g.monto, 0);
    const porCategoria = gastos.reduce((a, g) => { a[g.categoria] = (a[g.categoria] || 0) + g.monto; return a; }, {});
    res.json({ gastos, total, porCategoria });
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const categoria = (req.body.categoria || '').trim();
    const descripcion = (req.body.descripcion || '').trim();
    const monto = Number(req.body.monto);
    if (!categoria || !descripcion) throw new ApiError(400, 'categoria y descripcion son obligatorias');
    if (!Number.isFinite(monto) || monto < 0) throw new ApiError(400, 'monto debe ser un número >= 0');
    if (categoria.toLowerCase() === CATEGORIA_GASTOS_AUTO.toLowerCase()) {
      throw new ApiError(400, `"${CATEGORIA_GASTOS_AUTO}" es una categoría reservada: se genera automáticamente desde Inventario de compra`);
    }
    const data = { categoria, descripcion, monto };
    if (req.body.sucursalId) data.sucursalId = Number(req.body.sucursalId);
    if (req.body.fecha) data.fecha = new Date(req.body.fecha);
    const gasto = await prisma.gastoGeneral.create({ data });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'CREAR_GASTO', entidad: 'GastoGeneral', entidadId: gasto.id, datos: { categoria, monto }, ip: req.ip });
    res.status(201).json(gasto);
  } catch (e) { next(e); }
}

async function eliminar(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.gastoGeneral.delete({ where: { id } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'ELIMINAR_GASTO', entidad: 'GastoGeneral', entidadId: id, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

module.exports = { listar, crear, eliminar };
