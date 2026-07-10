import { useEffect, useState } from 'react';
import api from '../api/client';

const VACIO = { categoria: '', descripcion: '', monto: '' };
const SUGERENCIAS = ['Insumos', 'Pago empleados', 'Renta', 'Servicios', 'Otro'];

export default function Gastos() {
  const [data, setData] = useState({ gastos: [], total: 0, porCategoria: {} });
  const [form, setForm] = useState(VACIO);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    const { data } = await api.get(`/gastos?${p.toString()}`);
    setData(data);
  }
  useEffect(() => { cargar(); }, [desde, hasta]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  async function crear(e) {
    e.preventDefault(); setError('');
    try { await api.post('/gastos', { ...form, monto: Number(form.monto) }); setForm(VACIO); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }
  async function eliminar(g) { await api.delete(`/gastos/${g.id}`); cargar(); }

  return (
    <div>
      <h1>Gastos generales (MXN)</h1>
      <div className="card">
        <h3>Nuevo gasto</h3>
        <form onSubmit={crear} className="row">
          <input list="cats" placeholder="Categoría" value={form.categoria} onChange={(e) => set('categoria', e.target.value)} required />
          <datalist id="cats">{SUGERENCIAS.map((c) => <option key={c} value={c} />)}</datalist>
          <input placeholder="Descripción" value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} required />
          <input type="number" placeholder="Monto" value={form.monto} onChange={(e) => set('monto', e.target.value)} required style={{ maxWidth: 140 }} />
          <button className="btn btn-primary" type="submit">Agregar</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>

      <div className="kpis">
        <div className="kpi"><h3>Total gastos</h3><div className="valor">${data.total.toLocaleString('es-MX')}</div></div>
        {Object.entries(data.porCategoria).map(([cat, m]) => (
          <div className="kpi" key={cat}><h3>{cat}</h3><div className="valor">${m.toLocaleString('es-MX')}</div></div>
        ))}
      </div>

      <div className="tabla-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th></th></tr></thead>
        <tbody>{data.gastos.map((g) => (
          <tr key={g.id}>
            <td data-label="Fecha">{new Date(g.fecha).toLocaleDateString('es-MX')}</td>
            <td data-label="Categoría">{g.categoria}</td><td data-label="Descripción">{g.descripcion}</td>
            <td data-label="Monto">${Number(g.monto).toLocaleString('es-MX')}</td>
            <td><button className="btn btn-sm" onClick={() => eliminar(g)}>Eliminar</button></td>
          </tr>
        ))}</tbody>
      </table>
      </div>
    </div>
  );
}
