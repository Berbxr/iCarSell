import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SelectorSucursal({ value, onChange, incluirTodas = false }) {
  const { usuario } = useAuth();
  const [sucursales, setSucursales] = useState([]);

  useEffect(() => { api.get('/sucursales?activo=true').then((r) => setSucursales(r.data)).catch(() => {}); }, []);

  if (usuario.rol !== 'ADMIN') return null; // el vendedor opera solo su sucursal

  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
      {incluirTodas ? <option value="">Todas las sucursales</option> : <option value="">Seleccione sucursal…</option>}
      {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
  );
}
