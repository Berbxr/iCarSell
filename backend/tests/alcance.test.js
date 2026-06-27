const { resolverSucursalLectura, resolverSucursalEscritura } = require('../src/utils/alcance');

const req = (usuario, query = {}) => ({ usuario, query });

describe('resolverSucursalLectura', () => {
  test('ADMIN sin filtro => undefined (todas)', () => {
    expect(resolverSucursalLectura(req({ rol: 'ADMIN', sucursalId: null }))).toBeUndefined();
  });
  test('ADMIN con ?sucursalId => ese número', () => {
    expect(resolverSucursalLectura(req({ rol: 'ADMIN', sucursalId: null }, { sucursalId: '3' }))).toBe(3);
  });
  test('VENDEDOR => su propia sucursal, ignora query', () => {
    expect(resolverSucursalLectura(req({ rol: 'VENDEDOR', sucursalId: 2 }, { sucursalId: '9' }))).toBe(2);
  });
  test('VENDEDOR sin sucursal => 403', () => {
    expect(() => resolverSucursalLectura(req({ rol: 'VENDEDOR', sucursalId: null }))).toThrow();
  });
});

describe('resolverSucursalEscritura', () => {
  test('ADMIN debe enviar sucursalId', () => {
    expect(resolverSucursalEscritura(req({ rol: 'ADMIN', sucursalId: null }), 5)).toBe(5);
    expect(() => resolverSucursalEscritura(req({ rol: 'ADMIN', sucursalId: null }), undefined)).toThrow();
  });
  test('VENDEDOR forzado a su sucursal', () => {
    expect(resolverSucursalEscritura(req({ rol: 'VENDEDOR', sucursalId: 2 }), undefined)).toBe(2);
  });
  test('VENDEDOR no puede operar en otra sucursal => 403', () => {
    expect(() => resolverSucursalEscritura(req({ rol: 'VENDEDOR', sucursalId: 2 }), 7)).toThrow();
  });
});
