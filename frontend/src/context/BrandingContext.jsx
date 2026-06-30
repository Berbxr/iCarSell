import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const DEFAULT = { nombre: 'iCarSell', logo: null };
const BrandingContext = createContext({ ...DEFAULT, recargar: () => {} });

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT);

  const aplicar = useCallback((b) => {
    const limpio = { nombre: b.nombre || 'iCarSell', logo: b.logo || null };
    setBranding(limpio);
    document.title = `${limpio.nombre} — Gestión de venta de autos`;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = limpio.logo || '/logo.svg';
  }, []);

  const recargar = useCallback(() => {
    api.get('/configuracion/branding').then((r) => aplicar(r.data)).catch(() => {});
  }, [aplicar]);

  useEffect(() => { recargar(); }, [recargar]);

  return (
    <BrandingContext.Provider value={{ ...branding, recargar }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() { return useContext(BrandingContext); }
