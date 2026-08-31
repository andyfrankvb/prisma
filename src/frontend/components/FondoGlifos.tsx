/**
 * Component: FondoGlifos — filigrana de fondo de la aplicación
 * File: src/frontend/components/FondoGlifos.tsx
 *
 * Coloca glifos mayas muy tenues detrás del contenido, como hace el sistema del
 * RPPC con sus formas de fondo. No es una decoración suelta: da identidad a las
 * pantallas de trabajo, que de otro modo son tablas sobre gris plano.
 *
 * Tres decisiones que lo mantienen fuera del camino:
 *
 *   · Va FIJO al viewport, no dentro del scroll. Si se desplazara con la lista,
 *     el dibujo pasaría por detrás del texto y distraería en cada scroll.
 *   · `pointerEvents: none` — no intercepta ni un clic.
 *   · Gris carbón al 10 %: se percibe con claridad en los márgenes sin competir
 *     con una tabla. Las tarjetas blancas lo tapan, así que solo asoma alrededor
 *     del contenido, que es donde se busca el efecto.
 */

import React from 'react';
import { theme } from '../theme';
import { GlifoMaya } from './GlifoMaya';
import type { VarianteGlifo } from './GlifoMaya';

/** Posiciones fijas, no aleatorias: así la pantalla se ve igual en cada visita. */
const PIEZAS: {
  variante: VarianteGlifo;
  size: number;
  style: React.CSSProperties;
}[] = [
  { variante: 'perfil', size: 720, style: { top: '-180px',   right: '-220px' } },
  { variante: 'ojo',    size: 640, style: { bottom: '-210px', left: '-190px' } },
  { variante: 'sol',    size: 560, style: { top: '34%',       left: '30%'    } },
  { variante: 'ojo',    size: 480, style: { top: '-120px',    left: '10%'    } },
  { variante: 'perfil', size: 600, style: { bottom: '-160px', right: '22%'   } },
  { variante: 'sol',    size: 420, style: { top: '58%',       right: '-140px' } },
];

export const FondoGlifos: React.FC = () => (
  <div
    aria-hidden="true"
    style={{
      position:      'fixed',
      inset:         0,
      // Detrás de todo (-1) y no delante (0). Con 0 había que elevar el
      // contenido, y eso convertía a <main> en un contexto de apilamiento que
      // encerraba a sus elementos fijos: el visor a pantalla completa pedía
      // zIndex 1200 y aun así quedaba por debajo del encabezado.
      zIndex:        -1,
      // El color de fondo se pinta aquí, no en el contenedor de la aplicación:
      // desde detrás, cualquier fondo opaco por delante taparía la filigrana.
      backgroundColor: theme.colors.background,
      pointerEvents: 'none',
      overflow:      'hidden',
      // Gris carbón Black 7C al 10 %: se percibe con claridad sobre el fondo
      // cálido sin teñir la pantalla, cosa que el guinda sí hacía.
      color:         'rgba(61,57,53,0.10)',
    }}
  >
    {PIEZAS.map((p, i) => (
      <div key={i} style={{ position: 'absolute', ...p.style }}>
        {/* El trazo baja a 3.5: a este tamaño, el grosor anterior engordaba y
            las líneas empezaban a leerse como manchas en vez de filigrana. */}
        <GlifoMaya variante={p.variante} size={p.size} strokeWidth={3.5} />
      </div>
    ))}
  </div>
);

export default FondoGlifos;
