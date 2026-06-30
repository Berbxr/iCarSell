jest.mock('../src/config/prisma', () => ({
  vehiculo: { findMany: jest.fn(), findUnique: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

const fila = {
  id: 7, sucursalId: 1, marca: 'Kia', modelo: 'Rio', estado: 'DISPONIBLE', precioVenta: 9000,
  precioCompra: 5000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0,
  gastos: [], fechaIngreso: new Date('2026-06-01'), fechaPaseAVenta: new Date('2026-06-05'),
  fotos: [], sucursal: { id: 1, nombre: 'Matriz' }, socioId: 1, socio: { id: 1, nombre: 'Sin asignar' },
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/vehiculos visibilidad', () => {
  test('ADMIN recibe costos y utilidad', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body[0].precioCompra).toBe(5000);
    expect(res.body[0].utilidad).toBe(4000);
  });

  test('VENDEDOR no recibe costos ni utilidad', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
    expect(res.body[0].precioVenta).toBe(9000);
    expect(res.body[0].precioCompra).toBeUndefined();
    expect(res.body[0].utilidad).toBeUndefined();
  });

  test('filtro ?inventario=compra consulta estado EN_COMPRA', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?inventario=compra').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.estado).toBe('EN_COMPRA');
  });

  test('filtro ?inventario=venta excluye EN_COMPRA', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?inventario=venta').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.estado).toEqual({ in: ['DISPONIBLE', 'RESERVADO', 'VENDIDO'] });
  });
  test('VENDEDOR ve todas las sucursales (no se fuerza la suya)', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?inventario=venta').set('Authorization', `Bearer ${tokenVend}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.sucursalId).toBeUndefined();
  });
  test('filtro ?socioId agrega el filtro de socio', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?socioId=5').set('Authorization', `Bearer ${tokenAdmin}`);
    const arg = prisma.vehiculo.findMany.mock.calls[0][0];
    expect(arg.where.socioId).toBe(5);
  });
  test('ADMIN recibe el socio del vehículo', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.body[0].socio).toEqual({ id: 1, nombre: 'Sin asignar' });
  });
  test('VENDEDOR no recibe el socio', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([{ ...fila }]);
    const res = await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.body[0].socio).toBeUndefined();
  });
});
