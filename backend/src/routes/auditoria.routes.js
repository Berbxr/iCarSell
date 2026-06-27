const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/auditoria.controller');

const router = Router();
router.use(auth);
router.get('/', rbac('ADMIN'), ctrl.listar);
module.exports = router;
