const { calcularComision } = require('../src/utils/comision');

const RANGOS = [
  { desdeUsd: 0, monto: 1000 },
  { desdeUsd: 6000, monto: 1600 },
  { desdeUsd: 10000, monto: 2600 },
];

describe('calcularComision', () => {
  test.each([
    [0, 1000],
    [1, 1000],
    [5999, 1000],
    [6000, 1600],
    [9999, 1600],
    [10000, 2600],
    [10500, 2600],
  ])('precio %i USD => %i MXN', (precio, esperado) => {
    expect(calcularComision(precio, RANGOS)).toBe(esperado);
  });

  test('lista de rangos vacía => 0', () => {
    expect(calcularComision(8000, [])).toBe(0);
  });

  test('precio por debajo del menor desdeUsd => 0', () => {
    expect(calcularComision(50, [{ desdeUsd: 100, monto: 500 }])).toBe(0);
  });

  test('no depende del orden del array de entrada', () => {
    const desordenados = [
      { desdeUsd: 10000, monto: 2600 },
      { desdeUsd: 0, monto: 1000 },
      { desdeUsd: 6000, monto: 1600 },
    ];
    expect(calcularComision(7000, desordenados)).toBe(1600);
  });
});
