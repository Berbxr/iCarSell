jest.mock('../src/config/prisma', () => ({
  usuario: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn().mockResolvedValue({}) },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });

describe('Usuarios', () => {
  test('GET lista (ADMIN) sin passwordHash', async () => {
    prisma.usuario.findMany.mockResolvedValue([{ id: 1, username: 'admin', rol: 'ADMIN', activo: true, empleado: null }]);
    const res = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body[0].passwordHash).toBeUndefined();
  });
  test('POST crea (ADMIN) => 201, sin passwordHash en respuesta', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: 9, username: 'vend1', rol: 'VENDEDOR', activo: true, debeCambiarPassword: true, empleadoId: 3 });
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ username: 'vend1', password: 'secreta1', rol: 'VENDEDOR', empleadoId: 3 });
    expect(res.status).toBe(201);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.username).toBe('vend1');
  });
  test('POST username duplicado => 409', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 1, username: 'vend1' });
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ username: 'vend1', password: 'secreta1', rol: 'VENDEDOR' });
    expect(res.status).toBe(409);
  });
  test('POST con VENDEDOR => 403', async () => {
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${tokenVend}`)
      .send({ username: 'x', password: 'secreta1', rol: 'VENDEDOR' });
    expect(res.status).toBe(403);
  });
});
