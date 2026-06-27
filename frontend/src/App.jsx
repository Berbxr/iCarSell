import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireRol } from './routes/guards';
import Layout from './components/Layout';
import Login from './pages/Login';
import CambiarPassword from './pages/CambiarPassword';
import Dashboard from './pages/Dashboard';
import Ventas from './pages/Ventas';
import Inventario from './pages/Inventario';
import Clientes from './pages/Clientes';
import Reportes from './pages/Reportes';
import Empleados from './pages/Empleados';
import Sucursales from './pages/Sucursales';
import Usuarios from './pages/Usuarios';
import Configuracion from './pages/Configuracion';
import Auditoria from './pages/Auditoria';

function Privada({ children }) { return <RequireAuth><Layout>{children}</Layout></RequireAuth>; }
const SOLO_ADMIN = ['ADMIN'];
const AMBOS = ['ADMIN', 'VENDEDOR'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cambiar-password" element={<RequireAuth><Layout><CambiarPassword /></Layout></RequireAuth>} />
      <Route path="/dashboard" element={<Privada><RequireRol roles={AMBOS}><Dashboard /></RequireRol></Privada>} />
      <Route path="/ventas" element={<Privada><RequireRol roles={AMBOS}><Ventas /></RequireRol></Privada>} />
      <Route path="/inventario" element={<Privada><RequireRol roles={AMBOS}><Inventario /></RequireRol></Privada>} />
      <Route path="/clientes" element={<Privada><RequireRol roles={AMBOS}><Clientes /></RequireRol></Privada>} />
      <Route path="/reportes" element={<Privada><RequireRol roles={SOLO_ADMIN}><Reportes /></RequireRol></Privada>} />
      <Route path="/empleados" element={<Privada><RequireRol roles={SOLO_ADMIN}><Empleados /></RequireRol></Privada>} />
      <Route path="/sucursales" element={<Privada><RequireRol roles={SOLO_ADMIN}><Sucursales /></RequireRol></Privada>} />
      <Route path="/usuarios" element={<Privada><RequireRol roles={SOLO_ADMIN}><Usuarios /></RequireRol></Privada>} />
      <Route path="/configuracion" element={<Privada><RequireRol roles={SOLO_ADMIN}><Configuracion /></RequireRol></Privada>} />
      <Route path="/auditoria" element={<Privada><RequireRol roles={SOLO_ADMIN}><Auditoria /></RequireRol></Privada>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
