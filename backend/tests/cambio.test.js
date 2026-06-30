const { usdAMxn } = require('../src/utils/cambio');

describe('usdAMxn', () => {
  test('convierte usando el tipo de cambio', () => {
    expect(usdAMxn(100, 17.5)).toBe(1750);
  });
  test('tc 0 => 0', () => {
    expect(usdAMxn(100, 0)).toBe(0);
  });
  test('valores no numéricos => 0', () => {
    expect(usdAMxn(undefined, 17)).toBe(0);
    expect(usdAMxn(100, null)).toBe(0);
  });
});
