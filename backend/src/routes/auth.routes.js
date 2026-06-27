const { Router } = require('express');
const auth = require('../middlewares/auth');
const ctrl = require('../controllers/auth.controller');

const router = Router();
router.post('/login', ctrl.login);
router.get('/me', auth, ctrl.me);
router.post('/cambiar-password', auth, ctrl.cambiarPassword);
module.exports = router;
