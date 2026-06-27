const { Router } = require('express');
const auth = require('../middlewares/auth');
const ctrl = require('../controllers/reportes.controller');

const router = Router();
router.use(auth);
router.get('/ventas', ctrl.ventas);
router.get('/inventario', ctrl.inventario);
module.exports = router;
