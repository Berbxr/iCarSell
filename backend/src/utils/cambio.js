// Convierte un monto en USD a MXN usando el tipo de cambio (pesos por dólar).
function usdAMxn(usd, tc) {
  return (Number(usd) || 0) * (Number(tc) || 0);
}

module.exports = { usdAMxn };
