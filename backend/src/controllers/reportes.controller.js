const { resolverSucursalLectura } = require('../utils/alcance');
const reportes = require('../services/reportes.service');

async function ventas(req, res, next) {
  try {
    const sucursalId = resolverSucursalLectura(req);
    res.json(await reportes.ventas({ sucursalId, desde: req.query.desde, hasta: req.query.hasta, esAdmin: req.usuario.rol === 'ADMIN' }));
  } catch (e) { next(e); }
}

async function inventario(req, res, next) {
  try {
    const sucursalId = resolverSucursalLectura(req);
    res.json(await reportes.inventario({ sucursalId }));
  } catch (e) { next(e); }
}

async function comisiones(req, res, next) {
  try {
    const sucursalId = resolverSucursalLectura(req);
    res.json(await reportes.comisiones({ sucursalId, fecha: req.query.fecha }));
  } catch (e) { next(e); }
}

module.exports = { ventas, inventario, comisiones };
