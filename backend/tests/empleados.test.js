jest.mock('../src/config/prisma', () => ({
  empleado: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditoria: { create: jest.fn().mockResolvedValue({}) },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });

describe('Empleados', () => {
  test('GET lista (ADMIN) sin filtro => where vacío de sucursal', async () => {
    prisma.empleado.findMany.mockResolvedValue([{ id: 1, nombre: 'Juan' }]);
    const res = await request(app).get('/api/empleados').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(prisma.empleado.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ sucursalId: expect.anything() }) }));
  });
  test('GET lista (VENDEDOR) filtra por su sucursal', async () => {
    prisma.empleado.findMany.mockResolvedValue([]);
    await request(app).get('/api/empleados').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.empleado.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sucursalId: 2 }) }));
  });
  test('POST crea (ADMIN) con sucursalId => 201', async () => {
    prisma.empleado.create.mockResolvedValue({ id: 5, nombre: 'Ana' });
    const res = await request(app).post('/api/empleados').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'Ana', apellidos: 'Pérez', puesto: 'Vendedor', sucursalId: 2 });
    expect(res.status).toBe(201);
  });
  test('POST (ADMIN) sin sucursalId => 400', async () => {
    const res = await request(app).post('/api/empleados').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'Ana', apellidos: 'Pérez', puesto: 'Vendedor' });
    expect(res.status).toBe(400);
  });
  test('POST con VENDEDOR => 403', async () => {
    const res = await request(app).post('/api/empleados').set('Authorization', `Bearer ${tokenVend}`)
      .send({ nombre: 'Ana', apellidos: 'P', puesto: 'Vendedor', sucursalId: 2 });
    expect(res.status).toBe(403);
  });
});
