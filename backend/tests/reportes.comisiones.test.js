jest.mock('../src/config/prisma', () => ({
  venta: { findMany: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Reporte de comisiones', () => {
  test('agrupa por vendedor y suma total general', async () => {
    prisma.venta.findMany.mockResolvedValue([
      { id: 1, folio: 'A-0001', comision: 1000, empleadoId: 3, empleado: { id: 3, nombre: 'Ana', apellidos: 'López' }, vehiculo: { anio: 2020, marca: 'Nissan', modelo: 'Versa' } },
      { id: 2, folio: 'A-0002', comision: 2600, empleadoId: 3, empleado: { id: 3, nombre: 'Ana', apellidos: 'López' }, vehiculo: { anio: 2021, marca: 'Kia', modelo: 'Rio' } },
      { id: 3, folio: 'A-0003', comision: 1600, empleadoId: 4, empleado: { id: 4, nombre: 'Beto', apellidos: 'Ruiz' }, vehiculo: { anio: 2019, marca: 'VW', modelo: 'Jetta' } },
    ]);
    const res = await request(app).get('/api/reportes/comisiones?fecha=2026-06-24').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.totalGeneral).toBe(5200);
    const ana = res.body.vendedores.find((v) => v.empleadoId === 3);
    expect(ana.total).toBe(3600);
    expect(ana.ventas).toHaveLength(2);
    expect(res.body.inicio).toBeDefined();
    expect(res.body.fin).toBeDefined();
  });

  test('filtra por la semana de la fecha (gte inicio, lte fin)', async () => {
    prisma.venta.findMany.mockResolvedValue([]);
    await request(app).get('/api/reportes/comisiones?fecha=2026-06-24').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.venta.findMany.mock.calls[0][0];
    expect(arg.where.fecha.gte).toBeInstanceOf(Date);
    expect(arg.where.fecha.lte).toBeInstanceOf(Date);
    expect(arg.where.fecha.lte.getTime()).toBeGreaterThan(arg.where.fecha.gte.getTime());
  });

  test('prohibido para VENDEDOR', async () => {
    const res = await request(app).get('/api/reportes/comisiones').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});
