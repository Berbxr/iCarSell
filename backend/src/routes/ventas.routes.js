const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/ventas.controller');

const router = Router();
router.use(auth);
router.get('/', ctrl.listar);
router.post('/contrato/borrador', ctrl.contratoBorrador);
router.get('/:id', ctrl.obtener);
router.get('/:id/contrato.pdf', ctrl.contratoPdf);
router.post('/', ctrl.crear);
router.post('/:id/cancelar', rbac('ADMIN'), ctrl.cancelar);
module.exports = router;
