const express = require('express');
const cors = require('cors');
const { manejadorErrores } = require('./middlewares/error');
const { UPLOADS_DIR } = require('./utils/fotosVehiculo');
const authRoutes = require('./routes/auth.routes');
const auditoriaRoutes = require('./routes/auditoria.routes');
const sucursalesRoutes = require('./routes/sucursales.routes');
const empleadosRoutes = require('./routes/empleados.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const clientesRoutes = require('./routes/clientes.routes');
const sociosRoutes = require('./routes/socios.routes');
const gastosRoutes = require('./routes/gastos.routes');
const vehiculosRoutes = require('./routes/vehiculos.routes');
const ventasRoutes = require('./routes/ventas.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const reportesRoutes = require('./routes/reportes.routes');
const configuracionRoutes = require('./routes/configuracion.routes');

function crearApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '30mb' })); // las fotos llegan en base64 y se comprimen en el servidor

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  // Fotos de vehículos servidas como archivos estáticos (públicas, para que <img> las cargue sin token).
  app.use('/api/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/auditoria', auditoriaRoutes);
  app.use('/api/sucursales', sucursalesRoutes);
  app.use('/api/empleados', empleadosRoutes);
  app.use('/api/usuarios', usuariosRoutes);
  app.use('/api/clientes', clientesRoutes);
  app.use('/api/socios', sociosRoutes);
  app.use('/api/gastos', gastosRoutes);
  app.use('/api/vehiculos', vehiculosRoutes);
  app.use('/api/ventas', ventasRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reportes', reportesRoutes);
  app.use('/api/configuracion', configuracionRoutes);

  app.use(manejadorErrores);
  return app;
}

module.exports = crearApp;
