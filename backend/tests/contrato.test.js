const { construirHtmlContrato } = require('../src/services/contrato.service');

const venta = {
  folio: 'A-0602', total: 150000, observaciones: 'SIN GARANTÍA', fecha: new Date('2026-06-26T12:00:00'),
  terminos: '1-. PRUEBA',
  sucursal: { nombre: 'EMPALME MOTORS', domicilio: 'BLVD. LÁZARO CÁRDENAS #49', colonia: 'LOS MILAGROS', codigoPostal: '21138', ciudadEstado: 'MEXICALI, BAJA CALIFORNIA', logo: null },
  vehiculo: { anio: 2018, marca: 'Nissan', modelo: 'Versa', color: 'Blanco', placa: 'ABC123', vin: '1N4AL3AP8JC123456' },
  cliente: { nombre: 'Juan Pérez', domicilio: 'Calle 1', colonia: 'Centro', codigoPostal: '21000', ciudadEstado: 'Mexicali, BC' },
};

describe('construirHtmlContrato', () => {
  test('incluye folio, nombre de sucursal y nombre del comprador', () => {
    const html = construirHtmlContrato(venta);
    expect(html).toContain('A-0602');
    expect(html).toContain('EMPALME MOTORS');
    expect(html).toContain('Juan Pérez');
  });
  test('usa nombreComercial en el contrato cuando está definido', () => {
    const html = construirHtmlContrato({ ...venta, sucursal: { ...venta.sucursal, nombre: 'Santa Isabel', nombreComercial: 'EMPALME MOTORS' } });
    expect(html).toContain('EMPALME MOTORS');
    expect(html).not.toContain('>Santa Isabel<');
  });
  test('incluye marca de agua solo si hay logo', () => {
    expect(construirHtmlContrato(venta)).not.toContain('<div class="marca-agua">'); // logo null
    const conLogo = construirHtmlContrato({ ...venta, sucursal: { ...venta.sucursal, logo: 'data:image/png;base64,AAAA' } });
    expect(conLogo).toContain('<div class="marca-agua">');
  });
  test('despliega las 17 casillas del VIN (una por carácter)', () => {
    const html = construirHtmlContrato(venta);
    const celdas = (html.match(/class="vin-celda"/g) || []).length;
    expect(celdas).toBe(17);
  });
  test('formatea el total como moneda', () => {
    const html = construirHtmlContrato(venta);
    expect(html).toMatch(/\$\s?150,000/);
  });
});
