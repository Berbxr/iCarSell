jest.mock('../src/config/prisma', () => ({
  rangoComision: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  auditoria: { create: jest.fn() },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Config comisiones', () => {
  test('GET devuelve los rangos', async () => {
    prisma.rangoComision.findMany.mockResolvedValue([{ id: 1, orden: 1, desdeUsd: 0, monto: 1000 }]);
    const res = await request(app).get('/api/configuracion/comisiones').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('PUT reemplaza los rangos (ADMIN)', async () => {
    prisma.rangoComision.findMany.mockResolvedValue([
      { id: 1, orden: 1, desdeUsd: 0, monto: 1000 },
      { id: 2, orden: 2, desdeUsd: 6000, monto: 1600 },
    ]);
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ rangos: [{ desdeUsd: 6000, monto: 1600 }, { desdeUsd: 0, monto: 1000 }] });
    expect(res.status).toBe(200);
    expect(prisma.rangoComision.deleteMany).toHaveBeenCalled();
    expect(prisma.rangoComision.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [
        { orden: 1, desdeUsd: 0, monto: 1000 },
        { orden: 2, desdeUsd: 6000, monto: 1600 },
      ] })
    );
  });

  test('PUT rechaza desdeUsd duplicados', async () => {
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ rangos: [{ desdeUsd: 0, monto: 1000 }, { desdeUsd: 0, monto: 1600 }] });
    expect(res.status).toBe(400);
  });

  test('PUT rechaza lista vacía', async () => {
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenAdmin}`).send({ rangos: [] });
    expect(res.status).toBe(400);
  });

  test('PUT prohibido para VENDEDOR', async () => {
    const res = await request(app).put('/api/configuracion/comisiones')
      .set('Authorization', `Bearer ${tokenVend}`)
      .send({ rangos: [{ desdeUsd: 0, monto: 1000 }] });
    expect(res.status).toBe(403);
  });
});
