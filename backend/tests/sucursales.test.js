jest.mock('../src/config/prisma', () => ({
  sucursal: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn().mockResolvedValue({}) },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });

describe('Sucursales', () => {
  test('GET lista (autenticado)', async () => {
    prisma.sucursal.findMany.mockResolvedValue([{ id: 1, nombre: 'Matriz' }]);
    const res = await request(app).get('/api/sucursales').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
  test('POST crea (ADMIN) => 201', async () => {
    prisma.sucursal.create.mockResolvedValue({ id: 5, nombre: 'Centro' });
    const res = await request(app).post('/api/sucursales').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'Centro', serieFolio: 'B' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });
  test('POST sin nombre => 400', async () => {
    const res = await request(app).post('/api/sucursales').set('Authorization', `Bearer ${tokenAdmin}`).send({});
    expect(res.status).toBe(400);
  });
  test('POST con VENDEDOR => 403', async () => {
    const res = await request(app).post('/api/sucursales').set('Authorization', `Bearer ${tokenVend}`).send({ nombre: 'X' });
    expect(res.status).toBe(403);
  });
});
