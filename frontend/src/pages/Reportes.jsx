import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX');
// Etiqueta de moneda pequeña junto a una cifra.
const U = ({ m }) => <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginLeft: 4 }}>{m}</span>;

export default function Reportes() {
  const [sucursalId, setSucursalId] = useState(undefined);
  const [socioId, setSocioId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [ventas, setVentas] = useState(null);
  const [inventario, setInventario] = useState(null);
  const [socios, setSocios] = useState(null);
  const [listaSocios, setListaSocios] = useState([]);

  useEffect(() => { api.get('/socios').then((r) => setListaSocios(r.data)).catch(() => {}); }, []);

  function params() {
    const p = new URLSearchParams();
    if (sucursalId) p.set('sucursalId', sucursalId);
    if (socioId) p.set('socioId', socioId);
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    return p.toString();
  }

  async function cargar() {
    const [v, i, s] = await Promise.all([
      api.get(`/reportes/ventas?${params()}`),
      api.get(`/reportes/inventario?${sucursalId ? `sucursalId=${sucursalId}` : ''}`),
      api.get(`/reportes/socios?${params()}`),
    ]);
    setVentas(v.data); setInventario(i.data); setSocios(s.data);
  }
  useEffect(() => { cargar(); }, [sucursalId, socioId, desde, hasta]);

  const costoTotalVeh = (v) => {
    const veh = v?.vehiculo;
    if (!veh) return 0;
    const fijos = (veh.precioCompra || 0) + (veh.comisionProveedor || 0) + (veh.transporte || 0) + (veh.registroPlacas || 0) + (veh.salidas || 0);
    const gastos = Array.isArray(veh.gastos) ? veh.gastos.reduce((a, g) => a + (g.monto || 0), 0) : 0;
    return fijos + gastos;
  };
  const utilidadVeh = (v) => (v?.vehiculo ? v.vehiculo.precioVenta - costoTotalVeh(v) : 0);
  const tc = socios?.tipoCambio || 0;

  function exportarCSV() {
    if (!ventas) return;
    const filas = [['Folio', 'Fecha', 'Vehículo', 'Socio', 'Cliente', 'Vendedor', 'Total (USD)', 'Utilidad (USD)', 'Comisión (MXN)', 'Pago']];
    ventas.ventas.forEach((v) => filas.push([
      v.folio, new Date(v.fecha).toLocaleDateString('es-MX'),
      `${v.vehiculo?.anio} ${v.vehiculo?.marca} ${v.vehiculo?.modelo}`,
      v.vehiculo?.socio?.nombre || '', v.cliente?.nombre, `${v.empleado?.nombre || ''} ${v.empleado?.apellidos || ''}`,
      v.total, utilidadVeh(v), v.comision ?? 0, v.metodoPago || '',
    ]));
    const csv = filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'reporte-ventas.csv'; a.click();
  }

  return (
    <div>
      <h1>Reportes</h1>

      <div className="card" style={{ padding: '12px 16px', background: '#f8fafc' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          <b style={{ color: 'var(--text)' }}>USD</b> — precios de autos, ventas y utilidad. &nbsp;·&nbsp;
          <b style={{ color: 'var(--text)' }}>MXN</b> — comisiones y montos en pesos. &nbsp;·&nbsp;
          Conversión a MXN con el tipo de cambio configurado{tc ? `: $${Number(tc).toLocaleString('es-MX')} MXN por USD` : ' (sin configurar)'}.
        </p>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <SelectorSucursal value={sucursalId} onChange={setSucursalId} incluirTodas />
        <div><label>Socio</label>
          <select value={socioId} onChange={(e) => setSocioId(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">Todos los socios</option>
            {listaSocios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>

      {ventas && (
        <>
          <h2>Ventas</h2>
          <div className="kpis">
            <div className="kpi"><h3>Monto vendido</h3><div className="valor">{money(ventas.totales.monto)}<U m="USD" /></div></div>
            <div className="kpi"><h3>N.º de ventas</h3><div className="valor">{ventas.totales.cantidad}</div></div>
            <div className="kpi"><h3>Utilidad</h3><div className="valor">{money(ventas.totales.utilidad)}<U m="USD" /></div></div>
            {ventas.totales.comision !== undefined && (
              <div className="kpi"><h3>Comisiones a pagar</h3><div className="valor">{money(ventas.totales.comision)}<U m="MXN" /></div></div>
            )}
            {ventas.totales.comision !== undefined && (
              tc > 0 ? (
                <div className="kpi">
                  <h3>Utilidad neta (tras comisiones)</h3>
                  <div className="valor" style={{ color: (ventas.totales.utilidad * tc - ventas.totales.comision) >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                    {money(ventas.totales.utilidad * tc - ventas.totales.comision)}<U m="MXN" />
                  </div>
                  <div className="sub">Utilidad en MXN − comisiones</div>
                </div>
              ) : (
                <div className="kpi"><h3>Utilidad neta (tras comisiones)</h3><div className="valor" style={{ fontSize: 15, color: 'var(--muted)' }}>Configura el tipo de cambio</div></div>
              )
            )}
          </div>
          {ventas.totales.efectivo !== undefined && (
            <div className="kpis">
              <div className="kpi"><h3>Cobrado en efectivo</h3><div className="valor">{money(ventas.totales.efectivo)}<U m="USD" /></div></div>
              <div className="kpi"><h3>Cobrado por transferencia</h3><div className="valor">{money(ventas.totales.transferencia)}<U m="USD" /></div></div>
            </div>
          )}
          <div className="row" style={{ marginBottom: 10 }}>
            <h3 style={{ flex: 1, margin: 0 }}>Detalle de ventas</h3>
            <button className="btn btn-sm" onClick={exportarCSV}>Exportar CSV</button>
          </div>
          <div className="tabla-wrap">
          <table>
            <thead><tr>
              <th>Folio</th><th>Fecha</th><th>Vehículo</th><th>Socio</th><th>Cliente</th><th>Vendedor</th>
              <th>Total (USD)</th><th>Utilidad (USD)</th><th>Comisión (MXN)</th><th>Pago</th>
            </tr></thead>
            <tbody>{ventas.ventas.map((v) => (
              <tr key={v.id}>
                <td data-label="Folio">{v.folio}</td><td data-label="Fecha">{new Date(v.fecha).toLocaleDateString('es-MX')}</td>
                <td data-label="Vehículo">{v.vehiculo?.anio} {v.vehiculo?.marca} {v.vehiculo?.modelo}</td>
                <td data-label="Socio">{v.vehiculo?.socio?.nombre || '—'}</td>
                <td data-label="Cliente">{v.cliente?.nombre}</td>
                <td data-label="Vendedor">{v.empleado?.nombre} {v.empleado?.apellidos}</td>
                <td data-label="Total (USD)">{money(v.total)}</td>
                <td data-label="Utilidad (USD)">{money(utilidadVeh(v))}</td>
                <td data-label="Comisión (MXN)">{v.comision !== undefined ? money(v.comision) : '—'}</td>
                <td data-label="Pago">{v.metodoPago || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </>
      )}

      {socios && (
        <>
          <h2 style={{ marginTop: 28 }}>Ganancias por socio</h2>
          <div className="kpis">
            <div className="kpi"><h3>Total ganancia</h3><div className="valor">{money(socios.totalGeneralUsd)}<U m="USD" /></div><div className="sub">{money(socios.totalGeneralMxn)} MXN</div></div>
          </div>
          <div className="tabla-wrap">
          <table>
            <thead><tr><th>Socio</th><th>Autos vendidos</th><th>Ganancia (USD)</th><th>Ganancia (MXN)</th></tr></thead>
            <tbody>{socios.socios.map((s) => (
              <tr key={s.socioId}>
                <td data-label="Socio">{s.nombre}</td><td data-label="Autos vendidos">{s.cantidad}</td>
                <td data-label="Ganancia (USD)">{money(s.totalUsd)}</td>
                <td data-label="Ganancia (MXN)">{money(s.totalMxn)}</td>
              </tr>
            ))}
            {socios.socios.length === 0 && <tr><td colSpan="4" style={{ color: 'var(--muted)' }}>Sin ventas en el periodo.</td></tr>}
            </tbody>
          </table>
          </div>

          {socios.porMes.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Ganancia por mes (general)</h3>
              <div className="tabla-wrap">
              <table>
                <thead><tr><th>Mes</th><th>Ganancia (USD)</th><th>Ganancia (MXN)</th></tr></thead>
                <tbody>{socios.porMes.map((m) => (
                  <tr key={m.mes}><td data-label="Mes">{m.mes}</td><td data-label="Ganancia (USD)">{money(m.utilidadUsd)}</td><td data-label="Ganancia (MXN)">{money(m.utilidadMxn)}</td></tr>
                ))}</tbody>
              </table>
              </div>
            </>
          )}

          {socioId && socios.disponibles && socios.disponibles.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Autos disponibles de este socio (sin vender)</h3>
              <div className="tabla-wrap">
              <table>
                <thead><tr><th>Vehículo</th><th>Precio venta (USD)</th><th>Utilidad potencial (USD)</th><th>Utilidad potencial (MXN)</th></tr></thead>
                <tbody>{socios.disponibles.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Vehículo">{a.vehiculo}</td>
                    <td data-label="Precio venta (USD)">{money(a.precioVenta)}</td>
                    <td data-label="Utilidad pot. (USD)">{money(a.utilidadUsd)}</td>
                    <td data-label="Utilidad pot. (MXN)">{money(a.utilidadMxn)}</td>
                  </tr>
                ))}</tbody>
              </table>
              </div>
            </>
          )}
        </>
      )}

      {inventario && (
        <>
          <h2 style={{ marginTop: 28 }}>Inventario</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            {Object.entries(inventario.porEstado).map(([estado, n]) => (
              <div className="kpi" key={estado} style={{ minWidth: 130 }}><h3>{estado}</h3><div className="valor">{n}</div></div>
            ))}
          </div>
          <div className="tabla-wrap">
          <table>
            <thead><tr><th>Vehículo</th><th>Sucursal</th><th>Estado</th><th>Días en inventario</th></tr></thead>
            <tbody>{inventario.vehiculos.map((v) => (
              <tr key={v.id}><td data-label="Vehículo">{v.anio} {v.marca} {v.modelo}</td><td data-label="Sucursal">{v.sucursal?.nombre}</td><td data-label="Estado">{v.estado}</td><td data-label="Días en inventario">{v.dias}</td></tr>
            ))}</tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
