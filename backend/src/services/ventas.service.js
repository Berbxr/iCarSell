const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { formatearFolio } = require('../utils/folio');

async function crearVenta({ sucursalId, vehiculoId, clienteId, empleadoId, total, observaciones }) {
  return prisma.$transaction(async (tx) => {
    const vehiculo = await tx.vehiculo.findUnique({ where: { id: Number(vehiculoId) } });
    if (!vehiculo) throw new ApiError(404, 'Vehículo no encontrado');
    if (vehiculo.sucursalId !== sucursalId) throw new ApiError(400, 'El vehículo no pertenece a la sucursal');
    if (vehiculo.estado === 'VENDIDO') throw new ApiError(409, 'El vehículo ya fue vendido');

    const sucursal = await tx.sucursal.update({ where: { id: sucursalId }, data: { consecutivoFolio: { increment: 1 } } });
    const folio = formatearFolio(sucursal.serieFolio, sucursal.consecutivoFolio);

    const venta = await tx.venta.create({
      data: {
        folio, sucursalId, vehiculoId: Number(vehiculoId), clienteId: Number(clienteId), empleadoId: Number(empleadoId),
        total: Number(total), observaciones: observaciones && observaciones.trim() ? observaciones : 'SIN GARANTÍA',
      },
    });
    await tx.vehiculo.update({ where: { id: Number(vehiculoId) }, data: { estado: 'VENDIDO' } });
    return venta;
  });
}

module.exports = { crearVenta };
