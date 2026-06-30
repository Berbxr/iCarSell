const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/socios.controller');

const router = Router();
router.use(auth);
router.get('/', rbac('ADMIN', 'ALMACEN'), ctrl.listar);
router.post('/', rbac('ADMIN'), ctrl.crear);
router.put('/:id', rbac('ADMIN'), ctrl.actualizar);
router.patch('/:id/estado', rbac('ADMIN'), ctrl.cambiarEstado);
module.exports = router;
