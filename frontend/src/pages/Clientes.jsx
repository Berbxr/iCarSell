import { useEffect, useState } from 'react';
import api from '../api/client';

const VACIO = { nombre: '', domicilio: '', colonia: '', codigoPostal: '', ciudadEstado: '', telefono: '' };

export default function Clientes() {
  const [lista, setLista] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  async function cargar() {
    const q = buscar ? `?buscar=${encodeURIComponent(buscar)}` : '';
    const { data } = await api.get(`/clientes${q}`); setLista(data);
  }
  useEffect(() => { cargar(); }, [buscar]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function guardar(e) {
    e.preventDefault(); setError('');
    try {
      if (editId) await api.put(`/clientes/${editId}`, form);
      else await api.post('/clientes', form);
      setForm(VACIO); setEditId(null); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }
  function editar(c) { setEditId(c.id); setForm({ ...VACIO, ...c }); }

  return (
    <div>
      <h1>Clientes</h1>
      <div className="card">
        <h3>{editId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
        <form onSubmit={guardar} className="grid" style={{ maxWidth: 520 }}>
          <div><label>Nombre</label><input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} required /></div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Domicilio</label><input value={form.domicilio || ''} onChange={(e) => set('domicilio', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>Colonia</label><input value={form.colonia || ''} onChange={(e) => set('colonia', e.target.value)} /></div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Código Postal</label><input value={form.codigoPostal || ''} onChange={(e) => set('codigoPostal', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>Ciudad/Estado</label><input value={form.ciudadEstado || ''} onChange={(e) => set('ciudadEstado', e.target.value)} /></div>
          </div>
          <div><label>Teléfono</label><input value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} /></div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn btn-primary" type="submit">{editId ? 'Actualizar' : 'Crear'}</button>
            {editId && <button type="button" className="btn" onClick={() => { setEditId(null); setForm(VACIO); }}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Buscar por nombre…" value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ maxWidth: 280 }} />
      </div>
      <div className="tabla-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Ciudad/Estado</th><th>Teléfono</th><th></th></tr></thead>
        <tbody>{lista.map((c) => (
          <tr key={c.id}>
            <td data-label="Nombre">{c.nombre}</td><td data-label="Ciudad/Estado">{c.ciudadEstado}</td><td data-label="Teléfono">{c.telefono}</td>
            <td><button className="btn btn-sm" onClick={() => editar(c)}>Editar</button></td>
          </tr>
        ))}</tbody>
      </table>
      </div>
    </div>
  );
}
