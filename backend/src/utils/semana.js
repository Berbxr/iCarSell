// Devuelve { inicio, fin } de la semana lunes-domingo (hora local) que contiene fechaRef.
function rangoSemana(fechaRef) {
  const base = fechaRef ? new Date(fechaRef) : new Date();
  const dia = base.getDay(); // 0=domingo .. 6=sábado
  const diffALunes = dia === 0 ? -6 : 1 - dia;
  const inicio = new Date(base);
  inicio.setDate(base.getDate() + diffALunes);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

module.exports = { rangoSemana };
