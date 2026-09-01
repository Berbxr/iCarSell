jest.mock('../src/config/prisma', () => ({
  vehiculo: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('DELETE /api/vehiculos/:id', () => {
  test('rechaza si el vehículo está VENDIDO (venta activa)', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'VENDIDO', marca: 'Kia', modelo: 'Rio', anio: 2018, fotos: [], ventas: [{ id: 1 }] });
    const res = await request(app).delete('/api/vehiculos/7').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(409);
    expect(prisma.vehiculo.update).not.toHaveBeenCalled();
    expect(prisma.vehiculo.delete).not.toHaveBeenCalled();
  });

  test('borrado permanente si nunca tuvo ventas, con motivo en la auditoría', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'DISPONIBLE', marca: 'Kia', modelo: 'Rio', anio: 2018, fotos: [], ventas: [] });
    prisma.vehiculo.delete.mockResolvedValue({ id: 7 });
    const res = await request(app).delete('/api/vehiculos/7').set('Authorization', `Bearer ${tokenAdmin}`).send({ motivo: 'Registrado por error' });
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('permanente');
    expect(prisma.vehiculo.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prisma.vehiculo.update).not.toHaveBeenCalled();
    expect(prisma.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accion: 'ELIMINAR_VEHICULO', entidadId: 7, datos: expect.objectContaining({ tipo: 'permanente', motivo: 'Registrado por error' }) }),
    }));
  });

  test('borrado suave (activo:false) si tuvo una venta ya cancelada, guarda motivoEliminacion', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'DISPONIBLE', marca: 'Kia', modelo: 'Rio', anio: 2018, fotos: [], ventas: [{ id: 1 }] });
    prisma.vehiculo.update.mockResolvedValue({ id: 7, activo: false });
    const res = await request(app).delete('/api/vehiculos/7').set('Authorization', `Bearer ${tokenAdmin}`).send({ motivo: 'Auto regresado por el cliente' });
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('soft');
    expect(prisma.vehiculo.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { activo: false, motivoEliminacion: 'Auto regresado por el cliente' } });
    expect(prisma.vehiculo.delete).not.toHaveBeenCalled();
    expect(prisma.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accion: 'ELIMINAR_VEHICULO', datos: expect.objectContaining({ tipo: 'soft', motivo: 'Auto regresado por el cliente' }) }),
    }));
  });

  test('borrado suave sin motivo guarda motivoEliminacion en null', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, estado: 'DISPONIBLE', marca: 'Kia', modelo: 'Rio', anio: 2018, fotos: [], ventas: [{ id: 1 }] });
    prisma.vehiculo.update.mockResolvedValue({ id: 7, activo: false });
    const res = await request(app).delete('/api/vehiculos/7').set('Authorization', `Bearer ${tokenAdmin}`).send({});
    expect(res.status).toBe(200);
    expect(prisma.vehiculo.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { activo: false, motivoEliminacion: null } });
  });

  test('404 si el vehículo no existe', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/vehiculos/999').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
  });

  test('ALMACEN no puede eliminar', async () => {
    const res = await request(app).delete('/api/vehiculos/7').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(403);
    expect(prisma.vehiculo.findUnique).not.toHaveBeenCalled();
  });

  test('VENDEDOR no puede eliminar', async () => {
    const res = await request(app).delete('/api/vehiculos/7').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/vehiculos/:id/restaurar', () => {
  test('restaura un vehículo en borrado suave y limpia motivoEliminacion', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, activo: false });
    prisma.vehiculo.update.mockResolvedValue({ id: 7, activo: true });
    const res = await request(app).put('/api/vehiculos/7/restaurar').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(prisma.vehiculo.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { activo: true, motivoEliminacion: null } });
    expect(prisma.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accion: 'RESTAURAR_VEHICULO', entidadId: 7 }),
    }));
  });

  test('rechaza restaurar un vehículo que ya está activo', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue({ id: 7, activo: true });
    const res = await request(app).put('/api/vehiculos/7/restaurar').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(409);
    expect(prisma.vehiculo.update).not.toHaveBeenCalled();
  });

  test('404 si el vehículo no existe', async () => {
    prisma.vehiculo.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/vehiculos/999/restaurar').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
  });

  test('ALMACEN no puede restaurar', async () => {
    const res = await request(app).put('/api/vehiculos/7/restaurar').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(403);
  });
});
