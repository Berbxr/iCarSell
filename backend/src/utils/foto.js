const { ApiError } = require('../middlewares/error');
const LIMITE = 700000; // ~500 KB en base64

function validarFoto(foto) {
  if (foto === undefined) return undefined;
  if (foto === null || foto === '') return null;
  if (typeof foto !== 'string' || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(foto)) {
    throw new ApiError(400, 'Imagen inválida');
  }
  if (foto.length > LIMITE) throw new ApiError(400, 'La imagen es demasiado grande');
  return foto;
}

module.exports = { validarFoto };
