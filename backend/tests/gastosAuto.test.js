const { gastosDeAutos, CATEGORIA_GASTOS_AUTO } = require('../src/utils/gastosAuto');

const vehiculoBase = {
  id: 7, marca: 'Kia', modelo: 'Rio', anio: 2020,
  precioCompra: 5000, fechaCompra: new Date('2026-08-01'),
  comisionProveedor: 200, fechaComisionProveedor: new Date('2026-08-02'),
  transporte: 0, fechaTransporte: null,
  registroPlacas: 150, fechaRegistroPlacas: new Date('2026-08-03'),
  salidas: 0, fechaSalidas: null,
  gastos: [{ id: 1, descripcion: 'Pintura', monto: 500, fecha: new Date('2026-08-05') }],
};

describe('gastosDeAutos', () => {
  test('genera una línea por cada costo > 0, omitiendo los que están en 0', () => {
    const items = gastosDeAutos([vehiculoBase]);
    const descripciones = items.map((i) => i.descripcion);
    expect(descripciones).toContain('Precio compra');
    expect(descripciones).toContain('Comisión proveedor');
    expect(descripciones).toContain('Registro/Placas');
    expect(descripciones).not.toContain('Transporte'); // monto 0, se omite
    expect(descripciones).not.toContain('Salidas'); // monto 0, se omite
  });

  test('incluye los gastos adicionales del vehículo (GastoVehiculo)', () => {
    const items = gastosDeAutos([vehiculoBase]);
    const pintura = items.find((i) => i.descripcion === 'Pintura');
    expect(pintura).toMatchObject({ monto: 500, categoria: CATEGORIA_GASTOS_AUTO, tipo: 'auto', vehiculoId: 7 });
  });

  test('cada línea trae la referencia del vehículo y la categoría fija "Gastos de autos"', () => {
    const items = gastosDeAutos([vehiculoBase]);
    for (const item of items) {
      expect(item.referencia).toBe('Kia Rio (2020)');
      expect(item.categoria).toBe(CATEGORIA_GASTOS_AUTO);
    }
  });

  test('sin vehículos devuelve arreglo vacío', () => {
    expect(gastosDeAutos([])).toEqual([]);
    expect(gastosDeAutos(undefined)).toEqual([]);
  });
});
