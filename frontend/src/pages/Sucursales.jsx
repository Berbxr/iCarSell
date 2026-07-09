import { useEffect, useState } from 'react';
import api from '../api/client';
import SubidorImagenes from '../components/SubidorImagenes';

const VACIA = { nombre: '', nombreComercial: '', domicilio: '', colonia: '', codigoPostal: '', ciudadEstado: '', telefono: '', serieFolio: 'A', logo: null };

export default function Sucursales() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(VACIA);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  async function cargar() { const { data } = await api.get('/sucursales'); setLista(data); }
  useEffect(() => { cargar(); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function guardar(e) {
    e.preventDefault(); setError('');
    try {
      if (editId) await api.put(`/sucursales/${editId}`, form);
      else await api.post('/sucursales', form);
      setForm(VACIA); setEditId(null); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }
  function editar(s) { setEditId(s.id); setForm({ ...VACIA, ...s, logo: s.logo || null }); }

  async function cambiarEstado(s) {
    await api.patch(`/sucursales/${s.id}/estado`, { activo: !s.activo }); cargar();
  }

  return (
    <div>
      <h1>Sucursales</h1>
      <div className="card">
        <h3>{editId ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
        <form onSubmit={guardar} className="grid" style={{ maxWidth: 520 }}>
          <div><label>Nombre de la sucursal (interno)</label><input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. Santa Isabel" required /></div>
          <div><label>Nombre comercial (para el contrato)</label><input value={form.nombreComercial || ''} onChange={(e) => set('nombreComercial', e.target.value)} placeholder="Ej. EMPALME MOTORS" /></div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Domicilio</label><input value={form.domicilio || ''} onChange={(e) => set('domicilio', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>Colonia</label><input value={form.colonia || ''} onChange={(e) => set('colonia', e.target.value)} /></div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Código Postal</label><input value={form.codigoPostal || ''} onChange={(e) => set('codigoPostal', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>Ciudad/Estado</label><input value={form.ciudadEstado || ''} onChange={(e) => set('ciudadEstado', e.target.value)} /></div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Teléfono</label><input value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>Serie de folio</label><input value={form.serieFolio} onChange={(e) => set('serieFolio', e.target.value)} /></div>
          </div>
          <div><label>Logo (para el contrato)</label>
            <SubidorImagenes value={form.logo ? [form.logo] : []} max={1} onChange={(arr) => set('logo', arr[0] || null)} />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn btn-primary" type="submit">{editId ? 'Actualizar' : 'Crear'}</button>
            {editId && <button type="button" className="btn" onClick={() => { setEditId(null); setForm(VACIA); }}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div className="tabla-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Ciudad/Estado</th><th>Serie</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((s) => (
          <tr key={s.id}>
            <td data-label="Nombre">{s.nombre}</td><td data-label="Ciudad/Estado">{s.ciudadEstado}</td><td data-label="Serie">{s.serieFolio}</td>
            <td data-label="Estado">{s.activo ? 'Activa' : 'Inactiva'}</td>
            <td className="row">
              <button className="btn btn-sm" onClick={() => editar(s)}>Editar</button>
              <button className="btn btn-sm" onClick={() => cambiarEstado(s)}>{s.activo ? 'Desactivar' : 'Activar'}</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      </div>
    </div>
  );
}
