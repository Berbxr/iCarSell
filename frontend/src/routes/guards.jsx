import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function RequireAuth({ children }) {
  const { usuario } = useAuth();
  const location = useLocation();
  if (!usuario) return <Navigate to="/login" state={{ from: location }} replace />;
  if (usuario.debeCambiarPassword && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }
  return children;
}

export function RequireRol({ roles, children }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (!roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return children;
}
