import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const HOY = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function Bienvenida({ usuario, mostrarAccesos = true }) {
  const navigate = useNavigate();
  const nombre = usuario?.empleado?.nombre || usuario?.username || 'Vendedor';

  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const saludo = ahora.getHours() < 12 ? 'Buenos días' : ahora.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const reloj = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const [sucursal, setSucursal] = useState(null);
  useEffect(() => {
    if (usuario?.sucursalId) api.get(`/sucursales/${usuario.sucursalId}`).then((r) => setSucursal(r.data.nombre)).catch(() => {});
  }, [usuario?.sucursalId]);

  return (
    <div>
      <div className="hero">
        <div className="hero-info">
          <div className="hero-marca">Empalme <span>Motors</span></div>
          <h1 className="hero-titulo">{saludo}, {nombre}.</h1>
          {sucursal && <div className="hero-sucursal">📍 Sucursal {sucursal}</div>}
          <p className="hero-sub">{HOY[0].toUpperCase() + HOY.slice(1)}</p>
          <div className="hero-reloj">🕐 {reloj}</div>
          <p className="hero-msg">Que tengas un excelente día de ventas. Aquí tienes tus accesos rápidos.</p>
        </div>
        <svg className="hero-auto" viewBox="0 0 220 90" aria-hidden="true">
          <path d="M12 62 q4 -22 24 -24 l44 -4 q14 -14 38 -14 q26 0 40 18 l28 4 q14 2 16 18 l0 8 q0 4 -6 4 l-184 0 q-6 0 -6 -6 z" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.5)" strokeWidth="2"/>
          <circle cx="62" cy="68" r="13" fill="#0f172a" stroke="#fff" strokeWidth="3"/>
          <circle cx="160" cy="68" r="13" fill="#0f172a" stroke="#fff" strokeWidth="3"/>
          <path d="M88 22 q10 -8 28 -8 q18 0 28 12 l-4 10 l-52 0 z" fill="rgba(255,255,255,.3)"/>
        </svg>
      </div>

      {mostrarAccesos && (
        <div className="accesos">
          <button className="acceso" onClick={() => navigate('/ventas')}>
            <span className="acceso-ic">🧾</span>
            <span className="acceso-t">Registrar venta</span>
            <span className="acceso-d">Genera el contrato de compra-venta</span>
          </button>
          <button className="acceso" onClick={() => navigate('/inventario')}>
            <span className="acceso-ic">🚗</span>
            <span className="acceso-t">Ver inventario</span>
            <span className="acceso-d">Autos disponibles de tu sucursal</span>
          </button>
          <button className="acceso" onClick={() => navigate('/clientes')}>
            <span className="acceso-ic">👤</span>
            <span className="acceso-t">Clientes</span>
            <span className="acceso-d">Consulta y registra compradores</span>
          </button>
        </div>
      )}
    </div>
  );
}
