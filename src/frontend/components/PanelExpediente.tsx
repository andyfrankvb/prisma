/**
 * PanelExpediente — la ventana donde se lee un oficio.
 * File: src/frontend/components/PanelExpediente.tsx
 *
 * Existe porque cada tablero mostraba el expediente a su manera: Gestión con una
 * tarjeta flotante a la derecha, Oficial con una columna de borde recto y
 * Jurídico con una ventana modal centrada. Tres tratamientos para lo mismo, y el
 * visor de documentos —que se coloca suponiendo el panel derecho— se encimaba en
 * el tablero que usaba modal.
 *
 * Ahora los tres usan este componente, así que la ventana se ve igual para todos
 * y el visor cae siempre en su sitio. Si mañana cambia el diseño, cambia aquí una
 * vez y no en tres lugares que se irían separando otra vez.
 *
 * Geometría, para que coincida con el visor de `OficioDetalle`:
 *   · Arranca en 70 = 58 px del encabezado de la aplicación + 12 de margen.
 *   · Termina 12 px antes del borde inferior y del derecho.
 *   · zIndex 1000: por debajo del visor (1100), para que al abrir un documento
 *     éste se monte encima y no al revés.
 *
 * En móvil se comporta como bloque a sangre: dos ventanas lado a lado no caben.
 */

import React from 'react';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';

interface Props {
  /** Folio del oficio: encabeza la ventana. */
  folio:     string;
  onClose:   () => void;
  children:  React.ReactNode;
}

export const PanelExpediente: React.FC<Props> = ({ folio, onClose, children }) => {
  const isMobile = useIsMobile();

  return (
    <div style={{
      position:        isMobile ? 'static' : 'fixed',
      top:             isMobile ? undefined : 70,
      bottom:          isMobile ? undefined : 12,
      right:           isMobile ? undefined : 12,
      width:           isMobile ? undefined : '45vw',
      maxWidth:        isMobile ? undefined : '760px',
      zIndex:          isMobile ? undefined : 1000,
      flex:            isMobile ? '1' : undefined,
      backgroundColor: theme.colors.surface,
      borderRadius:    isMobile ? 0 : '12px',
      boxShadow:       isMobile ? 'none' : '0 2px 8px rgba(61,57,53,0.10), 0 16px 44px rgba(61,57,53,0.24)',
      // El recorte vive aquí y el scroll en el div interior: juntos, la barra se
      // dibujaba sobre el canto y le comía la curva a la esquina.
      overflow:        'hidden',
      display:         'flex',
      flexDirection:   'column',
    }}>
      <div style={{
        flexShrink: 0, padding: '9px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        // Guinda oscuro 7421C, plano. El degradado que había antes iba del guinda
        // claro a éste, y el encabezado cambiaba de tono de un extremo a otro.
        backgroundColor: theme.colors.primaryDark,
      }}>
        <h2 style={{ margin: 0, color: '#fff', fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.02em' }}>
          {/* Sin «Detalle —»: la palabra no aportaba nada —ya se ve que es el
              detalle— y el guion separaba dos cosas que se leen mejor juntas. */}
          Solicitud {folio}
        </h2>
        <button
          onClick={onClose}
          aria-label="Cerrar detalle"
          style={{
            background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff',
            fontSize: '1.05rem', cursor: 'pointer', lineHeight: 1,
            width: '24px', height: '24px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.32)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
        >×</button>
      </div>

      <div style={{ padding: '20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
};

export default PanelExpediente;
