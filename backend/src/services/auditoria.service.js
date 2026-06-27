const prisma = require('../config/prisma');

async function registrar({ usuarioId, accion, entidad, entidadId = null, datos = null, ip = null }) {
  return prisma.auditoria.create({ data: { usuarioId, accion, entidad, entidadId, datos, ip } });
}
async function listar({ usuarioId, accion } = {}) {
  const where = {};
  if (usuarioId) where.usuarioId = Number(usuarioId);
  if (accion) where.accion = accion;
  return prisma.auditoria.findMany({ where, orderBy: { fecha: 'desc' }, take: 200 });
}
module.exports = { registrar, listar };
