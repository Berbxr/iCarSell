const { Router } = require('express');
const auth = require('../middlewares/auth');
const ctrl = require('../controllers/ventas.controller');

const router = Router();
router.use(auth);
router.get('/', ctrl.listar);
router.post('/contrato/borrador', ctrl.contratoBorrador);
router.get('/:id', ctrl.obtener);
router.get('/:id/contrato.pdf', ctrl.contratoPdf);
router.post('/', ctrl.crear);
module.exports = router;
