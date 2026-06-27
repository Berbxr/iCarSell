const { Router } = require('express');
const auth = require('../middlewares/auth');
const ctrl = require('../controllers/clientes.controller');

const router = Router();
router.use(auth);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
module.exports = router;
