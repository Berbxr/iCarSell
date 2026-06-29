const c = require('../src/utils/costos');

const base = {
  precioCompra: 5000, comisionProveedor: 300, transporte: 700, registroPlacas: 400, salidas: 100,
  gastos: [{ monto: 200 }, { monto: 300 }], precioVenta: 9000,
  fechaIngreso: new Date('2026-06-01T00:00:00'),
};

describe('costos', () => {
  test('costoPuestoEnMexico suma los 5 campos fijos', () => {
    expect(c.costoPuestoEnMexico(base)).toBe(6500);
  });
  test('sumaGastos suma los gastos', () => {
    expect(c.sumaGastos(base)).toBe(500);
  });
  test('costoTotal = puesto en México + gastos', () => {
    expect(c.costoTotal(base)).toBe(7000);
  });
  test('utilidad = precioVenta - costoTotal', () => {
    expect(c.utilidad(base)).toBe(2000);
  });
  test('utilidad puede ser negativa', () => {
    expect(c.utilidad({ ...base, precioVenta: 6000 })).toBe(-1000);
  });
  test('sin gastos, sumaGastos es 0', () => {
    expect(c.sumaGastos({ precioCompra: 1000 })).toBe(0);
  });
  test('diasEnCompra usa fechaPaseAVenta si existe', () => {
    const v = { fechaIngreso: new Date('2026-06-01T00:00:00'), fechaPaseAVenta: new Date('2026-06-11T00:00:00') };
    expect(c.diasEnCompra(v)).toBe(10);
  });
  test('diasEnCompra usa hoy si no hay fechaPaseAVenta', () => {
    const v = { fechaIngreso: new Date('2026-06-01T00:00:00') };
    expect(c.diasEnCompra(v, new Date('2026-06-06T00:00:00'))).toBe(5);
  });
  test('diasEnVenta es null si no hubo paso a venta', () => {
    expect(c.diasEnVenta({ fechaIngreso: new Date('2026-06-01') })).toBeNull();
  });
  test('diasEnVenta usa fecha de venta si está vendido', () => {
    const v = { fechaPaseAVenta: new Date('2026-06-10T00:00:00'), venta: { fecha: new Date('2026-06-20T00:00:00') } };
    expect(c.diasEnVenta(v)).toBe(10);
  });
  test('diasEnVenta usa hoy si pasó a venta y no se ha vendido', () => {
    const v = { fechaPaseAVenta: new Date('2026-06-10T00:00:00') };
    expect(c.diasEnVenta(v, new Date('2026-06-13T00:00:00'))).toBe(3);
  });
});
