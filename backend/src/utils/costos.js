const CAMPOS_COSTO = ['precioCompra', 'comisionProveedor', 'transporte', 'registroPlacas', 'salidas'];

function costoPuestoEnMexico(v) {
  return CAMPOS_COSTO.reduce((a, k) => a + (Number(v[k]) || 0), 0);
}
function sumaGastos(v) {
  return Array.isArray(v.gastos) ? v.gastos.reduce((a, g) => a + (Number(g.monto) || 0), 0) : 0;
}
function costoTotal(v) {
  return costoPuestoEnMexico(v) + sumaGastos(v);
}
function utilidad(v) {
  return (Number(v.precioVenta) || 0) - costoTotal(v);
}
function diasEntre(a, b) {
  return Math.floor((a - b) / 86400000);
}
function diasEnCompra(v, ahora = new Date()) {
  const fin = v.fechaPaseAVenta ? new Date(v.fechaPaseAVenta) : ahora;
  return diasEntre(fin, new Date(v.fechaIngreso));
}
function diasEnVenta(v, ahora = new Date()) {
  if (!v.fechaPaseAVenta) return null;
  const fin = v.venta && v.venta.fecha ? new Date(v.venta.fecha) : ahora;
  return diasEntre(fin, new Date(v.fechaPaseAVenta));
}

function vistaVehiculo(v, rol) {
  const dias = { diasEnCompra: diasEnCompra(v), diasEnVenta: diasEnVenta(v) };
  if (rol === 'VENDEDOR') {
    const base = { ...v };
    for (const k of CAMPOS_COSTO) delete base[k];
    delete base.gastos;
    return { ...base, ...dias };
  }
  return {
    ...v, ...dias,
    costoPuestoEnMexico: costoPuestoEnMexico(v),
    costoTotal: costoTotal(v),
    utilidad: utilidad(v),
  };
}

module.exports = { CAMPOS_COSTO, costoPuestoEnMexico, sumaGastos, costoTotal, utilidad, diasEnCompra, diasEnVenta, vistaVehiculo };
