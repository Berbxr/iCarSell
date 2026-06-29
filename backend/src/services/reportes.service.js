const prisma = require('../config/prisma');
const { rangoSemana } = require('../utils/semana');

async function ventas({ sucursalId, desde, hasta, esAdmin }) {
  const where = {};
  if (sucursalId !== undefined) where.sucursalId = sucursalId;
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }
  const lista = await prisma.venta.findMany({
    where, orderBy: { fecha: 'desc' },
    include: { vehiculo: true, cliente: { select: { nombre: true } }, empleado: { select: { nombre: true, apellidos: true } }, sucursal: { select: { nombre: true } } },
  });
  const totales = lista.reduce((a, v) => ({
    monto: a.monto + v.total,
    cantidad: a.cantidad + 1,
    utilidad: a.utilidad + (v.vehiculo ? v.vehiculo.precioVenta - v.vehiculo.costoCompra : 0),
    comision: a.comision + (v.comision || 0),
  }), { monto: 0, cantidad: 0, utilidad: 0, comision: 0 });

  if (!esAdmin) {
    const sinComision = lista.map(({ comision, ...resto }) => resto);
    const { comision, ...totalesSinComision } = totales;
    return { ventas: sinComision, totales: totalesSinComision };
  }
  return { ventas: lista, totales };
}

async function inventario({ sucursalId }) {
  const where = {};
  if (sucursalId !== undefined) where.sucursalId = sucursalId;
  const vehiculos = await prisma.vehiculo.findMany({ where, orderBy: { fechaIngreso: 'asc' }, include: { sucursal: { select: { nombre: true } } } });
  const ahora = new Date();
  const conDias = vehiculos.map((v) => ({ ...v, dias: Math.floor((ahora - new Date(v.fechaIngreso)) / 86400000) }));
  const porEstado = conDias.reduce((a, v) => { a[v.estado] = (a[v.estado] || 0) + 1; return a; }, {});
  return { vehiculos: conDias, porEstado };
}

async function comisiones({ sucursalId, fecha }) {
  const { inicio, fin } = rangoSemana(fecha ? new Date(fecha) : new Date());
  const where = { fecha: { gte: inicio, lte: fin } };
  if (sucursalId !== undefined) where.sucursalId = sucursalId;
  const lista = await prisma.venta.findMany({
    where, orderBy: { fecha: 'asc' },
    include: { vehiculo: { select: { anio: true, marca: true, modelo: true } }, empleado: { select: { id: true, nombre: true, apellidos: true } } },
  });
  const porVendedor = new Map();
  for (const v of lista) {
    if (!porVendedor.has(v.empleadoId)) {
      porVendedor.set(v.empleadoId, { empleadoId: v.empleadoId, nombre: v.empleado?.nombre || '', apellidos: v.empleado?.apellidos || '', ventas: [], total: 0 });
    }
    const g = porVendedor.get(v.empleadoId);
    g.ventas.push({ id: v.id, folio: v.folio, vehiculo: `${v.vehiculo?.anio ?? ''} ${v.vehiculo?.marca ?? ''} ${v.vehiculo?.modelo ?? ''}`.trim(), comision: v.comision || 0 });
    g.total += v.comision || 0;
  }
  const vendedores = [...porVendedor.values()];
  const totalGeneral = vendedores.reduce((a, g) => a + g.total, 0);
  return { inicio, fin, vendedores, totalGeneral };
}

module.exports = { ventas, inventario, comisiones };
