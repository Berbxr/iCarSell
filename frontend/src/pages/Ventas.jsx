import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';
import { useAuth } from '../context/AuthContext';

const CLIENTE_VACIO = { nombre: '', domicilio: '', colonia: '', codigoPostal: '', ciudadEstado: '', telefono: '' };

export default function Ventas() {
  const { usuario } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);

  // Estado del formulario de nueva venta
  const [sucursalId, setSucursalId] = useState(undefined);
  const [vehiculos, setVehiculos] = useState([]);
  const [vehiculoId, setVehiculoId] = useState('');
  const [empleados, setEmpleados] = useState([]);
  const [empleadoId, setEmpleadoId] = useState('');
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [cliente, setCliente] = useState(CLIENTE_VACIO);
  const [total, setTotal] = useState('');
  const [observaciones, setObservaciones] = useState('SIN GARANTÍA');
  const [error, setError] = useState('');

  async function cargarVentas() { const { data } = await api.get('/ventas'); setVentas(data); }
  useEffect(() => { cargarVentas(); }, []);

  // Cargar vehículos disponibles (y empleados si ADMIN) según sucursal seleccionada
  useEffect(() => {
    if (!mostrarForm) return;
    const q = sucursalId ? `&sucursalId=${sucursalId}` : '';
    api.get(`/vehiculos?estado=DISPONIBLE${q}`).then((r) => setVehiculos(r.data));
    if (usuario.rol === 'ADMIN') api.get(`/empleados${sucursalId ? `?sucursalId=${sucursalId}` : ''}`).then((r) => setEmpleados(r.data));
  }, [mostrarForm, sucursalId, usuario.rol]);

  useEffect(() => { if (mostrarForm) api.get('/clientes').then((r) => setClientes(r.data)); }, [mostrarForm]);

  function elegirVehiculo(id) {
    setVehiculoId(id);
    const v = vehiculos.find((x) => x.id === Number(id));
    if (v) setTotal(String(v.precioVenta || ''));
  }

  function reset() {
    setMostrarForm(false); setVehiculoId(''); setClienteId(''); setNuevoCliente(false);
    setCliente(CLIENTE_VACIO); setTotal(''); setObservaciones('SIN GARANTÍA'); setEmpleadoId(''); setError('');
  }

  async function registrar(e) {
    e.preventDefault(); setError('');
    try {
      let cid = clienteId;
      if (nuevoCliente) {
        const { data } = await api.post('/clientes', cliente);
        cid = data.id;
      }
      if (!cid) throw new Error('Selecciona o crea un cliente');
      const payload = { vehiculoId: Number(vehiculoId), clienteId: Number(cid), total: Number(total), observaciones };
      if (usuario.rol === 'ADMIN') { payload.sucursalId = sucursalId; payload.empleadoId = Number(empleadoId); }
      const { data: venta } = await api.post('/ventas', payload);
      reset(); cargarVentas();
      if (window.confirm(`Venta ${venta.folio} registrada. ¿Abrir el contrato PDF?`)) verContrato(venta.id);
    } catch (err) { setError(err.response?.data?.error || err.message || 'Error al registrar la venta'); }
  }

  async function verContrato(id) {
    const { data } = await api.get(`/ventas/${id}/contrato.pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    window.open(url, '_blank');
  }

  // Genera un borrador imprimible del contrato con los datos actuales, sin registrar la venta.
  async function verBorrador() {
    setError('');
    try {
      if (!vehiculoId) throw new Error('Selecciona un vehículo para ver el borrador');
      if (usuario.rol === 'ADMIN' && !sucursalId) throw new Error('Selecciona una sucursal');
      const payload = { vehiculoId: Number(vehiculoId), total: Number(total) || 0, observaciones };
      if (usuario.rol === 'ADMIN') payload.sucursalId = sucursalId;
      if (nuevoCliente) payload.cliente = cliente;
      else if (clienteId) payload.clienteId = Number(clienteId);
      const { data } = await api.post('/ventas/contrato/borrador', payload, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'No se pudo generar el borrador');
    }
  }

  return (
    <div>
      <h1>Ventas</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        {!mostrarForm && <button className="btn btn-primary" onClick={() => setMostrarForm(true)}>+ Nueva venta</button>}
      </div>

      {mostrarForm && (
        <div className="card">
          <h3>Nueva venta</h3>
          <form onSubmit={registrar} className="grid" style={{ maxWidth: 640 }}>
            {usuario.rol === 'ADMIN' && (
              <div><label>Sucursal</label><SelectorSucursal value={sucursalId} onChange={setSucursalId} /></div>
            )}
            <div><label>Vehículo disponible</label>
              <select value={vehiculoId} onChange={(e) => elegirVehiculo(e.target.value)} required>
                <option value="">Seleccione un vehículo…</option>
                {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.anio} {v.marca} {v.modelo} — ${Number(v.precioVenta).toLocaleString('es-MX')}</option>)}
              </select>
            </div>
            {usuario.rol === 'ADMIN' && (
              <div><label>Vendedor</label>
                <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} required>
                  <option value="">Seleccione vendedor…</option>
                  {empleados.map((em) => <option key={em.id} value={em.id}>{em.nombre} {em.apellidos}</option>)}
                </select>
              </div>
            )}

            <div>
              <label>Cliente</label>
              <div className="row">
                <label style={{ fontWeight: 400 }}><input type="radio" style={{ width: 'auto' }} checked={!nuevoCliente} onChange={() => setNuevoCliente(false)} /> Existente</label>
                <label style={{ fontWeight: 400 }}><input type="radio" style={{ width: 'auto' }} checked={nuevoCliente} onChange={() => setNuevoCliente(true)} /> Nuevo</label>
              </div>
            </div>
            {!nuevoCliente ? (
              <div>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Seleccione cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid">
                <div className="row">
                  <div style={{ flex: 1 }}><label>Nombre</label><input value={cliente.nombre} onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))} required={nuevoCliente} /></div>
                  <div style={{ flex: 1 }}><label>Teléfono</label><input value={cliente.telefono} onChange={(e) => setCliente((c) => ({ ...c, telefono: e.target.value }))} /></div>
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}><label>Domicilio</label><input value={cliente.domicilio} onChange={(e) => setCliente((c) => ({ ...c, domicilio: e.target.value }))} /></div>
                  <div style={{ flex: 1 }}><label>Colonia</label><input value={cliente.colonia} onChange={(e) => setCliente((c) => ({ ...c, colonia: e.target.value }))} /></div>
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}><label>Código Postal</label><input value={cliente.codigoPostal} onChange={(e) => setCliente((c) => ({ ...c, codigoPostal: e.target.value }))} /></div>
                  <div style={{ flex: 1 }}><label>Ciudad/Estado</label><input value={cliente.ciudadEstado} onChange={(e) => setCliente((c) => ({ ...c, ciudadEstado: e.target.value }))} /></div>
                </div>
              </div>
            )}

            <div className="row">
              <div style={{ flex: 1 }}><label>Total</label><input type="number" value={total} onChange={(e) => setTotal(e.target.value)} required /></div>
              <div style={{ flex: 2 }}><label>Observaciones</label><input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></div>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn btn-primary" type="submit">Registrar venta</button>
              <button type="button" className="btn" onClick={verBorrador}>Ver borrador</button>
              <button type="button" className="btn" onClick={reset}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <table>
        <thead><tr><th>Folio</th><th>Fecha</th><th>Vehículo</th><th>Cliente</th><th>Vendedor</th><th>Total</th><th></th></tr></thead>
        <tbody>{ventas.map((v) => (
          <tr key={v.id}>
            <td>{v.folio}</td>
            <td>{new Date(v.fecha).toLocaleDateString('es-MX')}</td>
            <td>{v.vehiculo?.anio} {v.vehiculo?.marca} {v.vehiculo?.modelo}</td>
            <td>{v.cliente?.nombre}</td>
            <td>{v.empleado ? `${v.empleado.nombre} ${v.empleado.apellidos}` : '—'}</td>
            <td>${Number(v.total).toLocaleString('es-MX')}</td>
            <td><button className="btn btn-sm" onClick={() => verContrato(v.id)}>Ver contrato</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
