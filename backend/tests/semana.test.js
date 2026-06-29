const { rangoSemana } = require('../src/utils/semana');

describe('rangoSemana', () => {
  test('un miércoles cae en su semana lun-dom', () => {
    const { inicio, fin } = rangoSemana(new Date(2026, 5, 24)); // mié 24 jun 2026
    expect(inicio.getDay()).toBe(1); // lunes
    expect(fin.getDay()).toBe(0);    // domingo
    expect(inicio.getDate()).toBe(22);
    expect(fin.getDate()).toBe(28);
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(fin.getHours()).toBe(23);
    expect(fin.getMinutes()).toBe(59);
  });

  test('un domingo pertenece a la semana que termina ese día', () => {
    const { inicio, fin } = rangoSemana(new Date(2026, 5, 28)); // dom 28 jun
    expect(inicio.getDate()).toBe(22); // lunes 22
    expect(fin.getDate()).toBe(28);    // domingo 28
  });

  test('un lunes es el inicio de su propia semana', () => {
    const { inicio } = rangoSemana(new Date(2026, 5, 22)); // lun 22 jun
    expect(inicio.getDate()).toBe(22);
    expect(inicio.getHours()).toBe(0);
  });
});
