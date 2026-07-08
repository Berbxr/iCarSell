const { Router } = require('express');
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const ctrl = require('../controllers/vehiculos.controller');

const router = Router();
router.use(auth);
router.get('/', ctrl.listar);
router.get('/vin-existe', ctrl.vinExiste);
router.get('/:id', ctrl.obtener);
router.post('/', rbac('ADMIN', 'ALMACEN'), ctrl.crear);
router.put('/:id', rbac('ADMIN', 'ALMACEN'), ctrl.actualizar);
router.patch('/:id/estado', ctrl.cambiarEstado);
router.post('/:id/gastos', rbac('ADMIN', 'ALMACEN'), ctrl.agregarGasto);
router.delete('/:id/gastos/:gastoId', rbac('ADMIN', 'ALMACEN'), ctrl.eliminarGasto);
router.put('/:id/pasar-a-venta', rbac('ADMIN', 'ALMACEN'), ctrl.pasarAVenta);
module.exports = router;
