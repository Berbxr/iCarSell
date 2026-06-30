import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Socios() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  async function cargar() { const { data } = await api.get('/socios'); setLista(data); }
  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault(); setError('');
    try { await api.post('/socios', { nombre }); setNombre(''); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al crear'); }
  }
  async function cambiarEstado(s) { await api.patch(`/socios/${s.id}/estado`, { activo: !s.activo }); cargar(); }

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
      <table>
        <thead><tr><th>Socio</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((s) => (
          <tr key={s.id}>
            <td>{s.nombre}</td>
            <td>{s.activo ? 'Activo' : 'Inactivo'}</td>
            <td><button className="btn btn-sm" onClick={() => cambiarEstado(s)}>{s.activo ? 'Desactivar' : 'Activar'}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
