jest.mock('../src/config/prisma', () => ({
  vehiculo: { findMany: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });

beforeEach(() => jest.clearAllMocks());

describe('GET /api/reportes/inventario', () => {
  test('solo incluye vehículos activos', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/reportes/inventario').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.activo).toBe(true);
  });
});
