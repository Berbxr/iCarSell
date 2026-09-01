import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Auditoria() {
  const [lista, setLista] = useState([]);
  useEffect(() => { api.get('/auditoria').then((r) => setLista(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <h1>Auditoría</h1>
      <div className="tabla-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>ID</th></tr></thead>
        <tbody>{lista.map((a) => (
          <tr key={a.id}>
            <td data-label="Fecha">{new Date(a.fecha).toLocaleString('es-MX')}</td>
            <td data-label="Usuario">{a.usuarioId}</td><td data-label="Acción">{a.accion}</td><td data-label="Entidad">{a.entidad}</td><td data-label="ID">{a.entidadId ?? '—'}</td>
          </tr>
        ))}</tbody>
      </table>
      </div>
    </div>
  );
}
