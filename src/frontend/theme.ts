/**
 * Theme: Oficialía de Partes — Gobierno del Estado de Quintana Roo
 * Basado en el Toolkit Oficial 2022|2027
 *
 * Colores Pantone oficiales:
 *  1945C  → #AB0A3D  Guinda institucional (primario)
 *  7421C  → #440412  Guinda oscuro
 *  125C   → #B68400  Dorado
 *  Black7C→ #3D3935  Gris carbón
 *  401C   → #B0ABA1  Gris claro
 *
 * Tipografía: Montserrat (Black, Bold, Medium)
 */

export const theme = {
  colors: {
    primary:      '#AB0A3D',   // Pantone 1945C — guinda institucional
    primaryDark:  '#440412',   // Pantone 7421C — guinda oscuro
    primaryLight: '#C4174F',   // variante clara para hover
    gold:         '#B68400',   // Pantone 125C — dorado
    goldLight:    '#D4A017',   // dorado claro
    charcoal:     '#3D3935',   // Pantone Black 7C
    grayMid:      '#B0ABA1',   // Pantone 401C
    white:        '#FFFFFF',
    background:   '#F5F4F2',   // fondo cálido acorde al gris 401C
    surface:      '#FFFFFF',
    border:       '#E2DDD8',   // borde cálido
    textPrimary:  '#3D3935',   // Pantone Black 7C
    textSecondary:'#7A7570',
    alert: {
      red:    '#EF4444',
      yellow: '#F59E0B',
      green:  '#10B981',
    },
  },
  estatus: {
    RECIBIDO:            { bg: '#FDE8EF', text: '#AB0A3D', label: 'Recibido'            },
    ASIGNADO:            { bg: '#FEF3C7', text: '#92400E', label: 'Asignado'            },
    EN_REVISION:         { bg: '#FEF9E7', text: '#7D6608', label: 'En Revisión'         },
    EN_RECONSIDERACION:  { bg: '#FEE2E2', text: '#991B1B', label: 'En Reconsideración'  },
    VOBO_APROBADO:       { bg: '#D1FAE5', text: '#065F46', label: 'VoBo Aprobado'       },
    FINALIZADO:          { bg: '#EDE9E4', text: '#3D3935', label: 'Finalizado'          },
  },
  font: {
    family: "'Montserrat', 'Segoe UI', Arial, sans-serif",
    black:  '900',
    bold:   '700',
    medium: '500',
    regular:'400',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
  },
  shadow: {
    sm:  '0 1px 4px rgba(61,57,53,0.10)',
    md:  '0 4px 16px rgba(61,57,53,0.12)',
    lg:  '0 8px 32px rgba(61,57,53,0.16)',
  },
} as const;

export type EstatusOficio = keyof typeof theme.estatus;

/**
 * Fondo de las pantallas previas al tablero: acceso, selección de módulo, carga
 * y error.
 *
 * Usa el degradado radial que la hoja de marca define como elemento propio,
 * sobre la base de gris cálido 401C. Tres capas, de arriba hacia abajo:
 *
 *   1. Un halo guinda 1945C arriba al centro, que aporta la calidez.
 *   2. Un asentamiento en guinda oscuro 7421C abajo, que da profundidad y evita
 *      que el gris plano se lea apagado.
 *   3. La base 401C.
 *
 * El guinda va en opacidades bajas a propósito: si sube, compite con el guinda
 * de la tarjeta y con la propia marca PRISMA.
 *
 * Vive aquí y no en cada vista para que las cuatro pantallas cambien juntas.
 */
export const FONDO_INSTITUCIONAL = [
  'radial-gradient(115% 85% at 50% 8%, rgba(171,10,61,0.34) 0%, rgba(171,10,61,0.13) 40%, rgba(171,10,61,0) 70%)',
  'radial-gradient(120% 75% at 50% 108%, rgba(68,4,18,0.30) 0%, rgba(68,4,18,0) 62%)',
  theme.colors.grayMid,
].join(', ');
