jest.mock('../src/config/prisma', () => ({
  venta: { findMany: jest.fn(), findFirst: jest.fn(), aggregate: jest.fn() },
  vehiculo: { findMany: jest.fn(), groupBy: jest.fn() },
  gastoGeneral: { findMany: jest.fn() },
  configuracion: { findUnique: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 2 });

describe('Dashboard', () => {
  test('GET /api/dashboard (ADMIN con ?sucursalId) responde KPIs y filtra por sucursal', async () => {
    prisma.configuracion.findUnique.mockResolvedValue({ diasAntiguedadAlerta: 60, tipoCambioDolar: 20 });
    prisma.venta.findMany.mockResolvedValue([
      { total: 100, comision: 0, metodoPago: 'EFECTIVO', fecha: new Date(), empleado: { id: 3, nombre: 'Ana', apellidos: 'Pérez' } },
      { total: 250, comision: 0, metodoPago: 'EFECTIVO', fecha: new Date(), empleado: { id: 3, nombre: 'Ana', apellidos: 'Pérez' } },
      { total: 80, comision: 0, metodoPago: 'TRANSFERENCIA', fecha: new Date(), empleado: { id: 4, nombre: 'Luis', apellidos: 'Gómez' } },
    ]);
    prisma.gastoGeneral.findMany.mockResolvedValue([{ monto: 1500 }]);
    prisma.vehiculo.groupBy.mockResolvedValue([
      { estado: 'EN_COMPRA', _count: { _all: 2 } },
      { estado: 'DISPONIBLE', _count: { _all: 5 } },
    ]);
    prisma.venta.findFirst.mockResolvedValue({
      id: 9, folio: 'A-0009', total: 80, fecha: new Date(),
      vehiculo: { anio: 2020, marca: 'Mazda', modelo: '3' },
      cliente: { nombre: 'Pedro' }, empleado: { nombre: 'Luis', apellidos: 'Gómez' },
    });
    prisma.vehiculo.findMany.mockResolvedValue([
      { id: 1, marca: 'Nissan', modelo: 'Versa', fechaIngreso: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90) },
    ]);
    const res = await request(app).get('/api/dashboard?sucursalId=2').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ventasSemana');
    expect(res.body).toHaveProperty('ventasMes');
    expect(res.body).toHaveProperty('antiguedad');
    expect(res.body).toHaveProperty('ventas6Meses');
    expect(res.body.antiguedad[0].dias).toBeGreaterThanOrEqual(60);
    expect(prisma.vehiculo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sucursalId: 2 }) }));

    // Ventas por empleado: Ana con 2 ventas (350) primero, Luis con 1 (80)
    expect(res.body.ventasPorEmpleado).toHaveLength(2);
    expect(res.body.ventasPorEmpleado[0]).toMatchObject({ nombre: 'Ana Pérez', cantidad: 2, monto: 350 });
    expect(res.body.ventasPorEmpleado[1]).toMatchObject({ nombre: 'Luis Gómez', cantidad: 1, monto: 80 });

    // Último auto vendido
    expect(res.body.ultimaVenta).toMatchObject({ folio: 'A-0009' });
    expect(res.body.ultimaVenta.vehiculo).toMatchObject({ marca: 'Mazda', modelo: '3' });

    // KPIs financieros nuevos
    expect(res.body).toHaveProperty('tipoCambio', 20);
    expect(res.body).toHaveProperty('utilidadMesUsd');
    expect(res.body).toHaveProperty('utilidadNetaMxn');
    expect(res.body.gastosMes).toBe(1500);
    expect(res.body.efectivoMes).toBe(350); // 100 + 250
    expect(res.body.transferenciaMes).toBe(80);
    expect(res.body.inventarioEstados).toMatchObject({ EN_COMPRA: 2, DISPONIBLE: 5 });
  });

  test('GET /api/dashboard con VENDEDOR => 403 (no ve ventas)', async () => {
    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});
