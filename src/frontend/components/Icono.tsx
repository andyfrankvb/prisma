/**
 * Component: Icono — biblioteca única de íconos de línea
 * File: src/frontend/components/Icono.tsx
 *
 * Sustituye a los emoticones que había repartidos por la interfaz. El motivo no
 * es sólo estético: cada sistema operativo dibuja los emoticones a su manera, así
 * que la misma pantalla se veía distinta en Windows, Mac y Android, y su color
 * propio competía con el de la paleta institucional.
 *
 * Todos comparten el mismo trazo (1.8, extremos redondeados, lienzo de 24×24) para
 * que la interfaz se lea como un solo sistema. El color se hereda del texto por
 * omisión (`currentColor`), así que un ícono dentro de un enlace guinda sale
 * guinda sin configurar nada; para destacarlo se pasa `color`.
 *
 * Uso:
 *   <Icono nombre="alerta" />
 *   <Icono nombre="descargar" size={14} color={theme.colors.gold} />
 */

import React from 'react';

export type NombreIcono =
  | 'alerta' | 'check' | 'checkCirculo' | 'tache' | 'cerrar'
  | 'calendario' | 'reloj' | 'campana' | 'comentario' | 'persona' | 'personas'
  | 'buscar' | 'filtro' | 'refrescar' | 'candado' | 'mas' | 'lista'
  | 'documento' | 'carpeta' | 'descargar' | 'subir' | 'ojo' | 'editar'
  | 'papelera' | 'engranaje' | 'correo' | 'edificio' | 'etiqueta'
  | 'informacion' | 'grafica' | 'tendenciaBaja' | 'regresarIzq' | 'regresarDer'
  | 'flechaIzq' | 'flechaDer' | 'enviar' | 'historial';

/** Trazos de cada ícono, sobre un lienzo de 24×24. */
const TRAZOS: Record<NombreIcono, React.ReactNode> = {
  alerta:        <><path d="M12 3 22 20H2Z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17" x2="12" y2="17" /></>,
  check:         <polyline points="20 6 9 17 4 12" />,
  checkCirculo:  <><circle cx="12" cy="12" r="9" /><polyline points="16.5 9 10.5 15.5 7.5 12.5" /></>,
  tache:         <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  cerrar:        <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,

  calendario:    <><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></>,
  reloj:         <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  historial:     <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /><polyline points="12 7 12 12 15 14" /></>,
  campana:       <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  comentario:    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,

  persona:       <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  personas:      <><circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-3.5 3.2-5.5 7-5.5s7 2 7 5.5" /><path d="M16 6.2a3.5 3.5 0 0 1 0 6.6" /><path d="M18 15.6c2.4.6 4 2.3 4 4.4" /></>,

  buscar:        <><circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" /></>,
  filtro:        <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  refrescar:     <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><polyline points="21 3 21 9 15 9" /></>,
  candado:       <><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  mas:           <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  lista:         <><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="15" y2="16" /></>,

  documento:     <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><polyline points="14 3 14 8 19 8" /></>,
  carpeta:       <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  descargar:     <><path d="M12 3v12" /><polyline points="7 11 12 16 17 11" /><path d="M4 20h16" /></>,
  subir:         <><path d="M12 20V8" /><polyline points="7 12 12 7 17 12" /><path d="M4 4h16" /></>,
  ojo:           <><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  editar:        <><path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16z" /><line x1="14.5" y1="5.5" x2="18.5" y2="9.5" /></>,
  papelera:      <><polyline points="4 7 20 7" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>,
  engranaje:     <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
  correo:        <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>,
  enviar:        <><path d="M21 3 3 10.5l7 3 3 7z" /><line x1="21" y1="3" x2="10" y2="13.5" /></>,
  edificio:      <><rect x="4" y="3" width="16" height="18" rx="1.5" /><line x1="9" y1="7" x2="9" y2="7" /><line x1="15" y1="7" x2="15" y2="7" /><line x1="9" y1="11" x2="9" y2="11" /><line x1="15" y1="11" x2="15" y2="11" /><path d="M10 21v-4h4v4" /></>,
  etiqueta:      <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" /><line x1="7.5" y1="7.5" x2="7.5" y2="7.5" /></>,
  informacion:   <><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12" y2="8" /></>,
  grafica:       <><line x1="4" y1="20" x2="20" y2="20" /><rect x="6" y="12" width="3" height="6" /><rect x="11" y="8" width="3" height="10" /><rect x="16" y="4" width="3" height="14" /></>,
  tendenciaBaja: <><polyline points="3 7 9 13 13 9 21 17" /><polyline points="21 12 21 17 16 17" /></>,

  regresarIzq:   <><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></>,
  regresarDer:   <><polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></>,
  flechaIzq:     <><line x1="20" y1="12" x2="4" y2="12" /><polyline points="10 6 4 12 10 18" /></>,
  flechaDer:     <><line x1="4" y1="12" x2="20" y2="12" /><polyline points="14 6 20 12 14 18" /></>,
};

interface Props {
  nombre: NombreIcono;
  /** Lado en píxeles. 16 por omisión, que es lo que pide el texto corrido. */
  size?: number;
  /** Por omisión hereda el color del texto. */
  color?: string;
  strokeWidth?: number;
  /**
   * Texto alternativo. Si se omite, el ícono queda oculto a los lectores de
   * pantalla — que es lo correcto cuando va acompañado de una etiqueta visible.
   */
  title?: string;
  /**
   * Para usarlo dentro de texto corrido, donde antes iba un emoticón
   * (`⚠ {error}`). Lo alinea con la línea base en vez de romper el renglón.
   */
  inline?: boolean;
  style?: React.CSSProperties;
}

export const Icono: React.FC<Props> = ({ nombre, size = 16, color, strokeWidth = 1.8, title, inline, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color ?? 'currentColor'}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    style={
      inline
        ? { flexShrink: 0, display: 'inline-block', verticalAlign: '-0.16em', marginRight: '0.34em', ...style }
        : { flexShrink: 0, display: 'block', ...style }
    }
  >
    {title && <title>{title}</title>}
    {TRAZOS[nombre]}
  </svg>
);

export default Icono;
