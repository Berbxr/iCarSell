const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { ApiError } = require('../middlewares/error');

// Directorio raíz de archivos subidos (en Docker: /app/uploads, montado como volumen).
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
const VEHICULOS_SUBDIR = 'vehiculos';
const VEHICULOS_DIR = path.join(UPLOADS_DIR, VEHICULOS_SUBDIR);
fs.mkdirSync(VEHICULOS_DIR, { recursive: true });

const PREFIJO_URL = '/api/uploads/';
const LIMITE_ENTRADA = 16_000_000; // ~12 MB de imagen original en base64

// ¿Es una imagen embebida en base64 (subida nueva) y no una ruta ya almacenada?
function esDataUrl(s) {
  return typeof s === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(s);
}

// Convierte una referencia existente ("/api/uploads/vehiculos/x.jpg") a su ruta almacenada ("vehiculos/x.jpg").
function normalizarRef(s) {
  if (typeof s !== 'string') return null;
  let r = s;
  if (r.startsWith(PREFIJO_URL)) r = r.slice(PREFIJO_URL.length);
  return r.replace(/^\/+/, '');
}

// Comprime y redimensiona una imagen base64 a JPEG y la guarda; devuelve la ruta relativa almacenada.
async function guardarFotoComprimida(dataUrl) {
  if (!esDataUrl(dataUrl)) throw new ApiError(400, 'Imagen inválida');
  if (dataUrl.length > LIMITE_ENTRADA) throw new ApiError(400, 'La imagen es demasiado grande');
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const nombre = `${crypto.randomUUID()}.jpg`;
  await sharp(buf)
    .rotate() // respeta la orientación EXIF
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(path.join(VEHICULOS_DIR, nombre));
  return `${VEHICULOS_SUBDIR}/${nombre}`;
}

// Procesa una lista mixta (data URLs nuevas + rutas existentes) y devuelve las rutas almacenadas finales.
async function procesarEntradas(fotos) {
  const finales = [];
  for (const item of fotos) {
    if (esDataUrl(item)) finales.push(await guardarFotoComprimida(item));
    else { const r = normalizarRef(item); if (r) finales.push(r); }
  }
  return finales;
}

function eliminarArchivo(rutaRelativa) {
  if (!rutaRelativa || esDataUrl(rutaRelativa)) return Promise.resolve(); // las base64 antiguas no tienen archivo
  const abs = path.resolve(UPLOADS_DIR, rutaRelativa);
  if (!abs.startsWith(path.resolve(UPLOADS_DIR))) return Promise.resolve(); // seguridad: no salir del directorio
  return fs.promises.unlink(abs).catch(() => {});
}

module.exports = { UPLOADS_DIR, esDataUrl, normalizarRef, guardarFotoComprimida, procesarEntradas, eliminarArchivo };
