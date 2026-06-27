jest.mock('../src/config/prisma', () => {
  const prisma = {
    vehiculo: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    vehiculoFoto: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
    auditoria: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn(async (fn) => fn(prisma));
  return prisma;
});
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });

describe('Vehiculos', () => {
  test('GET (VENDEDOR) filtra por su sucursal', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.vehiculo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sucursalId: 2 }) }));
  });
  test('GET ?estado=DISPONIBLE agrega filtro de estado', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?estado=DISPONIBLE').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.vehiculo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ estado: 'DISPONIBLE' }) }));
  });
  test('POST crea (VENDEDOR su sucursal) => 201', async () => {
    prisma.vehiculo.create.mockResolvedValue({ id: 10, marca: 'Nissan', sucursalId: 2 });
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 10, marca: 'Nissan', sucursalId: 2, fotos: [] });
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`)
      .send({ anio: 2018, marca: 'Nissan', modelo: 'Versa', precioVenta: 150000 });
    expect(res.status).toBe(201);
  });
  test('POST sin marca/modelo/anio => 400', async () => {
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`).send({ marca: 'Nissan' });
    expect(res.status).toBe(400);
  });
  test('POST (ADMIN) sin sucursalId => 400', async () => {
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ anio: 2018, marca: 'Nissan', modelo: 'Versa' });
    expect(res.status).toBe(400);
  });
});
