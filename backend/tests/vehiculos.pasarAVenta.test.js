jest.mock('../src/config/prisma', () => ({
  vehiculo: { findUnique: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Pasar a venta', () => {
  test('rechaza si precioVenta es 0', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'EN_COMPRA', precioVenta: 0 });
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(400);
    expect(prisma.vehiculo.update).not.toHaveBeenCalled();
  });

  test('rechaza si no está EN_COMPRA', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'DISPONIBLE', precioVenta: 9000 });
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(409);
  });

  test('pasa a DISPONIBLE y setea fechaPaseAVenta', async () => {
    prisma.vehiculo.findUnique
      .mockResolvedValueOnce({ id: 7, estado: 'EN_COMPRA', precioVenta: 9000 })
      .mockResolvedValueOnce({ id: 7, estado: 'DISPONIBLE', precioVenta: 9000, precioCompra: 5000, gastos: [], fechaIngreso: new Date('2026-06-01'), fechaPaseAVenta: new Date('2026-06-05') });
    prisma.vehiculo.update.mockResolvedValue({});
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(200);
    const arg = prisma.vehiculo.update.mock.calls[0][0];
    expect(arg.data.estado).toBe('DISPONIBLE');
    expect(arg.data.fechaPaseAVenta).toBeInstanceOf(Date);
  });

  test('VENDEDOR no puede pasar a venta', async () => {
    const res = await request(app).put('/api/vehiculos/7/pasar-a-venta').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});
