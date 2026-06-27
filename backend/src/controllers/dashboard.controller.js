const prisma = require('../config/prisma');
const { resolverSucursalLectura } = require('../utils/alcance');
const { kpis } = require('../services/dashboard.service');

async function obtener(req, res, next) {
  try {
    const sucursalId = resolverSucursalLectura(req);
    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    const diasAlerta = config ? config.diasAntiguedadAlerta : 60;
    res.json(await kpis({ sucursalId, diasAlerta }));
  } catch (e) { next(e); }
}

module.exports = { obtener };
