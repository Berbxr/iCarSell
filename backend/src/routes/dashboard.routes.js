const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/dashboard.controller');

const router = Router();
router.use(auth);
// El dashboard con cifras de ventas es solo para ADMIN; el vendedor ve una bienvenida en el frontend.
router.get('/', rbac('ADMIN'), ctrl.obtener);
module.exports = router;
