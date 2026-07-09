import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';
import { useAuth } from '../context/AuthContext';

const CLIENTE_VACIO = { nombre: '', domicilio: '', colonia: '', codigoPostal: '', ciudadEstado: '', telefono: '' };
const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX');

// Descuento (USD) a partir del precio de lista. Espejo de backend utils/descuento.js.
function calcDescuento(lista, tipo, valor) {
  const L = Number(lista) || 0;
  if (L <= 0) return 0;
  const v = Math.max(0, Number(valor) || 0);
  const d = tipo === 'PORCENTAJE' ? L * Math.min(v, 100) / 100 : Math.min(v, L);
  return Math.round(d * 100) / 100;
}

export default function Ventas() {
  const { usuario } = useAuth();
  const esAdmin = usuario.rol === 'ADMIN';
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
  const [precioLista, setPrecioLista] = useState(0);
  const [descuento, setDescuento] = useState(0);
  const [observaciones, setObservaciones] = useState('SIN GARANTÍA');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [error, setError] = useState('');

  // Modal de descuento (solo ADMIN)
  const [modalDesc, setModalDesc] = useState(false);
  const [descTipo, setDescTipo] = useState('MONTO');
  const [descValor, setDescValor] = useState('');

  const total = Math.max(0, Math.round((precioLista - descuento) * 100) / 100);

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
    setPrecioLista(v ? Number(v.precioVenta) || 0 : 0);
    setDescuento(0);
  }

  function reset() {
    setMostrarForm(false); setVehiculoId(''); setClienteId(''); setNuevoCliente(false);
    setCliente(CLIENTE_VACIO); setPrecioLista(0); setDescuento(0); setObservaciones('SIN GARANTÍA'); setMetodoPago('EFECTIVO'); setEmpleadoId(''); setError('');
  }

  function aplicarDescuento() {
    setDescuento(calcDescuento(precioLista, descTipo, descValor));
    setModalDesc(false); setDescValor('');
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
      const payload = { vehiculoId: Number(vehiculoId), clienteId: Number(cid), total, observaciones, metodoPago };
      if (esAdmin) { payload.empleadoId = Number(empleadoId); payload.descuento = descuento; }
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

  async function cancelarVenta(v) {
    const motivo = window.prompt(`Cancelar la venta ${v.folio}. Motivo (opcional):`, '');
    if (motivo === null) return; // el usuario canceló el diálogo
    try {
      await api.post(`/ventas/${v.id}/cancelar`, { motivo });
      cargarVentas();
    } catch (err) { window.alert(err.response?.data?.error || 'No se pudo cancelar la venta'); }
  }

  // Genera un borrador imprimible del contrato con los datos actuales, sin registrar la venta.
  async function verBorrador() {
    setError('');
    try {
      if (!vehiculoId) throw new Error('Selecciona un vehículo para ver el borrador');
      const payload = { vehiculoId: Number(vehiculoId), total, descuento, observaciones };
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
            <div><label>Sucursal (filtro)</label><SelectorSucursal value={sucursalId} onChange={setSucursalId} incluirTodas /></div>
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

            {/* Precio y descuento */}
            <div className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Precio de lista: <b style={{ color: 'var(--text)' }}>{money(precioLista)} USD</b></div>
                  {descuento > 0 && <div style={{ fontSize: 13, color: 'var(--danger)' }}>Descuento: −{money(descuento)} USD</div>}
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Total: {money(total)} <span style={{ fontSize: 12, color: 'var(--muted)' }}>USD</span></div>
                </div>
                {esAdmin && (
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-sm" onClick={() => { setDescTipo('MONTO'); setDescValor(''); setModalDesc(true); }} disabled={!vehiculoId}>Aplicar descuento</button>
                    {descuento > 0 && <button type="button" className="btn btn-sm btn-danger" onClick={() => setDescuento(0)}>Quitar</button>}
                  </div>
                )}
              </div>
            </div>

            <div className="row">
              <div style={{ flex: 1 }}><label>Método de pago</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
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

      <div className="tabla-wrap">
      <table>
        <thead><tr><th>Folio</th><th>Fecha</th><th>Vehículo</th><th>Cliente</th><th>Vendedor</th><th>Total</th><th>Estado</th><th></th></tr></thead>
        <tbody>{ventas.map((v) => {
          const cancelada = v.estado === 'CANCELADA';
          return (
          <tr key={v.id} style={cancelada ? { opacity: .55 } : undefined}>
            <td data-label="Folio">{v.folio}</td>
            <td data-label="Fecha">{new Date(v.fecha).toLocaleDateString('es-MX')}</td>
            <td data-label="Vehículo">{v.vehiculo?.anio} {v.vehiculo?.marca} {v.vehiculo?.modelo}</td>
            <td data-label="Cliente">{v.cliente?.nombre}</td>
            <td data-label="Vendedor">{v.empleado ? `${v.empleado.nombre} ${v.empleado.apellidos}` : '—'}</td>
            <td data-label="Total">{money(v.total)}{v.descuento > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}> (−{money(v.descuento)})</span>}</td>
            <td data-label="Estado"><span className={`badge ${cancelada ? 'badge-vendido' : 'badge-disponible'}`}>{cancelada ? 'Cancelada' : 'Activa'}</span></td>
            <td className="row">
              <button className="btn btn-sm" onClick={() => verContrato(v.id)}>Ver contrato</button>
              {esAdmin && !cancelada && <button className="btn btn-sm btn-danger" onClick={() => cancelarVenta(v)}>Cancelar</button>}
            </td>
          </tr>
          );
        })}</tbody>
      </table>
      </div>

      {modalDesc && (
        <div className="modal-bg" onClick={() => setModalDesc(false)}>
          <div className="modal-foto" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, alignItems: 'stretch' }}>
            <button className="modal-cerrar" onClick={() => setModalDesc(false)} aria-label="Cerrar">×</button>
            <h3 style={{ margin: '2px 0 6px' }}>Aplicar descuento</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Precio de lista: <b style={{ color: 'var(--text)' }}>{money(precioLista)} USD</b></div>
            <div className="row" style={{ marginBottom: 8 }}>
              <label style={{ fontWeight: 400 }}><input type="radio" style={{ width: 'auto' }} checked={descTipo === 'MONTO'} onChange={() => setDescTipo('MONTO')} /> Monto (USD)</label>
              <label style={{ fontWeight: 400 }}><input type="radio" style={{ width: 'auto' }} checked={descTipo === 'PORCENTAJE'} onChange={() => setDescTipo('PORCENTAJE')} /> Porcentaje (%)</label>
            </div>
            <label>{descTipo === 'PORCENTAJE' ? 'Porcentaje a descontar' : 'Monto a descontar (USD)'}</label>
            <input type="number" min="0" value={descValor} onChange={(e) => setDescValor(e.target.value)} autoFocus />
            <div style={{ fontSize: 14, margin: '10px 0' }}>
              Descuento: <b>−{money(calcDescuento(precioLista, descTipo, descValor))}</b> &nbsp;→&nbsp;
              Total: <b>{money(Math.max(0, precioLista - calcDescuento(precioLista, descTipo, descValor)))}</b>
            </div>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={aplicarDescuento}>Aplicar</button>
              <button type="button" className="btn" onClick={() => setModalDesc(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
