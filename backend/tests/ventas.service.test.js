jest.mock('../src/config/prisma', () => {
  const tx = {
    vehiculo: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    sucursal: { update: jest.fn() },
    venta: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    rangoComision: { findMany: jest.fn().mockResolvedValue([
      { desdeUsd: 0, monto: 1000 },
      { desdeUsd: 6000, monto: 1600 },
      { desdeUsd: 10000, monto: 2600 },
    ]) },
  };
  return { __tx: tx, $transaction: jest.fn(async (fn) => fn(tx)) };
});
const prisma = require('../src/config/prisma');
const { crearVenta, cancelarVenta } = require('../src/services/ventas.service');

const tx = prisma.__tx;

describe('crearVenta', () => {
  beforeEach(() => jest.clearAllMocks());

  test('genera folio con padStart y marca el vehículo VENDIDO', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, estado: 'DISPONIBLE' });
    tx.sucursal.update.mockResolvedValue({ id: 2, serieFolio: 'A', consecutivoFolio: 602 });
    tx.venta.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

    const venta = await crearVenta({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 150000 });

    expect(venta.folio).toBe('A-0602');
    expect(tx.sucursal.update).toHaveBeenCalledWith(expect.objectContaining({ data: { consecutivoFolio: { increment: 1 } } }));
    expect(tx.vehiculo.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 10 }, data: { estado: 'VENDIDO' } }));
    expect(venta.observaciones).toBe('SIN GARANTÍA');
  });

  test('calcula y guarda la comisión según el precio de lista del vehículo', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, estado: 'DISPONIBLE', precioVenta: 12000 });
    tx.sucursal.update.mockResolvedValue({ id: 2, serieFolio: 'A', consecutivoFolio: 1 });
    tx.venta.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

    const venta = await crearVenta({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 11000 });

    expect(venta.comision).toBe(2600); // precioVenta 12000 USD => rango 3
  });

  test('guarda metodoPago y usa la sucursal del vehículo', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 7, estado: 'DISPONIBLE', precioVenta: 9000 });
    tx.sucursal.update.mockResolvedValue({ id: 7, serieFolio: 'B', consecutivoFolio: 3 });
    tx.venta.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));
    const venta = await crearVenta({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 9000, metodoPago: 'TRANSFERENCIA' });
    expect(venta.sucursalId).toBe(7);
    expect(venta.metodoPago).toBe('TRANSFERENCIA');
    expect(tx.sucursal.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
  });

  test('rechaza vehículo ya vendido', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, estado: 'VENDIDO' });
    await expect(crearVenta({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 1 })).rejects.toThrow();
  });

  test('aplica descuento: total = precio de lista − descuento y no cambia la comisión', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, estado: 'DISPONIBLE', precioVenta: 12000 });
    tx.sucursal.update.mockResolvedValue({ id: 2, serieFolio: 'A', consecutivoFolio: 1 });
    tx.venta.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

    const venta = await crearVenta({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 10500, descuento: 1500 });

    expect(venta.descuento).toBe(1500);
    expect(venta.total).toBe(10500);
    expect(venta.comision).toBe(2600); // sobre precio de lista 12000, sin importar el descuento
  });

  test('el descuento se limita al precio de lista (no negativo)', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, estado: 'DISPONIBLE', precioVenta: 5000 });
    tx.sucursal.update.mockResolvedValue({ id: 2, serieFolio: 'A', consecutivoFolio: 1 });
    tx.venta.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

    const venta = await crearVenta({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 0, descuento: 8000 });
    expect(venta.descuento).toBe(5000);
  });
});

describe('cancelarVenta', () => {
  beforeEach(() => jest.clearAllMocks());

  test('marca la venta CANCELADA y regresa el vehículo a DISPONIBLE', async () => {
    tx.venta.findUnique.mockResolvedValue({ id: 7, vehiculoId: 10, estado: 'ACTIVA', folio: 'A-0001', total: 9000 });
    tx.venta.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, vehiculoId: 10, ...data }));

    const venta = await cancelarVenta({ ventaId: 7, motivo: 'Cliente se arrepintió' });

    expect(venta.estado).toBe('CANCELADA');
    expect(venta.motivoCancelacion).toBe('Cliente se arrepintió');
    expect(tx.vehiculo.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 10 }, data: { estado: 'DISPONIBLE' } }));
  });

  test('rechaza cancelar una venta ya cancelada', async () => {
    tx.venta.findUnique.mockResolvedValue({ id: 7, vehiculoId: 10, estado: 'CANCELADA' });
    await expect(cancelarVenta({ ventaId: 7 })).rejects.toThrow();
    expect(tx.vehiculo.update).not.toHaveBeenCalled();
  });

  test('rechaza cancelar una venta inexistente', async () => {
    tx.venta.findUnique.mockResolvedValue(null);
    await expect(cancelarVenta({ ventaId: 999 })).rejects.toThrow();
  });
});
