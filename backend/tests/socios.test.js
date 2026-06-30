jest.mock('../src/config/prisma', () => ({
  socio: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Socios', () => {
  test('GET permitido a ALMACEN', async () => {
    prisma.socio.findMany.mockResolvedValue([{ id: 1, nombre: 'Sin asignar', activo: true }]);
    const res = await request(app).get('/api/socios').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
  test('GET prohibido a VENDEDOR', async () => {
    const res = await request(app).get('/api/socios').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
  test('POST crea socio (ADMIN)', async () => {
    prisma.socio.create.mockResolvedValue({ id: 2, nombre: 'Juan', activo: true });
    const res = await request(app).post('/api/socios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: 'Juan' });
    expect(res.status).toBe(201);
    expect(prisma.socio.create).toHaveBeenCalledWith({ data: { nombre: 'Juan' } });
  });
  test('POST rechaza nombre vacío', async () => {
    const res = await request(app).post('/api/socios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: '' });
    expect(res.status).toBe(400);
  });
  test('POST prohibido a ALMACEN', async () => {
    const res = await request(app).post('/api/socios').set('Authorization', `Bearer ${tokenAlmacen}`).send({ nombre: 'X' });
    expect(res.status).toBe(403);
  });
});
