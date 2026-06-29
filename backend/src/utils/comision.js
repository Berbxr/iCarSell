// Devuelve la comisión (MXN) del rango aplicable al precio de lista (USD).
// El rango aplicable es el de mayor desdeUsd que sea <= precioVentaUsd.
function calcularComision(precioVentaUsd, rangos) {
  if (!Array.isArray(rangos) || rangos.length === 0) return 0;
  const precio = Number(precioVentaUsd) || 0;
  const aplicables = rangos
    .filter((r) => precio >= r.desdeUsd)
    .sort((a, b) => a.desdeUsd - b.desdeUsd);
  if (aplicables.length === 0) return 0;
  return aplicables[aplicables.length - 1].monto;
}

module.exports = { calcularComision };
