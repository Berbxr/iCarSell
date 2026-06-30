jest.mock('../src/config/prisma', () => ({
  vehiculo: { findMany: jest.fn() },
  configuracion: { findUnique: jest.fn() },
}));
const request = require('supertest');
const prisma = require('../src/config/prisma');
const crearApp = require('../src/app');
const { firmarToken } = require('../src/utils/jwt');

const app = crearApp();
const tokenAdmin = firmarToken({ id: 1, rol: 'ADMIN', sucursalId: null });
const tokenVend = firmarToken({ id: 2, rol: 'VENDEDOR', sucursalId: 1 });

beforeEach(() => jest.clearAllMocks());

describe('Reporte de ganancias por socio', () => {
  test('agrupa por socio, suma utilidad y convierte a MXN', async () => {
    prisma.configuracion.findUnique.mockResolvedValue({ id: 1, tipoCambioDolar: 20 });
    prisma.vehiculo.findMany.mockResolvedValue([
      { id: 1, anio: 2020, marca: 'Nissan', modelo: 'Versa', precioVenta: 9000, precioCompra: 5000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [], socioId: 1, socio: { id: 1, nombre: 'Juan' }, venta: { fecha: new Date('2026-06-10') } },
      { id: 2, anio: 2021, marca: 'Kia', modelo: 'Rio', precioVenta: 12000, precioCompra: 8000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [{ monto: 500 }], socioId: 1, socio: { id: 1, nombre: 'Juan' }, venta: { fecha: new Date('2026-06-15') } },
      { id: 3, anio: 2019, marca: 'VW', modelo: 'Jetta', precioVenta: 7000, precioCompra: 6000, comisionProveedor: 0, transporte: 0, registroPlacas: 0, salidas: 0, gastos: [], socioId: 2, socio: { id: 2, nombre: 'Ana' }, venta: { fecha: new Date('2026-06-20') } },
    ]);
    const res = await request(app).get('/api/reportes/socios?desde=2026-06-01&hasta=2026-06-30').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.tipoCambio).toBe(20);
    const juan = res.body.socios.find((s) => s.socioId === 1);
    // auto1: 9000-5000=4000 ; auto2: 12000-8500=3500 => 7500 USD
    expect(juan.totalUsd).toBe(7500);
    expect(juan.totalMxn).toBe(150000); // 7500 * 20
    expect(juan.cantidad).toBe(2);
    // general: 7500 + (7000-6000)=1000 => 8500 USD
    expect(res.body.totalGeneralUsd).toBe(8500);
    expect(res.body.totalGeneralMxn).toBe(170000);
  });

  test('prohibido a VENDEDOR', async () => {
    const res = await request(app).get('/api/reportes/socios').set('Authorization', `Bearer ${tokenVend}`);
    expect(res.status).toBe(403);
  });
});
