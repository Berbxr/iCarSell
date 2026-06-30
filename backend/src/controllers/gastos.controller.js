const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');

async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.sucursalId) where.sucursalId = Number(req.query.sucursalId);
    if (req.query.desde || req.query.hasta) {
      where.fecha = {};
      if (req.query.desde) where.fecha.gte = new Date(req.query.desde);
      if (req.query.hasta) where.fecha.lte = new Date(req.query.hasta);
    }
    const gastos = await prisma.gastoGeneral.findMany({ where, orderBy: { fecha: 'desc' } });
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
