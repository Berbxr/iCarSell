jest.mock('../src/config/prisma', () => ({
  cliente: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn().mockResolvedValue({}) },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });

describe('Clientes', () => {
  test('GET lista (VENDEDOR permitido)', async () => {
    prisma.cliente.findMany.mockResolvedValue([{ id: 1, nombre: 'Luis' }]);
    const res = await request(app).get('/api/clientes').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
  });
  test('GET con ?buscar filtra por nombre (contains)', async () => {
    prisma.cliente.findMany.mockResolvedValue([]);
    await request(app).get('/api/clientes?buscar=lu').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.cliente.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ nombre: expect.objectContaining({ contains: 'lu', mode: 'insensitive' }) }),
    }));
  });
  test('POST crea => 201', async () => {
    prisma.cliente.create.mockResolvedValue({ id: 7, nombre: 'Luis' });
    const res = await request(app).post('/api/clientes').set('Authorization', `Bearer ${tokenVend}`).send({ nombre: 'Luis' });
    expect(res.status).toBe(201);
  });
  test('POST sin nombre => 400', async () => {
    const res = await request(app).post('/api/clientes').set('Authorization', `Bearer ${tokenVend}`).send({});
    expect(res.status).toBe(400);
  });
});
