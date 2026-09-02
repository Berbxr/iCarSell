// Convierte los costos que viven en el Vehiculo (compra) en líneas de "gasto" homogéneas,
// para que el módulo de Gastos generales las pueda mostrar/filtrar junto con las demás categorías.
// No se duplican datos en una tabla aparte: se calculan al vuelo a partir de Vehiculo/GastoVehiculo.
const CATEGORIA_GASTOS_AUTO = 'Gastos de autos';

const CAMPOS_COSTO_FECHA = {
  precioCompra: { label: 'Precio compra', fecha: 'fechaCompra' },
  comisionProveedor: { label: 'Comisión proveedor', fecha: 'fechaComisionProveedor' },
  transporte: { label: 'Transporte', fecha: 'fechaTransporte' },
  registroPlacas: { label: 'Registro/Placas', fecha: 'fechaRegistroPlacas' },
  salidas: { label: 'Salidas', fecha: 'fechaSalidas' },
};

function referenciaVehiculo(v) {
  return `${v.marca} ${v.modelo} (${v.anio})`.trim();
}

// vehiculos: arreglo de Vehiculo con los campos de costo/fecha + su relación `gastos` (GastoVehiculo[]).
function gastosDeAutos(vehiculos) {
  const items = [];
  for (const v of vehiculos || []) {
    const referencia = referenciaVehiculo(v);
    for (const [campo, { label, fecha }] of Object.entries(CAMPOS_COSTO_FECHA)) {
      const monto = Number(v[campo]) || 0;
      if (monto <= 0) continue; // costo aún no capturado, no genera línea de gasto
      items.push({
        id: `${v.id}-${campo}`,
        categoria: CATEGORIA_GASTOS_AUTO,
        descripcion: label,
        monto,
        fecha: v[fecha] || null,
        referencia,
        vehiculoId: v.id,
        tipo: 'auto',
      });
    }
    for (const g of v.gastos || []) {
      items.push({
        id: g.id,
        categoria: CATEGORIA_GASTOS_AUTO,
        descripcion: g.descripcion,
        monto: Number(g.monto) || 0,
        fecha: g.fecha,
        referencia,
        vehiculoId: v.id,
        tipo: 'auto',
      });
    }
  }
  return items;
}

module.exports = { CATEGORIA_GASTOS_AUTO, CAMPOS_COSTO_FECHA, referenciaVehiculo, gastosDeAutos };
