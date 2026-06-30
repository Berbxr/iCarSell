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
      { id: 1, total: 150000, comision: 0, metodoPago: 'EFECTIVO', fecha: new Date(), vehiculo: { precioCompra: 100000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [], precioVenta: 150000 }, cliente: { nombre: 'Luis' }, empleado: { nombre: 'Ana' } },
      { id: 2, total: 80000, comision: 0, metodoPago: 'TRANSFERENCIA', fecha: new Date(), vehiculo: { precioCompra: 60000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [{ monto: 5000 }], precioVenta: 80000 }, cliente: { nombre: 'Pedro' }, empleado: { nombre: 'Ana' } },
    ]);
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.totales.monto).toBe(230000);
    expect(res.body.totales.cantidad).toBe(2);
    expect(res.body.totales.utilidad).toBe(65000); // (150k-100k)+(80k-65k)
    expect(res.body.totales.efectivo).toBe(150000);
    expect(res.body.totales.transferencia).toBe(80000);
  });
  test('GET /api/reportes/ventas suma comisiones para ADMIN', async () => {
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, total: 150000, comision: 2600, fecha: new Date(), vehiculo: { costoCompra: 100000, precioVenta: 150000, socio: { id: 1, nombre: 'Juan' } }, cliente: { nombre: 'Luis' }, empleado: { nombre: 'Ana' } },
      { id: 2, total: 80000, comision: 1000, fecha: new Date(), vehiculo: { costoCompra: 60000, precioVenta: 80000, socio: { id: 1, nombre: 'Juan' } }, cliente: { nombre: 'Pedro' }, empleado: { nombre: 'Ana' } },
    ]);
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.totales.comision).toBe(3600);
    expect(res.body.ventas[0].comision).toBe(2600);
    expect(res.body.ventas[0].vehiculo.socio).toEqual({ id: 1, nombre: 'Juan' });
  });
  test('GET /api/reportes/ventas?socioId filtra por socio', async () => {
    prisma.venta.findMany.mockResolvedValue([]);
    await request(app).get('/api/reportes/ventas?socioId=3').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.venta.findMany.mock.calls.at(-1)[0];
    expect(arg.where.vehiculo).toEqual({ socioId: 3 });
  });
  test('GET /api/reportes/ventas oculta comisiones a VENDEDOR', async () => {
    const tokenVend = firmarToken({ id: 9, rol: 'VENDEDOR', sucursalId: 1 });
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, total: 150000, comision: 2600, fecha: new Date(), vehiculo: { costoCompra: 100000, precioVenta: 150000 }, cliente: { nombre: 'Luis' }, empleado: { nombre: 'Ana' } },
    ]);
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
    expect(res.body.totales.comision).toBeUndefined();
    expect(res.body.ventas[0].comision).toBeUndefined();
  });
  test('GET /api/reportes/ventas con VENDEDOR sin sucursal => 403', async () => {
    const tokenMal = firmarToken({ id: 9, rol: 'VENDEDOR', sucursalId: null });
    const res = await request(app).get('/api/reportes/ventas').set('Authorization', `Bearer ${tokenMal}`);
    expect(res.status).toBe(403);
  });
});
