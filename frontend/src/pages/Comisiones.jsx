import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';

// Devuelve 'YYYY-MM-DD' (local) de la fecha dada.
function iso(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function Comisiones() {
  const [sucursalId, setSucursalId] = useState(undefined);
  const [ref, setRef] = useState(new Date()); // fecha de referencia de la semana
  const [data, setData] = useState(null);

  function moverSemana(dias) {
    setRef((r) => { const n = new Date(r); n.setDate(r.getDate() + dias); return n; });
  }

  async function cargar() {
    const p = new URLSearchParams();
    p.set('fecha', iso(ref));
    if (sucursalId) p.set('sucursalId', sucursalId);
    const r = await api.get(`/reportes/comisiones?${p.toString()}`);
    setData(r.data);
  }
  useEffect(() => { cargar(); }, [sucursalId, ref]);

  const fmtRango = data
    ? `${new Date(data.inicio).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} – ${new Date(data.fin).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}`
    : '';

  return (
    <div>
      <h1>Comisiones por semana</h1>
      <div className="row" style={{ marginBottom: 14, alignItems: 'center', gap: 8 }}>
        <button className="btn btn-sm" onClick={() => moverSemana(-7)}>‹ Anterior</button>
        <strong style={{ minWidth: 220, textAlign: 'center' }}>{fmtRango}</strong>
        <button className="btn btn-sm" onClick={() => moverSemana(7)}>Siguiente ›</button>
        <button className="btn btn-sm" onClick={() => setRef(new Date())}>Semana actual</button>
        <SelectorSucursal value={sucursalId} onChange={setSucursalId} incluirTodas />
      </div>

      {data && (
        <>
          <div className="kpis">
            <div className="kpi"><h3>Total a pagar</h3><div className="valor">${data.totalGeneral.toLocaleString('es-MX')}</div></div>
            <div className="kpi"><h3>Vendedores con ventas</h3><div className="valor">{data.vendedores.length}</div></div>
          </div>

          {data.vendedores.length === 0 && <p style={{ color: 'var(--muted)' }}>Sin ventas en esta semana.</p>}

          {data.vendedores.map((v) => (
            <div className="card" key={v.empleadoId} style={{ marginBottom: 14 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <h2 style={{ flex: 1 }}>{v.nombre} {v.apellidos}</h2>
                <strong>Total: ${v.total.toLocaleString('es-MX')}</strong>
              </div>
              <div className="tabla-wrap">
              <table>
                <thead><tr><th>Folio</th><th>Vehículo</th><th>Comisión</th></tr></thead>
                <tbody>{v.ventas.map((venta) => (
                  <tr key={venta.id}>
                    <td data-label="Folio">{venta.folio}</td><td data-label="Vehículo">{venta.vehiculo}</td>
                    <td data-label="Comisión">${Number(venta.comision).toLocaleString('es-MX')}</td>
                  </tr>
                ))}</tbody>
              </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
