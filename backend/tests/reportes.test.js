jest.mock('../src/config/prisma', () => ({
  venta: { findMany: jest.fn() },
  vehiculo: { findMany: jest.fn(), groupBy: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });

describe('Reportes', () => {
  test('GET /api/reportes/ventas calcula utilidad', async () => {
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, total: 150000, fecha: new Date(), vehiculo: { costoCompra: 100000, precioVenta: 150000 }, cliente: { nombre: 'Luis' }, empleado: { nombre: 'Ana' } },
      { id: 2, total: 80000, fecha: new Date(), vehiculo: { costoCompra: 60000, precioVenta: 80000 }, cliente: { nombre: 'Pedro' }, empleado: { nombre: 'Ana' } },
    ]);
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.totales.monto).toBe(230000);
    expect(res.body.totales.cantidad).toBe(2);
    expect(res.body.totales.utilidad).toBe(70000); // (150k-100k)+(80k-60k)
  });
  test('GET /api/reportes/ventas con VENDEDOR sin sucursal => 403', async () => {
    const tokenMal = firmarToken({ id: 9, rol: 'VENDEDOR', sucursalId: null });
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenMal}`);
    expect(res.status).toBe(403);
  });
});
