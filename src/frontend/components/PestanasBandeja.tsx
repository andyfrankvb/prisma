/**
 * PestanasBandeja — separar «todo lo del área» de «lo que me toca hacer».
 *
 * La bandeja mostraba una sola lista con todo lo dirigido al área: lo que acaba
 * de entrar, lo que está redactando el jurídico, lo aprobado y lo firmado de
 * meses atrás. Ver el histórico completo es necesario, pero ahí adentro lo
 * pendiente se pierde y nadie sabe qué le falta por hacer.
 *
 * Las dos pestañas leen la misma lista; la segunda solo pide al servidor los
 * oficios donde el usuario puede dar el siguiente paso. El conteo también lo
 * calcula el servidor sobre todo lo que la persona alcanza a ver, no sobre la
 * página cargada: un número que solo cuenta parte sería peor que no ponerlo.
 */
import React from 'react';
import { theme } from '../theme';

/** Qué hacer en cada paso, dicho como lo diría quien lo va a hacer. */
export const PASO_LABEL: Record<string, string> = {
  ASIGNAR:     'Asignar',
  REDACTAR:    'Redactar',
  VISTO_BUENO: 'Visto bueno',
  FIRMAR:      'Firmar',
};

const PASO_COLOR: Record<string, { bg: string; text: string }> = {
  ASIGNAR:     { bg: '#FEF3C7', text: '#92400E' },
  REDACTAR:    { bg: '#DBEAFE', text: '#1E40AF' },
  VISTO_BUENO: { bg: '#D1FAE5', text: '#065F46' },
  FIRMAR:      { bg: '#FDE8EF', text: '#9F2241' },
};

/** Chip que dice qué paso toca, para la columna de la pestaña «Mi bandeja». */
export const PasoChip: React.FC<{ paso?: string | null }> = ({ paso }) => {
  if (!paso) return null;
  const c = PASO_COLOR[paso] ?? { bg: '#EDE9E4', text: '#3D3935' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: '10px',
      fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap',
      backgroundColor: c.bg, color: c.text,
    }}>
      {PASO_LABEL[paso] ?? paso}
    </span>
  );
};

/**
 * Cuántos oficios hay en total, para la pestaña «Todo».
 *
 * No se puede usar `meta.total` porque ése ya viene filtrado por la pestaña
 * activa: estando en «Mi bandeja» diría lo mismo en las tres. Los conteos por
 * estatus, en cambio, se calculan antes de ese filtro, así que su suma es el
 * universo completo.
 */
export function totalDeConteos(conteos: Record<string, number>): number {
  return Object.values(conteos).reduce((suma, n) => suma + n, 0);
}

/**
 * Las tres formas de mirar la misma bandeja:
 *   · todo         — el histórico completo del área, sin filtrar.
 *   · mia          — solo lo que espera una acción del usuario.
 *   · finalizados  — el archivo: lo ya firmado y cerrado.
 *   · otras_areas  — lo que llegó de otra área: los delegatorios que le pidieron
 *                    a la mía, y los oficios que le turnaron.
 */
export type VistaBandeja = 'todo' | 'mia' | 'finalizados' | 'otras_areas';

export const PestanasBandeja: React.FC<{
  vista:            VistaBandeja;
  onCambiar:        (vista: VistaBandeja) => void;
  totalTodo:        number;
  totalMia:         number;
  totalFinalizados: number;
  /** Se omite la pestaña cuando la vista no recibe trabajo de otras áreas. */
  totalOtrasAreas?: number | null;
}> = ({ vista, onCambiar, totalTodo, totalMia, totalFinalizados, totalOtrasAreas }) => (
  // La línea del contenedor es la que la pestaña activa rompe para «abrirse»
  // hacia el contenido: por eso vive aquí y no en cada pestaña.
  <div
    role="tablist"
    style={{
      display: 'flex', flexWrap: 'wrap', margin: '0 24px',
      borderBottom: `1px solid ${theme.colors.border}`,
    }}
  >
    <Pestana activa={vista === 'todo'} onClick={() => onCambiar('todo')}
             texto="Todo" cuenta={totalTodo} />
    <Pestana activa={vista === 'mia'} onClick={() => onCambiar('mia')}
             texto="Mi bandeja" cuenta={totalMia} destacar />
    <Pestana activa={vista === 'finalizados'} onClick={() => onCambiar('finalizados')}
             texto="Finalizados" cuenta={totalFinalizados} />
    {totalOtrasAreas !== null && totalOtrasAreas !== undefined && (
      <Pestana activa={vista === 'otras_areas'} onClick={() => onCambiar('otras_areas')}
               texto="De otras áreas" cuenta={totalOtrasAreas} destacar />
    )}
  </div>
);

const Pestana: React.FC<{
  activa: boolean; onClick: () => void; texto: string; cuenta: number; destacar?: boolean;
}> = ({ activa, onClick, texto, cuenta, destacar }) => (
  <button
    type="button"
    onClick={onClick}
    role="tab"
    aria-selected={activa}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
      minWidth: '120px', padding: '6px 16px', cursor: 'pointer',
      fontFamily: theme.font.family, fontSize: '0.76rem',
      // La activa se distingue por peso y color, no por un subrayado: el corte
      // en la línea de abajo ya dice cuál es.
      fontWeight: activa ? 700 : 500,
      color: activa ? theme.colors.primary : theme.colors.textSecondary,
      backgroundColor: activa ? theme.colors.surface : theme.colors.background,
      border: `1px solid ${theme.colors.border}`,
      // Se monta un pixel sobre la línea del contenedor. La activa la tapa con
      // su propio fondo —ahí queda el hueco—; las demás la dejan ver.
      marginBottom: '-1px',
      borderBottomColor: activa ? theme.colors.surface : theme.colors.border,
      // Sin doble línea entre pestañas contiguas.
      borderLeftWidth: '1px',
      marginLeft: '-1px',
      borderRadius: '7px 7px 0 0',
    }}
  >
    {texto}
    <span style={{
      padding: '0 7px', borderRadius: '9px', fontSize: '0.66rem', fontWeight: 700,
      // Lo pendiente se resalta aunque la pestaña esté cerrada: es el número que
      // la persona necesita ver al entrar, sin tener que cambiar de pestaña.
      backgroundColor: destacar && cuenta > 0 ? theme.colors.primary : '#EDE9E4',
      color:           destacar && cuenta > 0 ? '#fff' : theme.colors.textSecondary,
    }}>
      {cuenta}
    </span>
  </button>
);
