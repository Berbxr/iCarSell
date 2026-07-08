import { useEffect, useState } from 'react';
import api from '../api/client';
import SubidorImagenes from '../components/SubidorImagenes';
import SelectorSucursal from '../components/SelectorSucursal';
import { useAuth } from '../context/AuthContext';

const VACIO = {
  anio: '', marca: '', modelo: '', color: '', vin: '', placa: '', kilometraje: '',
  transmision: '', combustible: '',
  precioCompra: '', comisionProveedor: '', transporte: '', registroPlacas: '', salidas: '',
  precioVenta: '', notas: '', sucursalId: undefined, socioId: '', fotos: [],
};

const urlFoto = (d) => (!d || d.startsWith('data:') || d.startsWith('/api/uploads/')) ? d : `/api/uploads/${d}`;
const num = (x) => Number(x) || 0;

export default function Compra() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [nuevoGasto, setNuevoGasto] = useState({ descripcion: '', monto: '' });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');
  const [vinAviso, setVinAviso] = useState('');
  const [socios, setSocios] = useState([]);
  const [filtroSocio, setFiltroSocio] = useState('');

  useEffect(() => { api.get('/socios').then((r) => setSocios(r.data)).catch(() => {}); }, []);

  async function cargar() {
    const p = new URLSearchParams();
    p.set('inventario', 'compra');
    if (filtroSocio) p.set('socioId', filtroSocio);
    const { data } = await api.get(`/vehiculos?${p.toString()}`);
    setLista(data);
  }
  useEffect(() => { cargar(); }, [filtroSocio]);

  // Si llega ?editar=<id> (desde el inventario de venta), abrir esa ficha.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('editar');
    if (id) abrir(Number(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function verificarVin() {
    const vin = (form.vin || '').trim();
    if (!vin) { setVinAviso(''); return; }
    try {
      const params = new URLSearchParams({ vin });
      if (editId) params.set('excluir', String(editId));
      const { data } = await api.get(`/vehiculos/vin-existe?${params.toString()}`);
      setVinAviso(data.existe ? `Este VIN ya está registrado en ${data.descripcion}` : '');
    } catch { setVinAviso(''); }
  }

  const puestoEnMexico = num(form.precioCompra) + num(form.comisionProveedor) + num(form.transporte) + num(form.registroPlacas) + num(form.salidas);
  const totalGastos = gastos.reduce((a, g) => a + num(g.monto), 0);
  const costoTotal = puestoEnMexico + totalGastos;
  const utilidad = num(form.precioVenta) - costoTotal;

  function nuevo() { setEditId(null); setForm(VACIO); setGastos([]); setVinAviso(''); setMostrarForm(true); }

  async function abrir(id) {
    const { data } = await api.get(`/vehiculos/${id}`);
    setEditId(id);
    setForm({ ...VACIO, ...data, transmision: data.transmision || '', combustible: data.combustible || '', fotos: (data.fotos || []).map((f) => urlFoto(f.data)) });
    setGastos(data.gastos || []);
    setVinAviso('');
    setMostrarForm(true);
  }

  async function guardar(e) {
    e.preventDefault(); setError('');
    try {
      const payload = { ...form };
      delete payload.gastos;
      delete payload.diasEnCompra; delete payload.diasEnVenta;
      delete payload.costoPuestoEnMexico; delete payload.costoTotal; delete payload.utilidad;
      if (editId) { await api.put(`/vehiculos/${editId}`, payload); }
      else { const { data } = await api.post('/vehiculos', payload); setEditId(data.id); }
      await cargar();
      if (!editId) setMostrarForm(false);
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  }

  async function agregarGasto() {
    if (!editId) { setError('Guarda primero el auto para agregar gastos'); return; }
    if (!nuevoGasto.descripcion.trim() || nuevoGasto.monto === '') return;
    const { data } = await api.post(`/vehiculos/${editId}/gastos`, { descripcion: nuevoGasto.descripcion, monto: num(nuevoGasto.monto) });
    setGastos((gs) => [...gs, data]);
    setNuevoGasto({ descripcion: '', monto: '' });
  }
  async function quitarGasto(g) {
    await api.delete(`/vehiculos/${editId}/gastos/${g.id}`);
    setGastos((gs) => gs.filter((x) => x.id !== g.id));
  }

  async function pasarAVenta() {
    setError('');
    try {
      await api.put(`/vehiculos/${editId}/pasar-a-venta`);
      setMostrarForm(false); setEditId(null); setForm(VACIO); setGastos([]);
      await cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo pasar a venta'); }
  }

  return (
    <div>
      <h1>Inventario de compra</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={nuevo}>+ Registrar auto</button>
        <select value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todos los socios</option>
          {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>

      {mostrarForm && (
        <div className="card">
          <h3>{editId ? 'Editar auto en compra' : 'Nuevo auto'}</h3>
          <form onSubmit={guardar} className="grid" style={{ maxWidth: 820 }}>
            <div className="row">
              <div style={{ flex: 1 }}><label>Año</label><input type="number" value={form.anio} onChange={(e) => set('anio', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Marca</label><input value={form.marca} onChange={(e) => set('marca', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Modelo</label><input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} required /></div>
              <div style={{ flex: 1 }}><label>Color</label><input value={form.color || ''} onChange={(e) => set('color', e.target.value)} /></div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>VIN</label>
                <input value={form.vin || ''} maxLength={17}
                  onChange={(e) => { set('vin', e.target.value); if (vinAviso) setVinAviso(''); }}
                  onBlur={verificarVin} />
                {vinAviso && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}>{vinAviso}</div>}
              </div>
              <div style={{ flex: 1 }}><label>Placa</label><input value={form.placa || ''} onChange={(e) => set('placa', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Kilometraje</label><input type="number" value={form.kilometraje || ''} onChange={(e) => set('kilometraje', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Sucursal</label><SelectorSucursal value={form.sucursalId} onChange={(v) => set('sucursalId', v)} /></div>
              <div style={{ flex: 1 }}><label>Socio</label>
                <select value={form.socioId || ''} onChange={(e) => set('socioId', e.target.value)} required>
                  <option value="">Seleccione socio…</option>
                  {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            </div>

            <h4>Costos (USD)</h4>
            <div className="row">
              <div style={{ flex: 1 }}><label>Precio compra</label><input type="number" value={form.precioCompra} onChange={(e) => set('precioCompra', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Comisión proveedor</label><input type="number" value={form.comisionProveedor} onChange={(e) => set('comisionProveedor', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Transporte</label><input type="number" value={form.transporte} onChange={(e) => set('transporte', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Registro/Placas</label><input type="number" value={form.registroPlacas} onChange={(e) => set('registroPlacas', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label>Salidas</label><input type="number" value={form.salidas} onChange={(e) => set('salidas', e.target.value)} /></div>
            </div>
            <p><strong>Costo Puesto en México:</strong> ${puestoEnMexico.toLocaleString('es-MX')}</p>

            <h4>Otros costos / gastos</h4>
            {!editId && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Guarda el auto para poder agregar gastos.</p>}
            <table>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td>{g.descripcion}</td>
                    <td>${num(g.monto).toLocaleString('es-MX')}</td>
                    <td><button type="button" className="btn btn-sm" onClick={() => quitarGasto(g)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editId && (
              <div className="row">
                <input placeholder="Descripción" value={nuevoGasto.descripcion} onChange={(e) => setNuevoGasto((n) => ({ ...n, descripcion: e.target.value }))} />
                <input type="number" placeholder="Monto" value={nuevoGasto.monto} onChange={(e) => setNuevoGasto((n) => ({ ...n, monto: e.target.value }))} style={{ maxWidth: 140 }} />
                <button type="button" className="btn btn-sm" onClick={agregarGasto}>Agregar gasto</button>
              </div>
            )}

            <h4>Precio y utilidad (USD)</h4>
            <div className="row">
              <div style={{ flex: 1 }}><label>Precio de venta</label><input type="number" value={form.precioVenta} onChange={(e) => set('precioVenta', e.target.value)} /></div>
            </div>
            <p><strong>Costo total:</strong> ${costoTotal.toLocaleString('es-MX')} &nbsp;|&nbsp; <strong>Utilidad:</strong> ${utilidad.toLocaleString('es-MX')}</p>

            <div><label>Notas</label><textarea rows={2} value={form.notas || ''} onChange={(e) => set('notas', e.target.value)} /></div>
            <div><label>Fotos</label><SubidorImagenes value={form.fotos} onChange={(arr) => set('fotos', arr)} /></div>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn btn-primary" type="submit">{editId ? 'Guardar borrador' : 'Crear'}</button>
              {editId && <button type="button" className="btn btn-primary" onClick={pasarAVenta}>Pasar a venta</button>}
              <button type="button" className="btn" onClick={() => { setMostrarForm(false); setEditId(null); setForm(VACIO); setGastos([]); }}>Cerrar</button>
            </div>
          </form>
        </div>
      )}

      <table>
        <thead><tr><th>Vehículo</th><th>Sucursal</th><th>Socio</th><th>Precio venta</th><th>Costo total</th><th>Utilidad</th><th>Días en compra</th><th></th></tr></thead>
        <tbody>{lista.map((v) => (
          <tr key={v.id}>
            <td>{v.anio} {v.marca} {v.modelo}</td>
            <td>{v.sucursal?.nombre}</td>
            <td>{v.socio?.nombre}</td>
            <td>${num(v.precioVenta).toLocaleString('es-MX')}</td>
            <td>{v.costoTotal != null ? `$${Number(v.costoTotal).toLocaleString('es-MX')}` : '—'}</td>
            <td>{v.utilidad != null ? `$${Number(v.utilidad).toLocaleString('es-MX')}` : '—'}</td>
            <td>{v.diasEnCompra != null ? v.diasEnCompra : '—'}</td>
            <td><button className="btn btn-sm" onClick={() => abrir(v.id)}>Abrir</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
