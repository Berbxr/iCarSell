jest.mock('../src/config/prisma', () => ({
  usuario: { findUnique: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn().mockResolvedValue({}) },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { hashPassword } = require('../src/utils/password');

const app = crearApp();

describe('Auth', () => {
  test('POST /api/auth/login válido devuelve token y sucursalId del empleado', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 7, username: 'vendedor1', rol: 'VENDEDOR', activo: true, debeCambiarPassword: false,
      passwordHash: await hashPassword('secreta1'), empleadoId: 3,
      empleado: { id: 3, nombre: 'Ana', apellidos: 'Pérez', sucursalId: 2 },
    });
    const res = await request(app).post('/api/auth/login').send({ username: 'vendedor1', password: 'secreta1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.sucursalId).toBe(2);
    expect(res.body.usuario.rol).toBe('VENDEDOR');
  });

  test('login con password incorrecta => 401', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 1, username: 'admin', rol: 'ADMIN', activo: true, passwordHash: await hashPassword('otra'), empleado: null,
    });
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'mala' });
    expect(res.status).toBe(401);
  });

  test('login sin campos => 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
  });
});
