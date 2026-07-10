import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import api from '../api/client';

const GRUPOS = [
  { label: null, items: [{ to: '/dashboard', label: 'Dashboard', roles: ['ADMIN', 'VENDEDOR'] }] },
  { label: 'Operación', items: [
    { to: '/ventas', label: 'Ventas', roles: ['ADMIN', 'VENDEDOR'] },
    { to: '/compra', label: 'Inventario de compra', roles: ['ADMIN', 'ALMACEN'] },
    { to: '/inventario', label: 'Inventario de venta', roles: ['ADMIN', 'VENDEDOR', 'ALMACEN'] },
    { to: '/clientes', label: 'Clientes', roles: ['ADMIN', 'VENDEDOR'] },
  ] },
  { label: 'Administración', items: [
    { to: '/reportes', label: 'Reportes', roles: ['ADMIN'] },
    { to: '/comisiones', label: 'Comisiones', roles: ['ADMIN'] },
    { to: '/socios', label: 'Socios', roles: ['ADMIN'] },
    { to: '/gastos', label: 'Gastos', roles: ['ADMIN'] },
    { to: '/empleados', label: 'Empleados', roles: ['ADMIN'] },
    { to: '/sucursales', label: 'Sucursales', roles: ['ADMIN'] },
    { to: '/usuarios', label: 'Usuarios', roles: ['ADMIN'] },
    { to: '/configuracion', label: 'Configuración', roles: ['ADMIN'] },
    { to: '/auditoria', label: 'Auditoría', roles: ['ADMIN'] },
  ] },
  { label: 'Cuenta', items: [
    { to: '/cambiar-password', label: 'Mi contraseña', roles: ['ADMIN', 'VENDEDOR'] },
  ] },
];

export default function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const { nombre, logo } = useBranding();
  const navigate = useNavigate();
  const rol = usuario?.rol;
  const [tc, setTc] = useState(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEffect(() => { api.get('/configuracion').then((r) => setTc(r.data.tipoCambioDolar)).catch(() => {}); }, []);

  // Cerrar el cajón con la tecla Escape.
  useEffect(() => {
    if (!menuAbierto) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuAbierto(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuAbierto]);

  function salir() { logout(); navigate('/login'); }

  return (
    <div className="app">
      {menuAbierto && <button className="nav-overlay" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} />}
      <aside className={`sidebar${menuAbierto ? ' abierto' : ''}`}>
        <div className="brand">
          <img src={logo || '/logo.svg'} alt={nombre} className="brand-logo" />
          <div className="brand-name">{nombre}</div>
        </div>
        <nav className="nav">
          {GRUPOS.map((g, gi) => {
            const items = g.items.filter((it) => it.roles.includes(rol));
            if (!items.length) return null;
            return (
              <div key={gi}>
                {g.label && <div className="nav-group-label">{g.label}</div>}
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} onClick={() => setMenuAbierto(false)} className={({ isActive }) => (isActive ? 'active' : '')}>{it.label}</NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{usuario?.username}<span>{rol}</span></div>
          <button className="sidebar-logout" onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}>☰</button>
          <div className="tc-header">Dólar: {tc ? `$${Number(tc).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN` : 'sin configurar'}</div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
