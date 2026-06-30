jest.mock('../src/config/prisma', () => ({
  venta: { findMany: jest.fn(), findUnique: jest.fn() },
  usuario: { findUnique: jest.fn() },
  sucursal: { findUnique: jest.fn() },
  vehiculo: { findUnique: jest.fn() },
  cliente: { findUnique: jest.fn() },
  configuracion: { findUnique: jest.fn().mockResolvedValue({ terminosContrato: '' }) },
  auditoria: { create: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../src/services/ventas.service', () => ({ crearVenta: jest.fn() }));
jest.mock('../src/services/contrato.service', () => ({ generarContratoPDF: jest.fn() }));

const request = require('supertest');
const prisma = require('../src/config/prisma');
const ventasService = require('../src/services/ventas.service');
const contrato = require('../src/services/contrato.service');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });

describe('Ventas endpoints', () => {
  test('GET (VENDEDOR) filtra por su sucursal', async () => {
    prisma.venta.findMany.mockResolvedValue([]);
    await request(app).get('/api/ventas').set('Authorization', `Bearer ${tokenVend}`);
    expect(prisma.venta.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sucursalId: 2 }) }));
  });
  test('POST crea venta (VENDEDOR) => 201 con folio', async () => {
    ventasService.crearVenta.mockResolvedValue({ id: 1, folio: 'A-0602' });
    const res = await request(app).post('/api/ventas').set('Authorization', `Bearer ${tokenVend}`)
      .send({ vehiculoId: 10, clienteId: 5, empleadoId: 3, total: 150000, metodoPago: 'TRANSFERENCIA' });
    expect(res.status).toBe(201);
    expect(res.body.folio).toBe('A-0602');
    expect(ventasService.crearVenta).toHaveBeenCalledWith(expect.objectContaining({ vehiculoId: 10, metodoPago: 'TRANSFERENCIA' }));
  });
  test('POST (ADMIN) sin empleadoId => 400', async () => {
    const res = await request(app).post('/api/ventas').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ vehiculoId: 10, clienteId: 5, total: 1 });
    expect(res.status).toBe(400);
  });
  test('POST /contrato/borrador genera PDF sin registrar venta', async () => {
    prisma.sucursal.findUnique.mockResolvedValue({ id: 2, nombre: 'Santa Isabel', nombreComercial: 'EMPALME MOTORS' });
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 10, sucursalId: 2, anio: 2018, marca: 'Nissan', modelo: 'Versa' });
    contrato.generarContratoPDF.mockResolvedValue(Buffer.from('%PDF-1.4 borrador'));
    const res = await request(app).post('/api/ventas/contrato/borrador').set('Authorization', `Bearer ${tokenVend}`)
      .send({ vehiculoId: 10, cliente: { nombre: 'Cliente Nuevo' }, total: 150000 });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(contrato.generarContratoPDF).toHaveBeenCalledWith(expect.objectContaining({ folio: 'BORRADOR' }));
  });

  test('GET /:id/contrato.pdf devuelve application/pdf', async () => {
    prisma.venta.findUnique.mockResolvedValue({ id: 1, folio: 'A-0602', sucursalId: 2, total: 1, observaciones: 'SIN GARANTÍA', fecha: new Date(), sucursal: {}, vehiculo: {}, cliente: {} });
    contrato.generarContratoPDF.mockResolvedValue(Buffer.from('%PDF-1.4 test'));
    const res = await request(app).get('/api/ventas/1/contrato.pdf').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });
});
