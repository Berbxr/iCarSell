import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Socios() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');

  async function cargar() { const { data } = await api.get('/socios'); setLista(data); }
  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault(); setError('');
    try { await api.post('/socios', { nombre }); setNombre(''); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al crear'); }
  }
  async function cambiarEstado(s) { await api.patch(`/socios/${s.id}/estado`, { activo: !s.activo }); cargar(); }

  function iniciarEdicion(s) { setEditId(s.id); setEditNombre(s.nombre); setError(''); }
  function cancelarEdicion() { setEditId(null); setEditNombre(''); }
  async function guardarEdicion(id) {
    setError('');
    try { await api.put(`/socios/${id}`, { nombre: editNombre }); cancelarEdicion(); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al editar'); }
  }

  return (
    <div>
      <h1>Socios</h1>
      <div className="card">
        <h3>Nuevo socio</h3>
        <form onSubmit={crear} className="row">
          <input placeholder="Nombre del socio" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <button className="btn btn-primary" type="submit">Agregar</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="tabla-wrap">
      <table>
        <thead><tr><th>Socio</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((s) => (
          <tr key={s.id}>
            <td data-label="Socio">
              {editId === s.id
                ? <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} style={{ maxWidth: 240 }} />
                : s.nombre}
            </td>
            <td data-label="Estado">{s.activo ? 'Activo' : 'Inactivo'}</td>
            <td className="row">
              {editId === s.id ? (
                <>
                  <button className="btn btn-sm btn-primary" onClick={() => guardarEdicion(s.id)}>Guardar</button>
                  <button className="btn btn-sm" onClick={cancelarEdicion}>Cancelar</button>
                </>
              ) : (
                <>
                  <button className="btn btn-sm" onClick={() => iniciarEdicion(s)}>Editar</button>
                  <button className="btn btn-sm" onClick={() => cambiarEstado(s)}>{s.activo ? 'Desactivar' : 'Activar'}</button>
                </>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table>
      </div>
    </div>
  );
}
