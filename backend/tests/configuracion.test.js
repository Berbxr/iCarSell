jest.mock('../src/config/prisma', () => ({
  configuracion: { findUnique: jest.fn(), upsert: jest.fn() },
  auditoria: { create: jest.fn().mockResolvedValue({}) },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });

describe('Configuracion', () => {
  test('GET devuelve config (autenticado)', async () => {
    prisma.configuracion.findUnique.mockResolvedValue({ id: 1, diasAntiguedadAlerta: 60 });
    const res = await request(app).get('/api/configuracion').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
    expect(res.body.diasAntiguedadAlerta).toBe(60);
  });
  test('PUT (ADMIN) actualiza diasAntiguedadAlerta', async () => {
    prisma.configuracion.upsert.mockResolvedValue({ id: 1, diasAntiguedadAlerta: 90 });
    const res = await request(app).put('/api/configuracion').set('Authorization', `Bearer ${tokenAdmin}`).send({ diasAntiguedadAlerta: 90 });
    expect(res.status).toBe(200);
    expect(res.body.diasAntiguedadAlerta).toBe(90);
  });
  test('PUT con VENDEDOR => 403', async () => {
    const res = await request(app).put('/api/configuracion').set('Authorization', `Bearer ${tokenVend}`).send({ diasAntiguedadAlerta: 90 });
    expect(res.status).toBe(403);
  });
});
