import { createContext, useContext, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => {
    const raw = localStorage.getItem('icarsell_usuario');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('icarsell_token', data.token);
    localStorage.setItem('icarsell_usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
    return data.usuario;
  }

  function logout() {
    localStorage.removeItem('icarsell_token');
    localStorage.removeItem('icarsell_usuario');
    setUsuario(null);
  }

  function marcarPasswordCambiada() {
    const actualizado = { ...usuario, debeCambiarPassword: false };
    localStorage.setItem('icarsell_usuario', JSON.stringify(actualizado));
    setUsuario(actualizado);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, marcarPasswordCambiada }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
