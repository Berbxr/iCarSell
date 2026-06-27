jest.mock('../src/config/prisma', () => {
  const tx = {
    vehiculo: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    sucursal: { update: jest.fn() },
    venta: { create: jest.fn() },
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

    const venta = await crearVenta({ sucursalId: 2, vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 150000 });

    expect(venta.folio).toBe('A-0602');
    expect(tx.sucursal.update).toHaveBeenCalledWith(expect.objectContaining({ data: { consecutivoFolio: { increment: 1 } } }));
    expect(tx.vehiculo.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 10 }, data: { estado: 'VENDIDO' } }));
    expect(venta.observaciones).toBe('SIN GARANTÍA');
  });

  test('rechaza vehículo de otra sucursal', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 9, estado: 'DISPONIBLE' });
    await expect(crearVenta({ sucursalId: 2, vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 1 })).rejects.toThrow();
  });

  test('rechaza vehículo ya vendido', async () => {
    tx.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, estado: 'VENDIDO' });
    await expect(crearVenta({ sucursalId: 2, vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 1 })).rejects.toThrow();
  });
});
