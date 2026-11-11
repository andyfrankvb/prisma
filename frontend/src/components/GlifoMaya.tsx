/**
 * Component: GlifoMaya — ornamento de fondo
 * File: src/frontend/components/GlifoMaya.tsx
 *
 * Glifos mayas estilizados para usarse como fondo decorativo, en lugar de los
 * círculos genéricos que había antes. Recogen los rasgos que los identifican
 * —el cartucho redondeado de doble contorno y las volutas en espiral de la
 * base— sin pretender ser calcas de un glifo concreto.
 *
 * Van dibujados solo con trazo, sin relleno, para que a opacidad baja se lean
 * como una filigrana sobre el color y no como manchas que compitan con el texto.
 * El color se hereda (`currentColor`), así que el contenedor decide.
 */

import React from 'react';

export type VarianteGlifo = 'perfil' | 'ojo' | 'sol';

/**
 * Voluta en espiral: es el rasgo más reconocible de la base de estos glifos.
 * Se arma encadenando arcos de radio decreciente, que es como se dibuja una
 * espiral sin recurrir a datos de trazado interminables.
 */
const VOLUTA = 'M 46 4 a 22 22 0 1 1 -22 22 a 13 13 0 1 0 13 -13 a 6 6 0 1 1 6 6';

const CUERPOS: Record<VarianteGlifo, React.ReactNode> = {
  // Perfil con ojo y hocico — el de la primera referencia.
  perfil: (
    <>
      <ellipse cx="100" cy="86" rx="52" ry="44" />
      <circle cx="78" cy="74" r="13" />
      <path d="M124 62 q16 10 14 28 q-2 16 -16 22" />
      <path d="M60 108 q22 12 44 4" />
    </>
  ),
  // Óvalo con banda curva y tres trazos — la segunda referencia.
  ojo: (
    <>
      <rect x="56" y="42" width="88" height="80" rx="26" />
      <ellipse cx="100" cy="68" rx="24" ry="17" />
      <path d="M62 92 q20 -14 38 2 q18 16 38 -6" />
      <path d="M86 108 v16 M100 108 v16 M114 108 v16" />
    </>
  ),
  // Círculo radiado — la tercera referencia.
  sol: (
    <>
      <circle cx="100" cy="84" r="42" />
      <path d="M104 48 q14 4 12 20 q-2 14 -14 12" />
      <path d="M60 88 h80" />
      <path d="M84 92 v34 M100 92 v34 M116 92 v34" />
    </>
  ),
};

interface Props {
  variante?: VarianteGlifo;
  /** Lado en píxeles. */
  size?: number;
  /** Grosor del trazo, en unidades del lienzo (200×220). */
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export const GlifoMaya: React.FC<Props> = ({
  variante = 'perfil',
  size = 260,
  strokeWidth = 7,
  style,
}) => (
  <svg
    width={size}
    height={size * 1.1}
    viewBox="0 0 200 220"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: 'block', ...style }}
  >
    {/* Cartucho: doble contorno, el rasgo que enmarca todo glifo */}
    <rect x="14" y="6" width="172" height="156" rx="46" />
    <rect x="34" y="26" width="132" height="116" rx="32" strokeWidth={strokeWidth * 0.8} />

    {CUERPOS[variante]}

    {/* Base: voluta, bloque central, voluta reflejada */}
    <g transform="translate(20 164)">
      <path d={VOLUTA} />
    </g>
    <rect x="84" y="168" width="32" height="44" rx="10" strokeWidth={strokeWidth * 0.8} />
    <g transform="translate(180 164) scale(-1 1)">
      <path d={VOLUTA} />
    </g>
  </svg>
);

export default GlifoMaya;
