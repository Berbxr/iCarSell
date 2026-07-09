import { useEffect, useState } from 'react';
import api from '../api/client';
import GraficaBarras from '../components/GraficaBarras';
import SelectorSucursal from '../components/SelectorSucursal';
import Bienvenida from '../components/Bienvenida';
import { useAuth } from '../context/AuthContext';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX');
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const etiquetaMes = (clave) => MESES[Number(clave.slice(5)) - 1] || clave;

export default function Dashboard() {
  const { usuario } = useAuth();
  const [data, setData] = useState(null);
  const [sucursalId, setSucursalId] = useState(undefined);
  const esAdmin = usuario.rol === 'ADMIN';

  useEffect(() => {
    if (!esAdmin) return; // el vendedor no consulta cifras de ventas
    const q = sucursalId ? `?sucursalId=${sucursalId}` : '';
    api.get(`/dashboard${q}`).then((r) => setData(r.data));
  }, [sucursalId, esAdmin]);

  // Los vendedores ven una pantalla de bienvenida del negocio, sin cifras de ventas.
  if (!esAdmin) return <Bienvenida usuario={usuario} />;

  if (!data) return <p>Cargando…</p>;

  const u = data.ultimaVenta;

  return (
    <div>
      <Bienvenida usuario={usuario} mostrarAccesos={false} />
      <div className="row" style={{ marginBottom: 14 }}>
        <SelectorSucursal value={sucursalId} onChange={setSucursalId} incluirTodas />
      </div>

      <div className="kpis">
        <div className="kpi">
          <h3>Ventas de la semana</h3>
          <div className="valor">{money(data.ventasSemana.monto)} <span style={{ fontSize: 13, color: 'var(--muted)' }}>USD</span></div>
          <div className="sub">{data.ventasSemana.cantidad} venta(s)</div>
        </div>
        <div className="kpi">
          <h3>Ventas del mes</h3>
          <div className="valor">{money(data.ventasMes.monto)} <span style={{ fontSize: 13, color: 'var(--muted)' }}>USD</span></div>
          <div className="sub">{data.ventasMes.cantidad} venta(s)</div>
        </div>
        <div className="kpi">
          <h3>Último auto vendido</h3>
          {u ? (
            <>
              <div className="valor" style={{ fontSize: 18 }}>{u.vehiculo?.anio} {u.vehiculo?.marca} {u.vehiculo?.modelo}</div>
              <div className="sub">{u.folio} · {money(u.total)} · {new Date(u.fecha).toLocaleDateString('es-MX')}</div>
              <div className="sub">Cliente: {u.cliente?.nombre} · Vendió: {u.empleado ? `${u.empleado.nombre} ${u.empleado.apellidos}` : '—'}</div>
            </>
          ) : <div className="sub">Aún no hay ventas.</div>}
        </div>
      </div>

      <h3 style={{ marginTop: 8 }}>Finanzas del mes</h3>
      <div className="kpis">
        <div className="kpi">
          <h3>Utilidad del mes</h3>
          <div className="valor">{money(data.utilidadMesUsd)} <span style={{ fontSize: 13, color: 'var(--muted)' }}>USD</span></div>
          <div className="sub">{money(data.utilidadMesMxn)} MXN</div>
        </div>
        <div className="kpi">
          <h3>Gastos del mes</h3>
          <div className="valor">{money(data.gastosMes)} <span style={{ fontSize: 13, color: 'var(--muted)' }}>MXN</span></div>
          <div className="sub">Comisiones: {money(data.comisionesMes)} MXN</div>
        </div>
        <div className="kpi">
          <h3>Utilidad neta del mes</h3>
          <div className="valor" style={{ color: data.utilidadNetaMxn >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{money(data.utilidadNetaMxn)} <span style={{ fontSize: 13, color: 'var(--muted)' }}>MXN</span></div>
          <div className="sub">Utilidad − gastos − comisiones</div>
        </div>
        <div className="kpi">
          <h3>Cobro del mes (USD)</h3>
          <div className="valor" style={{ fontSize: 18 }}>Efectivo: {money(data.efectivoMes)}</div>
          <div className="sub">Transferencia: {money(data.transferenciaMes)}</div>
        </div>
      </div>

      <div className="kpis">
        {Object.entries(data.inventarioEstados || {}).map(([estado, n]) => (
          <div className="kpi" key={estado} style={{ minWidth: 130 }}><h3>Inventario · {estado}</h3><div className="valor">{n}</div></div>
        ))}
      </div>

      <div className="dash-cols">
        <div className="card">
          <h3>Ventas de los últimos 6 meses</h3>
          <div style={{ maxWidth: 460 }}>
            <GraficaBarras datos={data.ventas6Meses.map((m) => ({ etiqueta: etiquetaMes(m.mes), valor: m.monto }))} />
          </div>
          <div className="row" style={{ gap: 18, marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            {data.ventas6Meses.map((m) => (
              <span key={m.mes}>{etiquetaMes(m.mes)}: <b style={{ color: 'var(--text)' }}>{m.cantidad}</b> venta(s)</span>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Ventas por empleado (últimos 6 meses)</h3>
          <div className="tabla-wrap">
          <table>
            <thead><tr><th>Empleado</th><th>Ventas</th><th>Monto</th></tr></thead>
            <tbody>
              {data.ventasPorEmpleado.map((e) => (
                <tr key={e.empleadoId}><td data-label="Empleado">{e.nombre}</td><td data-label="Ventas">{e.cantidad}</td><td data-label="Monto">{money(e.monto)}</td></tr>
              ))}
              {data.ventasPorEmpleado.length === 0 && <tr><td colSpan="3" style={{ color: 'var(--muted)' }}>Sin ventas en el periodo.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Ganancia por socio (este mes)</h3>
        <div className="tabla-wrap">
        <table>
          <thead><tr><th>Socio</th><th>Ganancia USD</th><th>Ganancia MXN</th></tr></thead>
          <tbody>
            {(data.gananciaPorSocio || []).map((s) => (
              <tr key={s.socioId}><td data-label="Socio">{s.nombre}</td><td data-label="Ganancia USD">{money(s.totalUsd)}</td><td data-label="Ganancia MXN">{money(s.totalMxn)}</td></tr>
            ))}
            {(!data.gananciaPorSocio || data.gananciaPorSocio.length === 0) && <tr><td colSpan="3" style={{ color: 'var(--muted)' }}>Sin ventas este mes.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      <div className="card">
        <h3>Autos con mayor antigüedad en inventario</h3>
        <div className="tabla-wrap">
        <table>
          <thead><tr><th>Vehículo</th><th>Sucursal</th><th>Días en inventario</th></tr></thead>
          <tbody>{data.antiguedad.map((v) => (
            <tr key={v.id} className={v.enAlerta ? 'alerta' : ''}>
              <td data-label="Vehículo">{v.anio} {v.marca} {v.modelo}</td>
              <td data-label="Sucursal">{v.sucursal?.nombre}</td>
              <td data-label="Días en inventario">{v.dias}{v.enAlerta ? ' ⚠' : ''}</td>
            </tr>
          ))}
          {data.antiguedad.length === 0 && <tr><td colSpan="3" style={{ color: 'var(--muted)' }}>Sin vehículos disponibles.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
