const prisma = require('../config/prisma');
const { ApiError } = require('../middlewares/error');
const { formatearFolio } = require('../utils/folio');
const { calcularComision } = require('../utils/comision');

async function crearVenta({ vehiculoId, clienteId, empleadoId, total, observaciones, metodoPago, descuento }) {
  return prisma.$transaction(async (tx) => {
    const vehiculo = await tx.vehiculo.findUnique({ where: { id: Number(vehiculoId) } });
    if (!vehiculo) throw new ApiError(404, 'Vehículo no encontrado');
    if (vehiculo.estado === 'VENDIDO') throw new ApiError(409, 'El vehículo ya fue vendido');

    // El total efectivo es el precio de lista menos el descuento (USD).
    const precioLista = Number(vehiculo.precioVenta) || 0;
    const desc = Math.min(Math.max(0, Number(descuento) || 0), precioLista);
    const totalFinal = total != null ? Number(total) : precioLista - desc;

    const sucursalId = vehiculo.sucursalId;
    const sucursal = await tx.sucursal.update({ where: { id: sucursalId }, data: { consecutivoFolio: { increment: 1 } } });
    const folio = formatearFolio(sucursal.serieFolio, sucursal.consecutivoFolio);

    const rangos = await tx.rangoComision.findMany();
    // La comisión se calcula sobre el precio de lista, sin importar el descuento.
    const comision = calcularComision(vehiculo.precioVenta, rangos);
    const metodo = metodoPago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO';

    const venta = await tx.venta.create({
      data: {
        folio, sucursalId, vehiculoId: Number(vehiculoId), clienteId: Number(clienteId), empleadoId: Number(empleadoId),
        total: totalFinal, descuento: desc, comision, metodoPago: metodo,
        observaciones: observaciones && observaciones.trim() ? observaciones : 'SIN GARANTÍA',
      },
    });
    await tx.vehiculo.update({ where: { id: Number(vehiculoId) }, data: { estado: 'VENDIDO' } });
    return venta;
  });
}

// Cancelación suave: marca la venta CANCELADA y regresa el vehículo a inventario
// (DISPONIBLE) para poder revenderlo. La venta se conserva como historial.
async function cancelarVenta({ ventaId, motivo }) {
  return prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findUnique({ where: { id: Number(ventaId) } });
    if (!venta) throw new ApiError(404, 'Venta no encontrada');
    if (venta.estado === 'CANCELADA') throw new ApiError(409, 'La venta ya está cancelada');

    const actualizada = await tx.venta.update({
      where: { id: venta.id },
      data: { estado: 'CANCELADA', canceladaEn: new Date(), motivoCancelacion: motivo && motivo.trim() ? motivo.trim() : null },
    });
    await tx.vehiculo.update({ where: { id: venta.vehiculoId }, data: { estado: 'DISPONIBLE' } });
    return actualizada;
  });
}

module.exports = { crearVenta, cancelarVenta };
