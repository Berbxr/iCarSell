import { useEffect, useState } from 'react';
import api from '../api/client';
import { useBranding } from '../context/BrandingContext';

export default function Configuracion() {
  const { recargar: recargarBranding } = useBranding();
  const [form, setForm] = useState({ diasAntiguedadAlerta: 60, terminosContrato: '', tipoCambioDolar: 0 });
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [rangos, setRangos] = useState([]);
  const [okRangos, setOkRangos] = useState(false);
  const [errRangos, setErrRangos] = useState('');
  const [marca, setMarca] = useState({ nombreNegocio: '', logo: null });
  const [okMarca, setOkMarca] = useState(false);
  const [errMarca, setErrMarca] = useState('');

  useEffect(() => { api.get('/configuracion').then((r) => setForm({ diasAntiguedadAlerta: r.data.diasAntiguedadAlerta, terminosContrato: r.data.terminosContrato || '', tipoCambioDolar: r.data.tipoCambioDolar || 0 })); }, []);
  useEffect(() => { api.get('/configuracion/comisiones').then((r) => setRangos(r.data.map((x) => ({ desdeUsd: x.desdeUsd, monto: x.monto })))); }, []);
  useEffect(() => { api.get('/configuracion/branding').then((r) => setMarca({ nombreNegocio: r.data.nombre || '', logo: r.data.logo || null })); }, []);

  function elegirLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMarca((m) => ({ ...m, logo: reader.result }));
    reader.readAsDataURL(file);
  }

  async function guardarMarca(e) {
    e.preventDefault(); setErrMarca(''); setOkMarca(false);
    try {
      await api.put('/configuracion', { nombreNegocio: marca.nombreNegocio, logo: marca.logo });
      setOkMarca(true);
      recargarBranding();
    } catch (err) { setErrMarca(err.response?.data?.error || 'Error al guardar la marca'); }
  }

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
        <h2>Identidad / Marca</h2>
        <form onSubmit={guardarMarca} className="grid" style={{ maxWidth: 640 }}>
          <div>
            <label>Nombre del negocio</label>
            <input value={marca.nombreNegocio} onChange={(e) => setMarca((m) => ({ ...m, nombreNegocio: e.target.value }))} required style={{ maxWidth: 320 }} />
          </div>
          <div>
            <label>Logo (preferencia SVG)</label>
            <div className="row" style={{ alignItems: 'center' }}>
              <img src={marca.logo || '/logo.svg'} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', background: '#0f172a', borderRadius: 8, padding: 4 }} />
              <input type="file" accept="image/svg+xml,image/*" onChange={elegirLogo} style={{ maxWidth: 280 }} />
              {marca.logo && <button type="button" className="btn btn-sm" onClick={() => setMarca((m) => ({ ...m, logo: null }))}>Quitar logo</button>}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aparece en el menú lateral, el login y como ícono de la pestaña. Sin logo se usa el predeterminado.</p>
          </div>
          {errMarca && <p className="error">{errMarca}</p>}
          {okMarca && <p style={{ color: 'var(--ok)' }}>Marca guardada.</p>}
          <div><button className="btn btn-primary" type="submit">Guardar marca</button></div>
        </form>
      </div>

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
