const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { formatearFolio } = require('../utils/folio');
const { calcularComision } = require('../utils/comision');

async function crearVenta({ vehiculoId, clienteId, empleadoId, total, observaciones, metodoPago }) {
  return prisma.$transaction(async (tx) => {
    const vehiculo = await tx.vehiculo.findUnique({ where: { id: Number(vehiculoId) } });
    if (!vehiculo) throw new ApiError(404, 'Vehículo no encontrado');
    if (vehiculo.estado === 'VENDIDO') throw new ApiError(409, 'El vehículo ya fue vendido');

    const sucursalId = vehiculo.sucursalId;
    const sucursal = await tx.sucursal.update({ where: { id: sucursalId }, data: { consecutivoFolio: { increment: 1 } } });
    const folio = formatearFolio(sucursal.serieFolio, sucursal.consecutivoFolio);

    const rangos = await tx.rangoComision.findMany();
    const comision = calcularComision(vehiculo.precioVenta, rangos);
    const metodo = metodoPago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO';

    const venta = await tx.venta.create({
      data: {
        folio, sucursalId, vehiculoId: Number(vehiculoId), clienteId: Number(clienteId), empleadoId: Number(empleadoId),
        total: Number(total), comision, metodoPago: metodo, observaciones: observaciones && observaciones.trim() ? observaciones : 'SIN GARANTÍA',
      },
    });
    await tx.vehiculo.update({ where: { id: Number(vehiculoId) }, data: { estado: 'VENDIDO' } });
    return venta;
  });
}

module.exports = { crearVenta };
