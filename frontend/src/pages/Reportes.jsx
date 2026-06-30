import { useEffect, useState } from 'react';
import api from '../api/client';
import SelectorSucursal from '../components/SelectorSucursal';

export default function Reportes() {
  const [sucursalId, setSucursalId] = useState(undefined);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [ventas, setVentas] = useState(null);
  const [inventario, setInventario] = useState(null);

  function params() {
    const p = new URLSearchParams();
    if (sucursalId) p.set('sucursalId', sucursalId);
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    return p.toString();
  }

  async function cargar() {
    const [v, i] = await Promise.all([
      api.get(`/reportes/ventas?${params()}`),
      api.get(`/reportes/inventario?${sucursalId ? `sucursalId=${sucursalId}` : ''}`),
    ]);
    setVentas(v.data); setInventario(i.data);
  }
  useEffect(() => { cargar(); }, [sucursalId, desde, hasta]);

  const costoTotalVeh = (v) => {
    const veh = v?.vehiculo;
    if (!veh) return 0;
    const fijos = (veh.precioCompra || 0) + (veh.comisionProveedor || 0) + (veh.transporte || 0) + (veh.registroPlacas || 0) + (veh.salidas || 0);
    const gastos = Array.isArray(veh.gastos) ? veh.gastos.reduce((a, g) => a + (g.monto || 0), 0) : 0;
    return fijos + gastos;
  };
  const utilidadVeh = (v) => (v?.vehiculo ? v.vehiculo.precioVenta - costoTotalVeh(v) : 0);

  function exportarCSV() {
    if (!ventas) return;
    const filas = [['Folio', 'Fecha', 'Vehículo', 'Cliente', 'Vendedor', 'Total', 'Utilidad', 'Comisión']];
    ventas.ventas.forEach((v) => filas.push([
      v.folio, new Date(v.fecha).toLocaleDateString('es-MX'),
      `${v.vehiculo?.anio} ${v.vehiculo?.marca} ${v.vehiculo?.modelo}`,
      v.cliente?.nombre, `${v.empleado?.nombre || ''} ${v.empleado?.apellidos || ''}`,
      v.total, utilidadVeh(v), v.comision ?? 0,
    ]));
    const csv = filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'reporte-ventas.csv'; a.click();
  }

  return (
    <div>
      <h1>Reportes</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <SelectorSucursal value={sucursalId} onChange={setSucursalId} incluirTodas />
        <div><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>

      {ventas && (
        <>
          <div className="kpis">
            <div className="kpi"><h3>Monto vendido</h3><div className="valor">${ventas.totales.monto.toLocaleString('es-MX')}</div></div>
            <div className="kpi"><h3>Ventas</h3><div className="valor">{ventas.totales.cantidad}</div></div>
            <div className="kpi"><h3>Utilidad</h3><div className="valor">${ventas.totales.utilidad.toLocaleString('es-MX')}</div></div>
            {ventas.totales.comision !== undefined && (
              <div className="kpi"><h3>Comisiones</h3><div className="valor">${ventas.totales.comision.toLocaleString('es-MX')}</div></div>
            )}
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <h2 style={{ flex: 1 }}>Ventas</h2>
            <button className="btn btn-sm" onClick={exportarCSV}>Exportar CSV</button>
          </div>
          <table>
            <thead><tr><th>Folio</th><th>Fecha</th><th>Vehículo</th><th>Cliente</th><th>Vendedor</th><th>Total</th><th>Utilidad</th><th>Comisión</th></tr></thead>
            <tbody>{ventas.ventas.map((v) => (
              <tr key={v.id}>
                <td>{v.folio}</td><td>{new Date(v.fecha).toLocaleDateString('es-MX')}</td>
                <td>{v.vehiculo?.anio} {v.vehiculo?.marca} {v.vehiculo?.modelo}</td>
                <td>{v.cliente?.nombre}</td>
                <td>{v.empleado?.nombre} {v.empleado?.apellidos}</td>
                <td>${Number(v.total).toLocaleString('es-MX')}</td>
                <td>${utilidadVeh(v).toLocaleString('es-MX')}</td>
                <td>{v.comision !== undefined ? `$${Number(v.comision).toLocaleString('es-MX')}` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {inventario && (
        <>
          <h2 style={{ marginTop: 24 }}>Inventario</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            {Object.entries(inventario.porEstado).map(([estado, n]) => (
              <div className="kpi" key={estado} style={{ minWidth: 130 }}><h3>{estado}</h3><div className="valor">{n}</div></div>
            ))}
          </div>
          <table>
            <thead><tr><th>Vehículo</th><th>Sucursal</th><th>Estado</th><th>Días</th></tr></thead>
            <tbody>{inventario.vehiculos.map((v) => (
              <tr key={v.id}><td>{v.anio} {v.marca} {v.modelo}</td><td>{v.sucursal?.nombre}</td><td>{v.estado}</td><td>{v.dias}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
