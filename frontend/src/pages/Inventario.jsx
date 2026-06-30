import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';
import { useAuth } from '../context/AuthContext';

const BADGE = { DISPONIBLE: 'badge-disponible', RESERVADO: 'badge-reservado', VENDIDO: 'badge-vendido' };

// Las fotos se guardan como archivos; el valor puede ser una ruta ("vehiculos/x.jpg"),
// una URL ya servida, o un data URL nuevo aún sin guardar.
const urlFoto = (d) => (!d || d.startsWith('data:') || d.startsWith('/api/uploads/')) ? d : `/api/uploads/${d}`;

export default function Inventario() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState([]);
  const [filtros, setFiltros] = useState({ buscar: '', estado: '', sucursalId: undefined });
  const [galeria, setGaleria] = useState(null); // { fotos: [url], idx }
  const esVendedor = usuario.rol === 'VENDEDOR';

  async function cargar() {
    const params = new URLSearchParams();
    params.set('inventario', 'venta');
    if (filtros.buscar) params.set('buscar', filtros.buscar);
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.sucursalId) params.set('sucursalId', filtros.sucursalId);
    const { data } = await api.get(`/vehiculos?${params}`);
    setLista(data);
  }
  useEffect(() => { cargar(); }, [filtros]);

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
      <h1>Inventario de venta</h1>

      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Buscar marca / modelo / VIN…" value={filtros.buscar} onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))} style={{ maxWidth: 240 }} />
        <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} style={{ maxWidth: 180 }}>
          <option value="">Todos los estados</option>
          <option value="DISPONIBLE">Disponible</option>
          <option value="RESERVADO">Reservado</option>
          <option value="VENDIDO">Vendido</option>
        </select>
        <SelectorSucursal value={filtros.sucursalId} onChange={(v) => setFiltros((f) => ({ ...f, sucursalId: v }))} incluirTodas />
      </div>

      <table>
        <thead><tr>
          <th>Foto</th><th>Vehículo</th><th>Color</th><th>Precio</th><th>Estado</th>
          <th>Días en venta</th>
          {!esVendedor && <th>Utilidad</th>}
          <th></th>
        </tr></thead>
        <tbody>{lista.map((v) => (
          <tr key={v.id}>
            <td>{v.fotos?.[0] ? <img src={urlFoto(v.fotos[0].data)} alt="" className="thumb-tabla" onClick={() => abrirGaleria(v)} title="Ver foto" /> : '—'}</td>
            <td>{v.anio} {v.marca} {v.modelo}<br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>{v.sucursal?.nombre}</span></td>
            <td>{v.color}</td>
            <td>${Number(v.precioVenta).toLocaleString('es-MX')}</td>
            <td><span className={`badge ${BADGE[v.estado]}`}>{v.estado}</span></td>
            <td>{v.diasEnVenta != null ? v.diasEnVenta : '—'}</td>
            {!esVendedor && <td>{v.utilidad != null ? `$${Number(v.utilidad).toLocaleString('es-MX')}` : '—'}</td>}
            <td className="row">
              {v.estado !== 'VENDIDO' && (
                <select className="btn-sm" value={v.estado} onChange={(e) => cambiarEstado(v, e.target.value)}>
                  <option value="DISPONIBLE">Disponible</option>
                  <option value="RESERVADO">Reservado</option>
                </select>
              )}
              {!esVendedor && <a className="btn btn-sm" href={`/compra?editar=${v.id}`}>Costos</a>}
            </td>
          </tr>
        ))}</tbody>
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
