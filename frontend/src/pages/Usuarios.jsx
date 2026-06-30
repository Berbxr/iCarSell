import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';

const VACIO = { username: '', password: '', rol: 'VENDEDOR', empleadoId: '' };

export default function Usuarios() {
  const [lista, setLista] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState(undefined);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');

  const empleadosFiltrados = sucursalFiltro
    ? empleados.filter((em) => em.sucursalId === sucursalFiltro)
    : empleados;

  async function cargar() {
    const [u, e] = await Promise.all([api.get('/usuarios'), api.get('/empleados')]);
    setLista(u.data); setEmpleados(e.data);
  }
  useEffect(() => { cargar(); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function crear(e) {
    e.preventDefault(); setError('');
    try {
      const payload = { ...form, empleadoId: form.empleadoId ? Number(form.empleadoId) : null };
      await api.post('/usuarios', payload);
      setForm(VACIO); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear'); }
  }
  async function cambiarEstado(u) { await api.patch(`/usuarios/${u.id}/estado`, { activo: !u.activo }); cargar(); }
  async function resetPassword(u) {
    const password = window.prompt(`Nueva contraseña para ${u.username} (mín. 6 caracteres):`);
    if (!password) return;
    try { await api.post(`/usuarios/${u.id}/reset-password`, { password }); window.alert('Contraseña restablecida.'); }
    catch (err) { window.alert(err.response?.data?.error || 'Error'); }
  }

  return (
    <div>
      <h1>Usuarios</h1>
      <div className="card">
        <h3>Nuevo usuario</h3>
        <form onSubmit={crear} className="grid" style={{ maxWidth: 520 }}>
          <div className="row">
            <div style={{ flex: 1 }}><label>Usuario</label><input value={form.username} onChange={(e) => set('username', e.target.value)} required /></div>
            <div style={{ flex: 1 }}><label>Contraseña</label><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required /></div>
          </div>
          <div><label>Rol</label>
            <select value={form.rol} onChange={(e) => set('rol', e.target.value)} style={{ maxWidth: 240 }}>
              <option value="VENDEDOR">Vendedor</option>
              <option value="ALMACEN">Almacén</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Sucursal</label>
              <SelectorSucursal value={sucursalFiltro} onChange={(v) => { setSucursalFiltro(v); set('empleadoId', ''); }} incluirTodas />
            </div>
            <div style={{ flex: 1 }}><label>Empleado vinculado</label>
              <select value={form.empleadoId} onChange={(e) => set('empleadoId', e.target.value)}>
                <option value="">— Sin empleado —</option>
                {empleadosFiltrados.map((em) => <option key={em.id} value={em.id}>{em.nombre} {em.apellidos} ({em.sucursal?.nombre})</option>)}
              </select>
            </div>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            La sucursal del usuario se toma del empleado vinculado. Elige una sucursal para filtrar sus empleados.
            Un administrador puede quedar sin empleado (acceso a todas las sucursales).
          </p>
          {error && <p className="error">{error}</p>}
          <div><button className="btn btn-primary" type="submit">Crear usuario</button></div>
        </form>
      </div>

      <table>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Empleado</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((u) => (
          <tr key={u.id}>
            <td>{u.username}</td><td>{u.rol}</td>
            <td>{u.empleado ? `${u.empleado.nombre} ${u.empleado.apellidos}` : '—'}</td>
            <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
            <td className="row">
              <button className="btn btn-sm" onClick={() => cambiarEstado(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>
              <button className="btn btn-sm" onClick={() => resetPassword(u)}>Restablecer</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
