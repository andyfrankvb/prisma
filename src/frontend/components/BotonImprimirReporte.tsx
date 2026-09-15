/**
 * Component: BotonImprimirReporte
 * File: src/frontend/components/BotonImprimirReporte.tsx
 *
 * Botón "Imprimir / PDF" para los reportes del Módulo de Reportes. Usa
 * `window.print()`: en todo navegador, "Guardar como PDF" es un destino más
 * del diálogo nativo de impresión, así que un solo botón cubre ambos casos
 * sin depender de una librería de generación de PDF en el cliente. El propio
 * botón lleva la clase `no-imprimir` para no aparecer en el papel.
 *
 * `onClick` es opcional: por defecto imprime de inmediato, pero un reporte
 * con secciones colapsables (ej. Reportes_SATQ) puede pasar un handler que
 * las abra antes de llamar a `window.print()`, para que el PDF salga
 * completo sin importar cómo esté la pantalla en ese momento.
 */

import React from 'react';
import { theme } from '../theme';

interface Props {
  onClick?: () => void;
}

export const BotonImprimirReporte: React.FC<Props> = ({ onClick }) => (
  <button
    onClick={onClick ?? (() => window.print())}
    className="no-imprimir"
    style={{
      background:   theme.colors.primary,
      border:       'none',
      color:        '#fff',
      padding:      '9px 16px',
      borderRadius: '10px',
      cursor:       'pointer',
      fontSize:     '0.85rem',
      fontWeight:   700,
      display:      'inline-flex',
      alignItems:   'center',
      gap:          '6px',
      whiteSpace:   'nowrap',
    }}
  >
    🖨️ Imprimir / PDF
  </button>
);
