const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const auditoria = require('../services/auditoria.service');

async function obtener(req, res, next) {
  try {
    const c = await prisma.configuracion.findUnique({ where: { id: 1 } });
    res.json(c || { id: 1, diasAntiguedadAlerta: 60, terminosContrato: '' });
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const data = {};
    if (req.body.diasAntiguedadAlerta !== undefined) {
      const n = Number(req.body.diasAntiguedadAlerta);
      if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'diasAntiguedadAlerta debe ser un entero positivo');
      data.diasAntiguedadAlerta = n;
    }
    if (req.body.terminosContrato !== undefined) data.terminosContrato = String(req.body.terminosContrato);
    const c = await prisma.configuracion.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_CONFIGURACION', entidad: 'Configuracion', entidadId: 1, ip: req.ip });
    res.json(c);
  } catch (e) { next(e); }
}

module.exports = { obtener, actualizar };
