const auditoria = require('../services/auditoria.service');

async function listar(req, res, next) {
  try {
    const { usuarioId, accion } = req.query;
    res.json(await auditoria.listar({ usuarioId, accion }));
  } catch (e) { next(e); }
}

module.exports = { listar };
