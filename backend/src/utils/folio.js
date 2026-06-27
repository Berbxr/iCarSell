function formatearFolio(serie, consecutivo) {
  return `${serie}-${String(consecutivo).padStart(4, '0')}`;
}
module.exports = { formatearFolio };
