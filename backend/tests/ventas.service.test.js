jest.mock('../src/config/prisma', () => {
  const tx = {
    vehiculo: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    sucursal: { update: jest.fn() },
    venta: { create: jest.fn() },
    rangoComision: { findMany: jest.fn().mockResolvedValue([
      { desdeUsd: 0, monto: 1000 },
      { desdeUsd: 6000, monto: 1600 },
      { desdeUsd: 10000, monto: 2600 },
    ]) },
  };
  return { __tx: tx, $transaction: jest.fn(async (fn) => fn(tx)) };
});
const prisma = require('../src/config/prisma');
const { crearVenta } = require('../src/services/ventas.service');

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
});
