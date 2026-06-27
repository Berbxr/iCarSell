import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const u = await login(username, password);
      navigate(u.debeCambiarPassword ? '/cambiar-password' : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión');
    } finally { setCargando(false); }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="marca">iCar<span>Sell</span></div>
        <p className="sub">Gestión de venta de autos</p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Usuario</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={cargando} style={{ width: '100%' }}>
            {cargando ? 'Entrando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
