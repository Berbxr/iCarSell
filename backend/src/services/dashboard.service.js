const prisma = require('../config/prisma');
const { costoTotal } = require('../utils/costos');
const { usdAMxn } = require('../utils/cambio');

function inicioSemana(d = new Date()) {
  const x = new Date(d); const dia = (x.getDay() + 6) % 7; // lunes=0
  x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - dia); return x;
}
function inicioMes(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function diasEntre(a, b) { return Math.floor((a - b) / (1000 * 60 * 60 * 24)); }

async function kpis({ sucursalId, diasAlerta = 60 }) {
  const whereSuc = sucursalId !== undefined ? { sucursalId } : {};
  const ahora = new Date();
  const hace6Meses = new Date(ahora.getFullYear(), ahora.getMonth() - 5, 1);

  const ventas = await prisma.venta.findMany({
    where: { ...whereSuc, estado: 'ACTIVA', fecha: { gte: hace6Meses } },
    select: { total: true, fecha: true, empleado: { select: { id: true, nombre: true, apellidos: true } } },
  });

  const semDesde = inicioSemana(ahora);
  const mesDesde = inicioMes(ahora);
  const acum = (desde) => ventas.filter((v) => v.fecha >= desde)
    .reduce((a, v) => ({ monto: a.monto + v.total, cantidad: a.cantidad + 1 }), { monto: 0, cantidad: 0 });

  // 6 meses (incluye meses sin ventas en 0)
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const clave = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    meses.push({ mes: clave, monto: 0, cantidad: 0 });
  }
  for (const v of ventas) {
    const f = new Date(v.fecha);
    const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
    const item = meses.find((x) => x.mes === clave);
    if (item) { item.monto += v.total; item.cantidad += 1; }
  }

  const disponibles = await prisma.vehiculo.findMany({
    where: { ...whereSuc, estado: 'DISPONIBLE' },
    orderBy: { fechaIngreso: 'asc' },
    take: 10,
    include: { sucursal: { select: { id: true, nombre: true } } },
  });
  const antiguedad = disponibles.map((v) => {
    const dias = diasEntre(ahora, new Date(v.fechaIngreso));
    return { id: v.id, marca: v.marca, modelo: v.modelo, anio: v.anio, sucursal: v.sucursal, fechaIngreso: v.fechaIngreso, dias, enAlerta: dias >= diasAlerta };
  });

  // Ventas por empleado (en la ventana de 6 meses), ordenadas por cantidad.
  const porEmpleado = new Map();
  for (const v of ventas) {
    if (!v.empleado) continue;
    const k = v.empleado.id;
    const actual = porEmpleado.get(k) || { empleadoId: k, nombre: `${v.empleado.nombre} ${v.empleado.apellidos}`, cantidad: 0, monto: 0 };
    actual.cantidad += 1;
    actual.monto += v.total;
    porEmpleado.set(k, actual);
  }
  const ventasPorEmpleado = [...porEmpleado.values()].sort((a, b) => b.cantidad - a.cantidad);

  // Último auto vendido.
  const ult = await prisma.venta.findFirst({
    where: { ...whereSuc, estado: 'ACTIVA' },
    orderBy: { fecha: 'desc' },
    include: {
      vehiculo: { select: { anio: true, marca: true, modelo: true } },
      cliente: { select: { nombre: true } },
      empleado: { select: { nombre: true, apellidos: true } },
    },
  });
  const ultimaVenta = ult ? {
    folio: ult.folio, total: ult.total, fecha: ult.fecha,
    vehiculo: ult.vehiculo, cliente: ult.cliente, empleado: ult.empleado,
  } : null;

  // KPIs financieros del mes (solo se muestran al ADMIN, que es quien consulta este endpoint).
  const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
  const tipoCambio = config ? config.tipoCambioDolar || 0 : 0;

  const ventasMesDetalle = await prisma.venta.findMany({
    where: { ...whereSuc, estado: 'ACTIVA', fecha: { gte: mesDesde } },
    include: { vehiculo: { include: { gastos: true, socio: { select: { id: true, nombre: true } } } } },
  });

  let utilidadMesUsd = 0;
  let comisionesMes = 0;
  let efectivoMes = 0;
  let transferenciaMes = 0;
  const socioMap = new Map();
  for (const v of ventasMesDetalle) {
    const util = v.vehiculo ? (v.vehiculo.precioVenta - costoTotal(v.vehiculo)) : 0;
    utilidadMesUsd += util;
    comisionesMes += v.comision || 0;
    if (v.metodoPago === 'EFECTIVO') efectivoMes += v.total;
    else if (v.metodoPago === 'TRANSFERENCIA') transferenciaMes += v.total;
    const socio = v.vehiculo && v.vehiculo.socio;
    if (socio) {
      const g = socioMap.get(socio.id) || { socioId: socio.id, nombre: socio.nombre, totalUsd: 0 };
      g.totalUsd += util;
      socioMap.set(socio.id, g);
    }
  }
  const utilidadMesMxn = usdAMxn(utilidadMesUsd, tipoCambio);

  const gastosMesLista = await prisma.gastoGeneral.findMany({ where: { ...whereSuc, fecha: { gte: mesDesde } } });
  const gastosMes = gastosMesLista.reduce((a, g) => a + g.monto, 0);
  const utilidadNetaMxn = utilidadMesMxn - gastosMes - comisionesMes;

  const gananciaPorSocio = [...socioMap.values()]
    .map((s) => ({ ...s, totalMxn: usdAMxn(s.totalUsd, tipoCambio) }))
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, 5);

  const grupos = await prisma.vehiculo.groupBy({ by: ['estado'], where: whereSuc, _count: { _all: true } });
  const inventarioEstados = grupos.reduce((a, g) => { a[g.estado] = g._count._all; return a; }, {});

  return {
    ventasSemana: acum(semDesde), ventasMes: acum(mesDesde), ventas6Meses: meses, antiguedad, ventasPorEmpleado, ultimaVenta,
    tipoCambio, utilidadMesUsd, utilidadMesMxn, gastosMes, comisionesMes, utilidadNetaMxn,
    efectivoMes, transferenciaMes, gananciaPorSocio, inventarioEstados,
  };
}

module.exports = { kpis };
