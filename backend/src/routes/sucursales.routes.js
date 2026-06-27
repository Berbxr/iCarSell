const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/sucursales.controller');

const router = Router();
router.use(auth);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', rbac('ADMIN'), ctrl.crear);
router.put('/:id', rbac('ADMIN'), ctrl.actualizar);
router.patch('/:id/estado', rbac('ADMIN'), ctrl.cambiarEstado);
module.exports = router;
