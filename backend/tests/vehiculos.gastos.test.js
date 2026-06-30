jest.mock('../src/config/prisma', () => ({
  gastoVehiculo: { create: jest.fn(), delete: jest.fn() },
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

describe('Gastos de vehículo', () => {
  test('ALMACEN agrega un gasto', async () => {
    prisma.gastoVehiculo.create.mockResolvedValue({ id: 1, vehiculoId: 7, descripcion: 'Pintura', monto: 500 });
    const res = await request(app).post('/api/vehiculos/7/gastos')
      .set('Authorization', `Bearer ${tokenAlmacen}`).send({ descripcion: 'Pintura', monto: 500 });
    expect(res.status).toBe(201);
    expect(prisma.gastoVehiculo.create).toHaveBeenCalledWith({ data: { vehiculoId: 7, descripcion: 'Pintura', monto: 500 } });
  });

  test('rechaza gasto sin descripción o monto', async () => {
    const res = await request(app).post('/api/vehiculos/7/gastos')
      .set('Authorization', `Bearer ${tokenAlmacen}`).send({ descripcion: '' });
    expect(res.status).toBe(400);
  });

  test('ALMACEN elimina un gasto', async () => {
    prisma.gastoVehiculo.delete.mockResolvedValue({ id: 9 });
    const res = await request(app).delete('/api/vehiculos/7/gastos/9').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(200);
    expect(prisma.gastoVehiculo.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  test('VENDEDOR no puede agregar gastos', async () => {
    const res = await request(app).post('/api/vehiculos/7/gastos')
      .set('Authorization', `Bearer ${tokenVend}`).send({ descripcion: 'X', monto: 1 });
    expect(res.status).toBe(403);
  });
});
