const { formatearFolio } = require('../src/utils/folio');

describe('formatearFolio', () => {
  test('rellena a 4 dígitos con la serie', () => {
    expect(formatearFolio('A', 602)).toBe('A-0602');
  });
  test('no trunca números grandes', () => {
    expect(formatearFolio('B', 12345)).toBe('B-12345');
  });
});
