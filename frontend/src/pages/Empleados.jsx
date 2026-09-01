import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';
import { useAuth } from '../context/AuthContext';

const VACIO = { nombre: '', apellidos: '', telefono: '', email: '', puesto: 'Vendedor', sucursalId: undefined };

export default function Empleados() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  async function cargar() { const { data } = await api.get('/empleados'); setLista(data); }
  useEffect(() => { cargar(); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function guardar(e) {
    e.preventDefault(); setError('');
    try {
      const payload = { ...form };
      if (usuario.rol !== 'ADMIN') delete payload.sucursalId;
      if (editId) await api.put(`/empleados/${editId}`, payload);
      else await api.post('/empleados', payload);
      setForm(VACIO); setEditId(null); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }
  function editar(em) { setEditId(em.id); setForm({ ...VACIO, ...em }); }
  async function cambiarEstado(em) { await api.patch(`/empleados/${em.id}/estado`, { activo: !em.activo }); cargar(); }

  return (
    <div>
      <h1>Empleados</h1>
      <div className="card">
        <h3>{editId ? 'Editar empleado' : 'Nuevo empleado'}</h3>
        <form onSubmit={guardar} className="grid" style={{ maxWidth: 520 }}>
          <div className="row">
            <div style={{ flex: 1 }}><label>Nombre</label><input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} required /></div>
            <div style={{ flex: 1 }}><label>Apellidos</label><input value={form.apellidos} onChange={(e) => set('apellidos', e.target.value)} required /></div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Teléfono</label><input value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label>Email</label><input value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Puesto</label><input value={form.puesto} onChange={(e) => set('puesto', e.target.value)} required /></div>
            {usuario.rol === 'ADMIN' && (
              <div style={{ flex: 1 }}><label>Sucursal</label>
                <SelectorSucursal value={form.sucursalId} onChange={(v) => set('sucursalId', v)} />
              </div>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn btn-primary" type="submit">{editId ? 'Actualizar' : 'Crear'}</button>
            {editId && <button type="button" className="btn" onClick={() => { setEditId(null); setForm(VACIO); }}>Cancelar</button>}
          </div>
        </form>
      </div>

      <div className="tabla-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Puesto</th><th>Sucursal</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((em) => (
          <tr key={em.id}>
            <td data-label="Nombre">{em.nombre} {em.apellidos}</td><td data-label="Puesto">{em.puesto}</td><td data-label="Sucursal">{em.sucursal?.nombre}</td>
            <td data-label="Estado">{em.activo ? 'Activo' : 'Inactivo'}</td>
            <td className="row">
              <button className="btn btn-sm" onClick={() => editar(em)}>Editar</button>
              <button className="btn btn-sm" onClick={() => cambiarEstado(em)}>{em.activo ? 'Desactivar' : 'Activar'}</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      </div>
    </div>
  );
}
