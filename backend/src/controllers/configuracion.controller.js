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

async function obtenerComisiones(req, res, next) {
  try {
    const rangos = await prisma.rangoComision.findMany({ orderBy: { desdeUsd: 'asc' } });
    res.json(rangos);
  } catch (e) { next(e); }
}

async function actualizarComisiones(req, res, next) {
  try {
    const entrada = Array.isArray(req.body.rangos) ? req.body.rangos : null;
    if (!entrada || entrada.length === 0) throw new ApiError(400, 'Debe enviar al menos un rango');
    const normalizados = entrada.map((r) => ({ desdeUsd: Number(r.desdeUsd), monto: Number(r.monto) }));
    for (const r of normalizados) {
      if (!Number.isFinite(r.desdeUsd) || r.desdeUsd < 0) throw new ApiError(400, 'desdeUsd debe ser un número >= 0');
      if (!Number.isFinite(r.monto) || r.monto < 0) throw new ApiError(400, 'monto debe ser un número >= 0');
    }
    const llaves = new Set(normalizados.map((r) => r.desdeUsd));
    if (llaves.size !== normalizados.length) throw new ApiError(400, 'No puede haber dos rangos con el mismo desdeUsd');
    normalizados.sort((a, b) => a.desdeUsd - b.desdeUsd);
    const data = normalizados.map((r, i) => ({ orden: i + 1, desdeUsd: r.desdeUsd, monto: r.monto }));

    await prisma.$transaction([
      prisma.rangoComision.deleteMany({}),
      prisma.rangoComision.createMany({ data }),
    ]);
    await auditoria.registrar({ usuarioId: req.usuario.id, accion: 'EDITAR_COMISIONES', entidad: 'RangoComision', ip: req.ip });
    res.json(await prisma.rangoComision.findMany({ orderBy: { desdeUsd: 'asc' } }));
  } catch (e) { next(e); }
}

module.exports = { obtener, actualizar, obtenerComisiones, actualizarComisiones };
