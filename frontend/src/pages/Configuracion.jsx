import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Configuracion() {
  const [form, setForm] = useState({ diasAntiguedadAlerta: 60, terminosContrato: '', tipoCambioDolar: 0 });
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [rangos, setRangos] = useState([]);
  const [okRangos, setOkRangos] = useState(false);
  const [errRangos, setErrRangos] = useState('');

  useEffect(() => { api.get('/configuracion').then((r) => setForm({ diasAntiguedadAlerta: r.data.diasAntiguedadAlerta, terminosContrato: r.data.terminosContrato || '', tipoCambioDolar: r.data.tipoCambioDolar || 0 })); }, []);
  useEffect(() => { api.get('/configuracion/comisiones').then((r) => setRangos(r.data.map((x) => ({ desdeUsd: x.desdeUsd, monto: x.monto })))); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function guardar(e) {
    e.preventDefault(); setError(''); setOk(false);
    try {
      await api.put('/configuracion', { diasAntiguedadAlerta: Number(form.diasAntiguedadAlerta), terminosContrato: form.terminosContrato, tipoCambioDolar: Number(form.tipoCambioDolar) });
      setOk(true);
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }

  function setRango(i, k, v) { setRangos((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r))); }
  function agregarRango() { setRangos((rs) => [...rs, { desdeUsd: 0, monto: 0 }]); }
  function quitarRango(i) { setRangos((rs) => rs.filter((_, idx) => idx !== i)); }

  async function guardarRangos(e) {
    e.preventDefault(); setErrRangos(''); setOkRangos(false);
    try {
      const payload = rangos.map((r) => ({ desdeUsd: Number(r.desdeUsd), monto: Number(r.monto) }));
      const r = await api.put('/configuracion/comisiones', { rangos: payload });
      setRangos(r.data.map((x) => ({ desdeUsd: x.desdeUsd, monto: x.monto })));
      setOkRangos(true);
    } catch (err) { setErrRangos(err.response?.data?.error || 'Error al guardar rangos'); }
  }

  return (
    <div>
      <h1>Configuración</h1>
      <div className="card">
        <form onSubmit={guardar} className="grid" style={{ maxWidth: 640 }}>
          <div>
            <label>Tipo de cambio del dólar (MXN por USD)</label>
            <input type="number" step="0.01" min="0" value={form.tipoCambioDolar} onChange={(e) => set('tipoCambioDolar', e.target.value)} style={{ maxWidth: 160 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Se usa para convertir las ganancias en dólares a pesos y se muestra en el encabezado.</p>
          </div>
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

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Rangos de comisión</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          La comisión (MXN) se asigna por venta según el precio de lista del auto (USD). Se aplica el rango de mayor "Desde (USD)" que sea menor o igual al precio.
        </p>
        <form onSubmit={guardarRangos}>
          <table>
            <thead><tr><th>Desde (USD)</th><th>Comisión (MXN)</th><th></th></tr></thead>
            <tbody>
              {rangos.map((r, i) => (
                <tr key={i}>
                  <td><input type="number" min="0" step="1" value={r.desdeUsd} onChange={(e) => setRango(i, 'desdeUsd', e.target.value)} style={{ maxWidth: 140 }} /></td>
                  <td><input type="number" min="0" step="1" value={r.monto} onChange={(e) => setRango(i, 'monto', e.target.value)} style={{ maxWidth: 140 }} /></td>
                  <td><button type="button" className="btn btn-sm" onClick={() => quitarRango(i)}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={agregarRango}>Agregar rango</button>
            <button type="submit" className="btn btn-primary">Guardar rangos</button>
          </div>
          {errRangos && <p className="error">{errRangos}</p>}
          {okRangos && <p style={{ color: 'var(--ok)' }}>Rangos guardados.</p>}
        </form>
      </div>
    </div>
  );
}
