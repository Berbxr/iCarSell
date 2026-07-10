const { calcularDescuento } = require('../src/utils/descuento');

describe('calcularDescuento', () => {
  test('monto fijo: resta al precio de lista', () => {
    expect(calcularDescuento(10000, 'MONTO', 1500)).toEqual({ descuento: 1500, total: 8500 });
  });

  test('porcentaje: aplica el % sobre el precio de lista', () => {
    expect(calcularDescuento(10000, 'PORCENTAJE', 10)).toEqual({ descuento: 1000, total: 9000 });
  });

  test('sin descuento (valor 0) => total = precio de lista', () => {
    expect(calcularDescuento(10000, 'MONTO', 0)).toEqual({ descuento: 0, total: 10000 });
  });

  test('monto mayor al precio de lista se limita al precio (total 0)', () => {
    expect(calcularDescuento(5000, 'MONTO', 8000)).toEqual({ descuento: 5000, total: 0 });
  });

  test('porcentaje mayor a 100 se limita a 100% (total 0)', () => {
    expect(calcularDescuento(5000, 'PORCENTAJE', 150)).toEqual({ descuento: 5000, total: 0 });
  });

  test('valores negativos se tratan como 0', () => {
    expect(calcularDescuento(5000, 'MONTO', -100)).toEqual({ descuento: 0, total: 5000 });
    expect(calcularDescuento(5000, 'PORCENTAJE', -5)).toEqual({ descuento: 0, total: 5000 });
  });

  test('precio de lista inválido o 0 => sin descuento', () => {
    expect(calcularDescuento(0, 'MONTO', 100)).toEqual({ descuento: 0, total: 0 });
    expect(calcularDescuento(-10, 'PORCENTAJE', 10)).toEqual({ descuento: 0, total: 0 });
  });

  test('redondea a 2 decimales (porcentaje con fracción)', () => {
    expect(calcularDescuento(9999, 'PORCENTAJE', 7)).toEqual({ descuento: 699.93, total: 9299.07 });
  });

  test('tipo desconocido => sin descuento', () => {
    expect(calcularDescuento(5000, 'OTRO', 50)).toEqual({ descuento: 0, total: 5000 });
  });
});
