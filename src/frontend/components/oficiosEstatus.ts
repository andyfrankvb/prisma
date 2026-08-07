/**
 * Configuración compartida de los estatus de oficios: color sólido (tarjeta/pill
 * activa), tinte + texto (pill inactiva) e ícono. Se usa en las tarjetas de
 * resumen (OficiosStatCards) y en las pills de FiltrosOficios para que las tres
 * vistas (Oficial, Gestión, Jurídico) se vean idénticas.
 *
 * Colores acordados: Recibido = rojo, En revisión = azul, Finalizado = verde;
 * los demás (Asignado, En reconsideración, VoBo) quedan en gris/negro (sin definir).
 */
export interface EstatusMeta {
  value: string;
  label: string;
  color: string;  // fondo sólido (tarjeta / pill activa)
  tint:  string;  // fondo tenue (pill inactiva)
  text:  string;  // texto (pill inactiva)
  icon:  string;
}

export const ESTATUS_META: EstatusMeta[] = [
  { value: 'RECIBIDO',           label: 'Recibido',           color: 'rgb(255,0,50)',  tint: '#FFE4EA', text: 'rgb(214,0,42)',  icon: '📥' },
  { value: 'ASIGNADO',           label: 'Asignado',           color: 'rgb(33,37,41)',  tint: '#E5E7EB', text: 'rgb(33,37,41)',  icon: '📌' },
  { value: 'EN_REVISION',        label: 'En Revisión',        color: 'rgb(0,122,255)', tint: '#E1EEFF', text: 'rgb(0,98,204)',  icon: '🔍' },
  { value: 'EN_RECONSIDERACION', label: 'En Reconsideración', color: 'rgb(33,37,41)',  tint: '#E5E7EB', text: 'rgb(33,37,41)',  icon: '🔁' },
  { value: 'VOBO_APROBADO',      label: 'VoBo Aprobado',      color: 'rgb(33,37,41)',  tint: '#E5E7EB', text: 'rgb(33,37,41)',  icon: '👍' },
  { value: 'FINALIZADO',         label: 'Finalizado',         color: 'rgb(52,199,89)', tint: '#E3F7EA', text: 'rgb(35,150,66)', icon: '✅' },
];

export const TOTAL_META = { color: 'rgb(33,37,41)', icon: '📄', label: 'Total' };
