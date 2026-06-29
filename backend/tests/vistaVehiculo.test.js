const { vistaVehiculo } = require('../src/utils/costos');

const v = {
  id: 1, marca: 'Nissan', modelo: 'Versa', precioVenta: 9000,
  precioCompra: 5000, comisionProveedor: 300, transporte: 700, registroPlacas: 400, salidas: 100,
  gastos: [{ id: 1, monto: 500, descripcion: 'Pintura' }],
  fechaIngreso: new Date('2026-06-01T00:00:00'), fechaPaseAVenta: new Date('2026-06-11T00:00:00'),
};

describe('vistaVehiculo', () => {
  test('ADMIN ve costos, utilidad y derivados', () => {
    const r = vistaVehiculo(v, 'ADMIN');
    expect(r.precioCompra).toBe(5000);
    expect(r.costoPuestoEnMexico).toBe(6500);
    expect(r.costoTotal).toBe(7000);
    expect(r.utilidad).toBe(2000);
    expect(r.diasEnCompra).toBe(10);
    expect(r.gastos).toHaveLength(1);
  });
  test('ALMACEN ve lo mismo que ADMIN', () => {
    const r = vistaVehiculo(v, 'ALMACEN');
    expect(r.utilidad).toBe(2000);
    expect(r.precioCompra).toBe(5000);
  });
  test('VENDEDOR no ve costos, gastos ni utilidad pero sí precioVenta', () => {
    const r = vistaVehiculo(v, 'VENDEDOR');
    expect(r.precioVenta).toBe(9000);
    expect(r.precioCompra).toBeUndefined();
    expect(r.comisionProveedor).toBeUndefined();
    expect(r.transporte).toBeUndefined();
    expect(r.registroPlacas).toBeUndefined();
    expect(r.salidas).toBeUndefined();
    expect(r.gastos).toBeUndefined();
    expect(r.costoTotal).toBeUndefined();
    expect(r.utilidad).toBeUndefined();
  });
});
