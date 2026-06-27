import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Auditoria() {
  const [lista, setLista] = useState([]);
  useEffect(() => { api.get('/auditoria').then((r) => setLista(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <h1>Auditoría</h1>
      <table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>ID</th></tr></thead>
        <tbody>{lista.map((a) => (
          <tr key={a.id}>
            <td>{new Date(a.fecha).toLocaleString('es-MX')}</td>
            <td>{a.usuarioId}</td><td>{a.accion}</td><td>{a.entidad}</td><td>{a.entidadId ?? '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
