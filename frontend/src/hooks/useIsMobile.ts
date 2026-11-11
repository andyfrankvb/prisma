/**
 * Hook: useIsMobile
 * File: src/frontend/hooks/useIsMobile.ts
 *
 * Detecta si el viewport es de tamaño móvil. Como la app usa estilos en
 * línea (sin media queries), este hook permite aplicar estilos condicionales.
 *
 * Uso:
 *   const isMobile = useIsMobile();        // < 768px por defecto
 *   const isPhone  = useIsMobile(480);     // umbral personalizado
 */
import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
}
