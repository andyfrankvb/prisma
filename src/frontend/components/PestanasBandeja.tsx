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
 * La pestaña fijada como vista de inicio, recordada entre sesiones.
 *
 * Se guarda por usuario y no a secas: en la oficina se comparten computadoras, y
 * un ajuste suelto haría que quien entrara después arrancara en la pestaña de
 * alguien más. Vive en el navegador, así que sobrevive a cerrar sesión y a
 * apagar el equipo; si la persona entra desde otra máquina, ahí elige la suya.
 *
 * Todo lo que toca el almacenamiento va con `try`: en ventanas privadas o con
 * las cookies bloqueadas, leerlo o escribirlo lanza excepción, y el módulo no
 * puede dejar de abrir por eso.
 */
const CLAVE_FIJADA = 'prisma.oficios.vistaFijada';

export function leerVistaFijada(usuarioId?: number | null): VistaBandeja | null {
  if (!usuarioId) return null;
  try {
    const v = localStorage.getItem(`${CLAVE_FIJADA}.${usuarioId}`);
    return (['todo', 'mia', 'finalizados', 'otras_areas'] as const).includes(v as any)
      ? (v as VistaBandeja)
      : null;
  } catch { return null; }
}

/** Fija una pestaña; volver a pulsar la misma la suelta. Devuelve cómo quedó. */
export function alternarVistaFijada(
  usuarioId: number | null | undefined, vista: VistaBandeja, actual: VistaBandeja | null,
): VistaBandeja | null {
  const nueva = actual === vista ? null : vista;
  if (!usuarioId) return nueva;
  try {
    const clave = `${CLAVE_FIJADA}.${usuarioId}`;
    if (nueva) localStorage.setItem(clave, nueva);
    else       localStorage.removeItem(clave);
  } catch { /* sin almacenamiento, la elección dura lo que la sesión */ }
  return nueva;
}

/**
 * Las cuatro formas de mirar la misma bandeja:
 *   · todo         — el histórico completo del área, sin filtrar.
 *   · mia          — solo lo que espera una acción del usuario.
 *   · finalizados  — el archivo: lo ya firmado y cerrado.
 *   · otras_areas  — lo que llegó de otra área: los delegatorios que le pidieron
 *                    a la mía, y los oficios que le turnaron.
 *
 * Los identificadores no cambian aunque cambien los rótulos: van en la URL y en
 * la consulta, así que renombrarlos rompería los enlaces guardados sin ganar
 * nada. El nombre visible se decide abajo.
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
  /** Cuál queda fijada como vista de inicio. Nula si ninguna. */
  fijada?: VistaBandeja | null;
  /** Fijar o soltar. Sin esto no se dibujan los alfileres. */
  onFijar?: (vista: VistaBandeja) => void;
}> = ({ vista, onCambiar, totalTodo, totalMia, totalFinalizados, totalOtrasAreas, fijada, onFijar }) => (
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
             texto="Recepción" cuenta={totalTodo}
             fijada={fijada === 'todo'} onFijar={onFijar && (() => onFijar('todo'))} />
    <Pestana activa={vista === 'mia'} onClick={() => onCambiar('mia')}
             texto="Mi bandeja" cuenta={totalMia} destacar
             fijada={fijada === 'mia'} onFijar={onFijar && (() => onFijar('mia'))} />
    <Pestana activa={vista === 'finalizados'} onClick={() => onCambiar('finalizados')}
             texto="Finalizados" cuenta={totalFinalizados}
             fijada={fijada === 'finalizados'} onFijar={onFijar && (() => onFijar('finalizados'))} />
    {totalOtrasAreas !== null && totalOtrasAreas !== undefined && (
      // «Turnados» y no «Asignados»: asignar es lo que hace el encargado con su
      // propio equipo, y usar la misma palabra aquí haría creer que son oficios
      // repartidos dentro del área. Estos llegaron de fuera, no venían dirigidos
      // a nadie de aquí, y turnar es la palabra con la que se mandan.
      <Pestana activa={vista === 'otras_areas'} onClick={() => onCambiar('otras_areas')}
               texto="Turnados" cuenta={totalOtrasAreas} destacar
               fijada={fijada === 'otras_areas'} onFijar={onFijar && (() => onFijar('otras_areas'))} />
    )}
  </div>
);

/**
 * El alfiler que fija una pestaña como la de arranque.
 *
 * Dibujado y no un emoji: los emojis cambian de forma según el sistema y aquí
 * tiene que leerse igual en todas las máquinas de la oficina. Se muestra tenue
 * mientras no esté fijada, para que se note que se puede usar sin competir con
 * el nombre de la pestaña.
 */
const Alfiler: React.FC<{ fijada: boolean; onClick: (e: React.MouseEvent) => void }> = ({ fijada, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={fijada ? 'Quitar como vista de inicio' : 'Fijar como vista de inicio'}
    aria-label={fijada ? 'Quitar como vista de inicio' : 'Fijar como vista de inicio'}
    aria-pressed={fijada}
    style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px', margin: '0 -2px 0 1px',
      border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 0,
      color: fijada ? theme.colors.primary : theme.colors.textSecondary,
      opacity: fijada ? 1 : 0.35,
    }}
  >
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"
         fill={fijada ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 10.8V4h6v6.8l2.5 3.2H6.5L9 10.8Z" />
    </svg>
  </button>
);

const Pestana: React.FC<{
  activa: boolean; onClick: () => void; texto: string; cuenta: number; destacar?: boolean;
  fijada?: boolean;
  onFijar?: () => void;
}> = ({ activa, onClick, texto, cuenta, destacar, fijada = false, onFijar }) => (
  // Contenedor y no <button>: dentro va el alfiler, que también se puede pulsar,
  // y un botón no puede contener otro botón.
  <div
    onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    role="tab"
    tabIndex={0}
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
      userSelect: 'none',
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
    {onFijar && (
      // `stopPropagation` para que fijar no cambie además de pestaña: son dos
      // intenciones distintas y la persona puede querer fijar una sin abrirla.
      <Alfiler fijada={fijada} onClick={(e) => { e.stopPropagation(); onFijar(); }} />
    )}
  </div>
);
