const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { esDataUrl, normalizarRef, guardarFotoComprimida, eliminarArchivo, UPLOADS_DIR } = require('../src/utils/fotosVehiculo');

describe('fotosVehiculo', () => {
  test('esDataUrl distingue base64 de rutas', () => {
    expect(esDataUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(esDataUrl('vehiculos/x.jpg')).toBe(false);
    expect(esDataUrl('/api/uploads/vehiculos/x.jpg')).toBe(false);
  });

  test('normalizarRef quita el prefijo de URL', () => {
    expect(normalizarRef('/api/uploads/vehiculos/x.jpg')).toBe('vehiculos/x.jpg');
    expect(normalizarRef('vehiculos/y.jpg')).toBe('vehiculos/y.jpg');
  });

  test('guardarFotoComprimida escribe un JPG comprimido y devuelve su ruta', async () => {
    // Imagen PNG grande generada al vuelo (2000x2000), para comprobar que se redimensiona/comprime.
    const png = await sharp({ create: { width: 2000, height: 2000, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
    const dataUrl = 'data:image/png;base64,' + png.toString('base64');

    const ruta = await guardarFotoComprimida(dataUrl);
    expect(ruta).toMatch(/^vehiculos\/[\w-]+\.jpg$/);

    const abs = path.join(UPLOADS_DIR, ruta);
    expect(fs.existsSync(abs)).toBe(true);

    // Debe quedar redimensionada a 1280 de lado máximo y mucho más liviana que el PNG original.
    const meta = await sharp(abs).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1280);
    expect(fs.statSync(abs).size).toBeLessThan(png.length);

    await eliminarArchivo(ruta);
    expect(fs.existsSync(abs)).toBe(false);
  });

  test('guardarFotoComprimida rechaza entradas que no son imagen', async () => {
    await expect(guardarFotoComprimida('vehiculos/x.jpg')).rejects.toThrow();
  });
});
