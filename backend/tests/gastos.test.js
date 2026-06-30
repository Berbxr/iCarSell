jest.mock('../src/config/prisma', () => ({
  gastoGeneral: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });

beforeEach(() => jest.clearAllMocks());

describe('Gastos generales', () => {
  test('GET devuelve total y desglose por categoría (ADMIN)', async () => {
    prisma.gastoGeneral.findMany.mockResolvedValue([
      { id: 1, categoria: 'Insumos', descripcion: 'Aceite', monto: 500, fecha: new Date() },
      { id: 2, categoria: 'Insumos', descripcion: 'Filtros', monto: 300, fecha: new Date() },
      { id: 3, categoria: 'Renta', descripcion: 'Local', monto: 8000, fecha: new Date() },
    ]);
    const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8800);
    expect(res.body.porCategoria.Insumos).toBe(800);
    expect(res.body.porCategoria.Renta).toBe(8000);
  });
  test('POST crea gasto (ADMIN)', async () => {
    prisma.gastoGeneral.create.mockResolvedValue({ id: 9, categoria: 'Insumos', descripcion: 'Aceite', monto: 500 });
    const res = await request(app).post('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ categoria: 'Insumos', descripcion: 'Aceite', monto: 500 });
    expect(res.status).toBe(201);
  });
  test('POST rechaza campos vacíos', async () => {
    const res = await request(app).post('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`).send({ categoria: '', descripcion: '', monto: 1 });
    expect(res.status).toBe(400);
  });
  test('GET prohibido a ALMACEN', async () => {
    const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(403);
  });
});
