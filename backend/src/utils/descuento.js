// Calcula el descuento (USD) y el total resultante a partir del precio de lista.
// tipo: 'MONTO' (valor en USD) o 'PORCENTAJE' (valor 0-100). Ambos se limitan a
// un rango válido para que el total nunca sea negativo ni mayor al precio de lista.
function calcularDescuento(precioLista, tipo, valor) {
  const lista = Number(precioLista) || 0;
  if (lista <= 0) return { descuento: 0, total: Math.max(0, lista) };

  const v = Math.max(0, Number(valor) || 0);
  let descuento = 0;
  if (tipo === 'MONTO') descuento = Math.min(v, lista);
  else if (tipo === 'PORCENTAJE') descuento = lista * Math.min(v, 100) / 100;
  else descuento = 0;

  const redondear = (n) => Math.round(n * 100) / 100;
  descuento = redondear(descuento);
  return { descuento, total: redondear(lista - descuento) };
}

module.exports = { calcularDescuento };
