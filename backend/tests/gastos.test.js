jest.mock('../src/config/prisma', () => ({
  gastoGeneral: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
  vehiculo: { findMany: jest.fn() },
  configuracion: { findUnique: jest.fn() },
  auditoria: { create: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenAlmacen = firmarToken({ id: 3, rol: 'ALMACEN', sucursalId: null });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.vehiculo.findMany.mockResolvedValue([]); // por defecto, sin autos con costos (la mayoría de los tests no los necesita)
  prisma.configuracion.findUnique.mockResolvedValue({ id: 1, mostrarGastosAutos: false }); // oculto por defecto
});

describe('Gastos generales', () => {
  test('GET devuelve total y desglose por categoría (ADMIN)', async () => {
    prisma.gastoGeneral.findMany.mockResolvedValue([
      { id: 1, categoria: 'Insumos', descripcion: 'Aceite', monto: 500, fecha: new Date() },
      { id: 2, categoria: 'Insumos', descripcion: 'Filtros', monto: 300, fecha: new Date() },
      { id: 3, categoria: 'Renta', descripcion: 'Local', monto: 8000, fecha: new Date() },
    ]);
    const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8800);
    expect(res.body.porCategoria.Insumos).toBe(800);
    expect(res.body.porCategoria.Renta).toBe(8000);
  });
  test('POST crea gasto (ADMIN)', async () => {
    prisma.gastoGeneral.create.mockResolvedValue({ id: 9, categoria: 'Insumos', descripcion: 'Aceite', monto: 500 });
    const res = await request(app).post('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ categoria: 'Insumos', descripcion: 'Aceite', monto: 500 });
    expect(res.status).toBe(201);
  });
  test('POST rechaza campos vacíos', async () => {
    const res = await request(app).post('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`).send({ categoria: '', descripcion: '', monto: 1 });
    expect(res.status).toBe(400);
  });
  test('POST rechaza la categoría reservada "Gastos de autos"', async () => {
    const res = await request(app).post('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ categoria: 'gastos de autos', descripcion: 'x', monto: 1 });
    expect(res.status).toBe(400);
    expect(prisma.gastoGeneral.create).not.toHaveBeenCalled();
  });
  test('GET prohibido a ALMACEN', async () => {
    const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAlmacen}`);
    expect(res.status).toBe(403);
  });

  test('GET ?desde=X&hasta=X (mismo día) incluye gastos registrados en cualquier hora de ese día', async () => {
    prisma.gastoGeneral.findMany.mockResolvedValue([]);
    await request(app).get('/api/gastos?desde=2026-09-01&hasta=2026-09-01').set('Authorization', `Bearer ${tokenAdmin}`);
    const where = prisma.gastoGeneral.findMany.mock.calls[0][0].where;
    expect(where.fecha.gte).toEqual(new Date('2026-09-01'));
    // "hasta" debe cubrir todo el día (23:59:59.999), no solo la medianoche exacta.
    expect(where.fecha.lte).toEqual(new Date('2026-09-01T23:59:59.999Z'));
  });

  describe('Gastos de autos (costos de Vehiculo/GastoVehiculo mezclados en el listado)', () => {
    const vehiculoConCostos = {
      id: 7, marca: 'Kia', modelo: 'Rio', anio: 2020,
      precioCompra: 5000, fechaCompra: new Date('2026-08-10'),
      comisionProveedor: 0, fechaComisionProveedor: null,
      transporte: 0, fechaTransporte: null,
      registroPlacas: 0, fechaRegistroPlacas: null,
      salidas: 0, fechaSalidas: null,
      gastos: [],
    };

    test('oculto por defecto (Configuracion.mostrarGastosAutos = false): no se consulta Vehiculo ni se incluyen en el total', async () => {
      prisma.gastoGeneral.findMany.mockResolvedValue([
        { id: 1, categoria: 'Insumos', descripcion: 'Aceite', monto: 500, fecha: new Date('2026-08-10') },
      ]);
      const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(500);
      expect(res.body.porCategoria['Gastos de autos']).toBeUndefined();
      expect(prisma.vehiculo.findMany).not.toHaveBeenCalled();
    });

    test('con mostrarGastosAutos=true: se agregan al total y a porCategoria bajo "Gastos de autos", con referencia al auto', async () => {
      prisma.configuracion.findUnique.mockResolvedValue({ id: 1, mostrarGastosAutos: true });
      prisma.gastoGeneral.findMany.mockResolvedValue([
        { id: 1, categoria: 'Insumos', descripcion: 'Aceite', monto: 500, fecha: new Date('2026-08-10') },
      ]);
      prisma.vehiculo.findMany.mockResolvedValue([vehiculoConCostos]);
      const res = await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5500);
      expect(res.body.porCategoria['Gastos de autos']).toBe(5000);
      const linea = res.body.gastos.find((g) => g.tipo === 'auto');
      expect(linea).toMatchObject({ monto: 5000, referencia: 'Kia Rio (2020)', vehiculoId: 7 });
    });

    test('con mostrarGastosAutos=true: solo trae vehículos activos (where.activo = true)', async () => {
      prisma.configuracion.findUnique.mockResolvedValue({ id: 1, mostrarGastosAutos: true });
      prisma.vehiculo.findMany.mockResolvedValue([]);
      await request(app).get('/api/gastos').set('Authorization', `Bearer ${tokenAdmin}`);
      expect(prisma.vehiculo.findMany.mock.calls[0][0].where.activo).toBe(true);
    });

    test('con mostrarGastosAutos=true: el filtro de fechas también aplica a los costos de autos', async () => {
      prisma.configuracion.findUnique.mockResolvedValue({ id: 1, mostrarGastosAutos: true });
      prisma.gastoGeneral.findMany.mockResolvedValue([]);
      prisma.vehiculo.findMany.mockResolvedValue([vehiculoConCostos]); // fechaCompra: 2026-08-10
      const res = await request(app).get('/api/gastos?desde=2026-09-01&hasta=2026-09-30').set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.body.total).toBe(0); // fuera de rango, se excluye
    });
  });
});
