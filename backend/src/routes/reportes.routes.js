const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/reportes.controller');

const router = Router();
router.use(auth);
router.get('/ventas', ctrl.ventas);
router.get('/inventario', ctrl.inventario);
router.get('/comisiones', rbac('ADMIN'), ctrl.comisiones);
router.get('/socios', rbac('ADMIN'), ctrl.socios);
module.exports = router;
