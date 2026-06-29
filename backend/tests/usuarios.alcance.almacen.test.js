jest.mock('../src/config/prisma', () => ({
  usuario: { findUnique: jest.fn(), create: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');
const { resolverSucursalLectura } = require('../src/utils/alcance');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });

beforeEach(() => jest.clearAllMocks());

describe('Rol ALMACEN', () => {
  test('alcance: ALMACEN sin sucursal ve todas (como ADMIN)', () => {
    const req = { usuario: { rol: 'ALMACEN', sucursalId: null }, query: {} };
    expect(resolverSucursalLectura(req)).toBeUndefined();
  });

  test('POST /usuarios acepta rol ALMACEN', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: 5, username: 'bodega', rol: 'ALMACEN', activo: true, debeCambiarPassword: true, empleadoId: null });
    const res = await request(app).post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ username: 'bodega', password: 'secreto1', rol: 'ALMACEN' });
    expect(res.status).toBe(201);
    expect(res.body.rol).toBe('ALMACEN');
  });

  test('POST /usuarios sigue rechazando rol inválido', async () => {
    const res = await request(app).post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ username: 'x', password: 'secreto1', rol: 'SUPER' });
    expect(res.status).toBe(400);
  });
});
