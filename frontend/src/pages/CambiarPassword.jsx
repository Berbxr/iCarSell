import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function CambiarPassword() {
  const { usuario, marcarPasswordCambiada } = useAuth();
  const navigate = useNavigate();
  const [passwordActual, setActual] = useState('');
  const [passwordNueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (passwordNueva !== confirmar) return setError('Las contraseñas no coinciden');
    try {
      await api.post('/auth/cambiar-password', { passwordActual, passwordNueva });
      marcarPasswordCambiada();
      setOk(true);
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la contraseña');
    }
  }

  return (
    <div>
      <h1>Cambiar contraseña</h1>
      {usuario?.debeCambiarPassword && (
        <p style={{ color: 'var(--primary)' }}>Debes cambiar tu contraseña temporal antes de continuar.</p>
      )}
      <div className="card">
        <form onSubmit={onSubmit} className="grid" style={{ maxWidth: 420 }}>
          <div><label>Contraseña actual</label><input type="password" value={passwordActual} onChange={(e) => setActual(e.target.value)} required /></div>
          <div><label>Nueva contraseña</label><input type="password" value={passwordNueva} onChange={(e) => setNueva(e.target.value)} required /></div>
          <div><label>Confirmar nueva contraseña</label><input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required /></div>
          {error && <p className="error">{error}</p>}
          {ok && <p style={{ color: 'var(--ok)' }}>Contraseña actualizada.</p>}
          <div><button className="btn btn-primary" type="submit">Guardar</button></div>
        </form>
      </div>
    </div>
  );
}
