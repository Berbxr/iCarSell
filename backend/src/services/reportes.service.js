const prisma = require('../config/prisma');
const { rangoSemana } = require('../utils/semana');
const { costoTotal } = require('../utils/costos');
const { usdAMxn } = require('../utils/cambio');

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
    include: { vehiculo: { include: { gastos: true } }, cliente: { select: { nombre: true } }, empleado: { select: { nombre: true, apellidos: true } }, sucursal: { select: { nombre: true } } },
  });
  const totales = lista.reduce((a, v) => ({
    monto: a.monto + v.total,
    cantidad: a.cantidad + 1,
    utilidad: a.utilidad + (v.vehiculo ? v.vehiculo.precioVenta - costoTotal(v.vehiculo) : 0),
    comision: a.comision + (v.comision || 0),
    efectivo: a.efectivo + (v.metodoPago === 'EFECTIVO' ? v.total : 0),
    transferencia: a.transferencia + (v.metodoPago === 'TRANSFERENCIA' ? v.total : 0),
  }), { monto: 0, cantidad: 0, utilidad: 0, comision: 0, efectivo: 0, transferencia: 0 });

  if (!esAdmin) {
    const CAMPOS_COSTO = ['precioCompra', 'comisionProveedor', 'transporte', 'registroPlacas', 'salidas'];
    const sinComision = lista.map(({ comision, vehiculo, ...resto }) => {
      let veh = vehiculo;
      if (veh) {
        veh = { ...veh };
        for (const k of CAMPOS_COSTO) delete veh[k];
        delete veh.gastos;
      }
      return { ...resto, vehiculo: veh };
    });
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

async function socios({ desde, hasta }) {
  const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
  const tipoCambio = config ? config.tipoCambioDolar || 0 : 0;
  const where = { estado: 'VENDIDO', venta: { isNot: null } };
  if (desde || hasta) {
    where.venta = { ...where.venta };
    where.venta.fecha = {};
    if (desde) where.venta.fecha.gte = new Date(desde);
    if (hasta) where.venta.fecha.lte = new Date(hasta);
  }
  const vehiculos = await prisma.vehiculo.findMany({
    where,
    include: { gastos: true, socio: { select: { id: true, nombre: true } }, venta: { select: { fecha: true } } },
  });
  const porSocio = new Map();
  const porMesMap = new Map();
  for (const v of vehiculos) {
    const utilidadUsd = (v.precioVenta || 0) - costoTotal(v);
    const sid = v.socioId;
    if (!porSocio.has(sid)) porSocio.set(sid, { socioId: sid, nombre: v.socio?.nombre || '', autos: [], totalUsd: 0, cantidad: 0 });
    const g = porSocio.get(sid);
    g.autos.push({ id: v.id, vehiculo: `${v.anio} ${v.marca} ${v.modelo}`, utilidadUsd });
    g.totalUsd += utilidadUsd;
    g.cantidad += 1;
    if (v.venta?.fecha) {
      const f = new Date(v.venta.fecha);
      const mes = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      porMesMap.set(mes, (porMesMap.get(mes) || 0) + utilidadUsd);
    }
  }
  const sociosArr = [...porSocio.values()].map((s) => ({ ...s, totalMxn: usdAMxn(s.totalUsd, tipoCambio) }));
  const totalGeneralUsd = sociosArr.reduce((a, s) => a + s.totalUsd, 0);
  const porMes = [...porMesMap.entries()].sort().map(([mes, utilidadUsd]) => ({ mes, utilidadUsd, utilidadMxn: usdAMxn(utilidadUsd, tipoCambio) }));
  return { tipoCambio, socios: sociosArr, porMes, totalGeneralUsd, totalGeneralMxn: usdAMxn(totalGeneralUsd, tipoCambio) };
}

module.exports = { ventas, inventario, comisiones, socios };
