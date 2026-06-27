const prisma = require('../config/prisma');

async function ventas({ sucursalId, desde, hasta }) {
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
  }), { monto: 0, cantidad: 0, utilidad: 0 });
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

module.exports = { ventas, inventario };
