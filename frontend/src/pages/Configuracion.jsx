import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Configuracion() {
  const [form, setForm] = useState({ diasAntiguedadAlerta: 60, terminosContrato: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => { api.get('/configuracion').then((r) => setForm({ diasAntiguedadAlerta: r.data.diasAntiguedadAlerta, terminosContrato: r.data.terminosContrato || '' })); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function guardar(e) {
    e.preventDefault(); setError(''); setOk(false);
    try {
      await api.put('/configuracion', { diasAntiguedadAlerta: Number(form.diasAntiguedadAlerta), terminosContrato: form.terminosContrato });
      setOk(true);
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }

  return (
    <div>
      <h1>Configuración</h1>
      <div className="card">
        <form onSubmit={guardar} className="grid" style={{ maxWidth: 640 }}>
          <div>
            <label>Días de antigüedad para alerta de inventario</label>
            <input type="number" min="1" value={form.diasAntiguedadAlerta} onChange={(e) => set('diasAntiguedadAlerta', e.target.value)} style={{ maxWidth: 160 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Los autos disponibles que superen estos días se marcan en alerta en el dashboard y reportes.</p>
          </div>
          <div>
            <label>Términos y condiciones del contrato</label>
            <textarea rows={6} value={form.terminosContrato} onChange={(e) => set('terminosContrato', e.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          {ok && <p style={{ color: 'var(--ok)' }}>Configuración guardada.</p>}
          <div><button className="btn btn-primary" type="submit">Guardar</button></div>
        </form>
      </div>
    </div>
  );
}
