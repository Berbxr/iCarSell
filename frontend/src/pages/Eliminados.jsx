import { useEffect, useState } from 'react';
import api from '../api/client';

const BADGE = { EN_COMPRA: 'badge-reservado', DISPONIBLE: 'badge-disponible', RESERVADO: 'badge-reservado', VENDIDO: 'badge-vendido' };

export default function Eliminados() {
  const [lista, setLista] = useState([]);

  async function cargar() {
    const { data } = await api.get('/vehiculos?eliminados=1');
    setLista(data);
  }
  useEffect(() => { cargar(); }, []);

  async function restaurar(v) {
    if (!window.confirm(`¿Restaurar ${v.anio} ${v.marca} ${v.modelo} al inventario?`)) return;
    try {
      await api.put(`/vehiculos/${v.id}/restaurar`);
      cargar();
    } catch (err) { window.alert(err.response?.data?.error || 'No se pudo restaurar el vehículo'); }
  }

  return (
    <div>
      <h1>Eliminados</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8 }}>
        Autos que tuvieron una venta cancelada y se eliminaron del inventario. Conservan su historial original
        (fecha de ingreso, costos, gastos y la venta cancelada) y se pueden restaurar en cualquier momento.
      </p>

      <div className="tabla-wrap">
      <table>
        <thead><tr>
          <th>Vehículo</th><th>VIN</th><th>Sucursal</th><th>Estado</th><th>Precio venta</th><th>Fecha de ingreso</th>
          <th>Venta cancelada</th><th>Motivo de eliminación</th><th></th>
        </tr></thead>
        <tbody>{lista.map((v) => {
          const venta = v.ventas?.[0];
          return (
          <tr key={v.id}>
            <td data-label="Vehículo">{v.anio} {v.marca} {v.modelo}</td>
            <td data-label="VIN">{v.vin || '—'}</td>
            <td data-label="Sucursal">{v.sucursal?.nombre}</td>
            <td data-label="Estado"><span className={`badge ${BADGE[v.estado]}`}>{v.estado}</span></td>
            <td data-label="Precio venta">${Number(v.precioVenta).toLocaleString('es-MX')}</td>
            <td data-label="Fecha de ingreso">{new Date(v.fechaIngreso).toLocaleDateString('es-MX')}</td>
            <td data-label="Venta cancelada">
              {venta
                ? <>{venta.motivoCancelacion || 'Sin motivo especificado'}<br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>{venta.canceladaEn ? new Date(venta.canceladaEn).toLocaleDateString('es-MX') : ''}</span></>
                : '—'}
            </td>
            <td data-label="Motivo de eliminación">{v.motivoEliminacion || '—'}</td>
            <td className="row">
              <a className="btn btn-sm" href={`/compra?editar=${v.id}`}>Ver detalle</a>
              <button className="btn btn-sm btn-primary" onClick={() => restaurar(v)}>Restaurar</button>
            </td>
          </tr>
          );
        })}</tbody>
        {!lista.length && <tbody><tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)' }}>No hay autos eliminados</td></tr></tbody>}
      </table>
      </div>
    </div>
  );
}
