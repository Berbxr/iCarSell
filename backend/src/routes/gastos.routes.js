const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/gastos.controller');

const router = Router();
router.use(auth);
router.get('/', rbac('ADMIN'), ctrl.listar);
router.post('/', rbac('ADMIN'), ctrl.crear);
router.delete('/:id', rbac('ADMIN'), ctrl.eliminar);
module.exports = router;
