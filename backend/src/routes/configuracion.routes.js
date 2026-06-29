const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/configuracion.controller');

const router = Router();
router.use(auth);
router.get('/', ctrl.obtener);
router.put('/', rbac('ADMIN'), ctrl.actualizar);
router.get('/comisiones', ctrl.obtenerComisiones);
router.put('/comisiones', rbac('ADMIN'), ctrl.actualizarComisiones);
module.exports = router;
