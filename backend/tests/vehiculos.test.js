jest.mock('../src/config/prisma', () => {
  const prisma = {
    vehiculo: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
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
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });

describe('Vehiculos', () => {
  test('GET (VENDEDOR) sin filtro ve todas las sucursales', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.vehiculo.findMany.mock.calls[0][0].where.sucursalId).toBeUndefined();
  });
  test('GET ?sucursalId filtra por esa sucursal', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?sucursalId=2').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.vehiculo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sucursalId: 2 }) }));
  });
  test('GET ?estado=DISPONIBLE agrega filtro de estado', async () => {
    prisma.vehiculo.findMany.mockResolvedValue([]);
    await request(app).get('/api/vehiculos?estado=DISPONIBLE').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.vehiculo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ estado: 'DISPONIBLE' }) }));
  });
  test('POST crea (ALMACEN con sucursal) => 201', async () => {
    prisma.vehiculo.create.mockResolvedValue({ id: 10, marca: 'Nissan', sucursalId: 2 });
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 10, marca: 'Nissan', sucursalId: 2, fotos: [], gastos: [] });
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`)
      .send({ anio: 2018, marca: 'Nissan', modelo: 'Versa', precioVenta: 150000, sucursalId: 2, socioId: 1 });
    expect(res.status).toBe(201);
  });
  test('POST (VENDEDOR) prohibido => 403', async () => {
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenVend}`)
      .send({ anio: 2018, marca: 'Nissan', modelo: 'Versa', sucursalId: 2 });
    expect(res.status).toBe(403);
  });
  test('POST sin marca/modelo/anio => 400', async () => {
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`).send({ marca: 'Nissan', sucursalId: 2 });
    expect(res.status).toBe(400);
  });
  test('POST (ADMIN) sin sucursalId => 400', async () => {
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ anio: 2018, marca: 'Nissan', modelo: 'Versa' });
    expect(res.status).toBe(400);
  });
  test('POST con VIN ya existente => 409', async () => {
    prisma.vehiculo.findFirst.mockResolvedValue({ id: 7, marca: 'Nissan', modelo: 'Versa', anio: 2018, sucursal: { nombre: 'Empalme' } });
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`)
      .send({ anio: 2019, marca: 'VW', modelo: 'Jetta', vin: '1n4al3ap8jc123456', sucursalId: 2, socioId: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Nissan');
  });
  test('POST normaliza el VIN a mayúsculas y busca por ese valor', async () => {
    prisma.vehiculo.findFirst.mockClear();
    prisma.vehiculo.create.mockClear();
    prisma.vehiculo.findFirst.mockResolvedValue(null);
    prisma.vehiculo.create.mockResolvedValue({ id: 11, marca: 'VW', sucursalId: 2 });
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 11, marca: 'VW', sucursalId: 2, fotos: [], gastos: [] });
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`)
      .send({ anio: 2019, marca: 'VW', modelo: 'Jetta', vin: ' abc123 ', sucursalId: 2, socioId: 1 });
    expect(res.status).toBe(201);
    expect(prisma.vehiculo.findFirst.mock.calls[0][0].where.vin).toBe('ABC123');
    expect(prisma.vehiculo.create.mock.calls[0][0].data.vin).toBe('ABC123');
  });
  test('POST con VIN vacío se guarda como null y no valida unicidad', async () => {
    prisma.vehiculo.findFirst.mockClear();
    prisma.vehiculo.create.mockClear();
    prisma.vehiculo.create.mockResolvedValue({ id: 12, marca: 'VW', sucursalId: 2 });
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 12, marca: 'VW', sucursalId: 2, fotos: [], gastos: [] });
    const res = await request(app).post('/api/vehiculos').set('Authorization', `Bearer ${tokenAlmacen}`)
      .send({ anio: 2019, marca: 'VW', modelo: 'Jetta', vin: '   ', sucursalId: 2, socioId: 1 });
    expect(res.status).toBe(201);
    expect(prisma.vehiculo.create.mock.calls[0][0].data.vin).toBeNull();
    expect(prisma.vehiculo.findFirst).not.toHaveBeenCalled();
  });
  test('GET /vin-existe con VIN existente => { existe: true, descripcion }', async () => {
    prisma.vehiculo.findFirst.mockClear();
    prisma.vehiculo.findFirst.mockResolvedValue({ id: 7, marca: 'Nissan', modelo: 'Versa', anio: 2018, sucursal: { nombre: 'Empalme' } });
    const res = await request(app).get('/api/vehiculos/vin-existe?vin=abc123').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ existe: true, descripcion: 'Nissan Versa 2018 (Empalme)' });
    expect(prisma.vehiculo.findFirst.mock.calls[0][0].where.vin).toBe('ABC123');
  });
  test('GET /vin-existe sin coincidencia => { existe: false }', async () => {
    prisma.vehiculo.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/vehiculos/vin-existe?vin=zzz').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.body).toEqual({ existe: false });
  });
  test('GET /vin-existe con ?excluir excluye ese id', async () => {
    prisma.vehiculo.findFirst.mockClear();
    prisma.vehiculo.findFirst.mockResolvedValue(null);
    await request(app).get('/api/vehiculos/vin-existe?vin=abc&excluir=5').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.vehiculo.findFirst.mock.calls[0][0].where.id).toEqual({ not: 5 });
  });
});
