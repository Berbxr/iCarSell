import { useEffect, useState } from 'react';
import api from '../api/client';
import SubidorImagenes from '../components/SubidorImagenes';
import SelectorSucursal from '../components/SelectorSucursal';
import { useAuth } from '../context/AuthContext';

const VACIO = {
  anio: '', marca: '', modelo: '', color: '', vin: '', placa: '', kilometraje: '',
  transmision: '', combustible: '', costoCompra: '', precioVenta: '', notas: '', sucursalId: undefined, fotos: [],
};

const BADGE = { DISPONIBLE: 'badge-disponible', RESERVADO: 'badge-reservado', VENDIDO: 'badge-vendido' };

// Las fotos se guardan como archivos; el valor puede ser una ruta ("vehiculos/x.jpg"),
// una URL ya servida, o un data URL nuevo aún sin guardar.
const urlFoto = (d) => (!d || d.startsWith('data:') || d.startsWith('/api/uploads/')) ? d : `/api/uploads/${d}`;

export default function Inventario() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState([]);
  const [filtros, setFiltros] = useState({ buscar: '', estado: '', sucursalId: undefined });
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [umbral, setUmbral] = useState(60);
  const [error, setError] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [galeria, setGaleria] = useState(null); // { fotos: [url], idx }

  async function cargar() {
    const params = new URLSearchParams();
    if (filtros.buscar) params.set('buscar', filtros.buscar);
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.sucursalId) params.set('sucursalId', filtros.sucursalId);
    const { data } = await api.get(`/vehiculos?${params}`);
    setLista(data);
  }
  useEffect(() => { cargar(); }, [filtros]);
  useEffect(() => { api.get('/configuracion').then((r) => setUmbral(r.data.diasAntiguedadAlerta)).catch(() => {}); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  const dias = (f) => Math.floor((Date.now() - new Date(f)) / 86400000);

  async function guardar(e) {
    e.preventDefault(); setError('');
    try {
      const payload = { ...form };
      if (usuario.rol !== 'ADMIN') delete payload.sucursalId;
      if (editId) await api.put(`/vehiculos/${editId}`, payload);
      else await api.post('/vehiculos', payload);
      setForm(VACIO); setEditId(null); setMostrarForm(false); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }
  function editar(v) {
    setEditId(v.id);
    setForm({ ...VACIO, ...v, transmision: v.transmision || '', combustible: v.combustible || '', fotos: (v.fotos || []).map((f) => urlFoto(f.data)) });
    setMostrarForm(true);
  }
  function nuevo() { setEditId(null); setForm(VACIO); setMostrarForm(true); }

  // Abre el visor con TODAS las fotos del vehículo (la lista solo trae la primera).
  async function abrirGaleria(v) {
    try {
      const { data } = await api.get(`/vehiculos/${v.id}`);
      const fotos = (data.fotos || []).map((f) => urlFoto(f.data));
      setGaleria({ fotos: fotos.length ? fotos : [urlFoto(v.fotos[0].data)], idx: 0 });
    } catch {
      if (v.fotos?.[0]) setGaleria({ fotos: [urlFoto(v.fotos[0].data)], idx: 0 });
    }
  }
  async function cambiarEstado(v, estado) { await api.patch(`/vehiculos/${v.id}/estado`, { estado }); cargar(); }

  return (
    <div>
      <h1>Inventario</h1>

      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Buscar marca / modelo / VIN…" value={filtros.buscar} onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))} style={{ maxWidth: 240 }} />
        <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} style={{ maxWidth: 180 }}>
          <option value="">Todos los estados</option>
          <option value="DISPONIBLE">Disponible</option>
          <option value="RESERVADO">Reservado</option>
          <option value="VENDIDO">Vendido</option>
        </select>
        {usuario.rol === 'ADMIN' && <SelectorSucursal value={filtros.sucursalId} onChange={(v) => setFiltros((f) => ({ ...f, sucursalId: v }))} incluirTodas />}
        <button className="btn btn-primary" onClick={nuevo}>+ Nuevo vehículo</button>
      </div>

      {mostrarForm && (
        <div className="card">
          <h3>{editId ? 'Editar vehículo' : 'Nuevo vehículo'}</h3>
          <form onSubmit={guardar} className="grid" style={{ maxWidth: 720 }}>
            <div className="row">
              <div style={{ flex: 1 }}><label>Año</label><input type="number" value={form.anio} onChange={(e) => set('anio', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Marca</label><input value={form.marca} onChange={(e) => set('marca', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Modelo</label><input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Color</label><input value={form.color || ''} onChange={(e) => set('color', e.target.value)} /></div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}><label>VIN</label><input value={form.vin || ''} maxLength={17} onChange={(e) => set('vin', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Placa</label><input value={form.placa || ''} onChange={(e) => set('placa', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Kilometraje</label><input type="number" value={form.kilometraje || ''} onChange={(e) => set('kilometraje', e.target.value)} /></div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}><label>Transmisión</label>
                <select value={form.transmision} onChange={(e) => set('transmision', e.target.value)}>
                  <option value="">—</option><option value="AUTOMATICA">Automática</option><option value="ESTANDAR">Estándar</option>
                </select>
              </div>
              <div style={{ flex: 1 }}><label>Combustible</label>
                <select value={form.combustible} onChange={(e) => set('combustible', e.target.value)}>
                  <option value="">—</option><option value="GASOLINA">Gasolina</option><option value="DIESEL">Diésel</option>
                  <option value="HIBRIDO">Híbrido</option><option value="ELECTRICO">Eléctrico</option>
                </select>
              </div>
              {usuario.rol === 'ADMIN' && (
                <div style={{ flex: 1 }}><label>Sucursal</label>
                  <SelectorSucursal value={form.sucursalId} onChange={(v) => set('sucursalId', v)} />
                </div>
              )}
            </div>
            <div className="row">
              <div style={{ flex: 1 }}><label>Costo de compra</label><input type="number" value={form.costoCompra} onChange={(e) => set('costoCompra', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Precio de venta</label><input type="number" value={form.precioVenta} onChange={(e) => set('precioVenta', e.target.value)} /></div>
            </div>
            <div><label>Notas</label><textarea rows={2} value={form.notas || ''} onChange={(e) => set('notas', e.target.value)} /></div>
            <div><label>Fotos</label><SubidorImagenes value={form.fotos} onChange={(arr) => set('fotos', arr)} /></div>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn btn-primary" type="submit">{editId ? 'Actualizar' : 'Crear'}</button>
              <button type="button" className="btn" onClick={() => { setMostrarForm(false); setEditId(null); setForm(VACIO); }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <table>
        <thead><tr><th>Foto</th><th>Vehículo</th><th>Color</th><th>Precio</th><th>Estado</th><th>Días</th><th></th></tr></thead>
        <tbody>{lista.map((v) => {
          const d = dias(v.fechaIngreso);
          const alerta = v.estado === 'DISPONIBLE' && d >= umbral;
          return (
            <tr key={v.id}>
              <td>{v.fotos?.[0] ? <img src={urlFoto(v.fotos[0].data)} alt="" className="thumb-tabla" onClick={() => abrirGaleria(v)} title="Ver foto" /> : '—'}</td>
              <td>{v.anio} {v.marca} {v.modelo}<br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>{v.sucursal?.nombre}</span></td>
              <td>{v.color}</td>
              <td>${Number(v.precioVenta).toLocaleString('es-MX')}</td>
              <td><span className={`badge ${BADGE[v.estado]}`}>{v.estado}</span></td>
              <td className={alerta ? 'alerta' : ''}>{d}{alerta ? ' ⚠' : ''}</td>
              <td className="row">
                <button className="btn btn-sm" onClick={() => editar(v)}>Editar</button>
                {v.estado !== 'VENDIDO' && (
                  <select className="btn-sm" value={v.estado} onChange={(e) => cambiarEstado(v, e.target.value)}>
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="RESERVADO">Reservado</option>
                  </select>
                )}
              </td>
            </tr>
          );
        })}</tbody>
      </table>

      {galeria && (
        <div className="modal-bg" onClick={() => setGaleria(null)}>
          <div className="modal-foto" onClick={(e) => e.stopPropagation()}>
            <button className="modal-cerrar" onClick={() => setGaleria(null)} aria-label="Cerrar">×</button>
            <img src={galeria.fotos[galeria.idx]} alt="Foto del vehículo" />
            {galeria.fotos.length > 1 && (
              <div className="modal-miniaturas">
                {galeria.fotos.map((f, i) => (
                  <img key={i} src={f} alt="" className={i === galeria.idx ? 'activa' : ''} onClick={() => setGaleria((g) => ({ ...g, idx: i }))} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
