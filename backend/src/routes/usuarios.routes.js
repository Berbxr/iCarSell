const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/usuarios.controller');

const router = Router();
router.use(auth, rbac('ADMIN'));
router.get('/', ctrl.listar);
router.post('/', ctrl.crear);
router.patch('/:id/estado', ctrl.cambiarEstado);
router.post('/:id/reset-password', ctrl.resetPassword);
module.exports = router;
