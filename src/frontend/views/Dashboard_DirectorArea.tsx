/**
 * View: Dashboard_DirectorArea
 * Vista para directores de área: sus tareas asignadas y sus propios eventos.
 * File: src/frontend/views/Dashboard_DirectorArea.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { theme }   from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import type { TareaEvento, EstadoTarea, RegistroHistorial } from '../types';
import { SeccionEventos } from './SeccionEventos';
import { SeguimientoTarea } from '../components/SeguimientoTarea';
import { esAsistenteDG } from '../utils/asistentesDG';
import { textoCompresion } from '../utils/compresion';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

interface Comentario {
  id: number; tarea_id: number; contenido: string;
  creado_en: string; autor_id: number; autor_nombre: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

interface TareaConEvento extends TareaEvento { evento_titulo: string; }

/** 'propia' = asignada al usuario | 'revision_equipo' = equipo del director esperando su revisión */
type TipoTarea = 'propia' | 'revision_equipo';
interface TareaUnificada extends TareaConEvento { tipo: TipoTarea; }

type FiltroCategoria = 'todas' | 'en_proceso' | 'en_revision' | 'devueltas';

const ESTADO_CFG: Record<EstadoTarea, { bg: string; text: string; label: string }> = {
  PENDIENTE:      { bg: '#FEF3C7', text: '#92400E', label: 'Pendiente'      },
  EN_PROGRESO:    { bg: '#DBEAFE', text: '#1E40AF', label: 'En Progreso'    },
  COMPLETADA:     { bg: '#D1FAE5', text: '#065F46', label: 'Completada'     },
  FINALIZADO:     { bg: '#D1FAE5', text: '#065F46', label: 'Finalizado'     },
  EN_REVISION:    { bg: '#FEF3C7', text: '#92400E', label: 'En Revisión'    },
  EN_REVISION_DG: { bg: '#EDE9FE', text: '#5B21B6', label: 'En Revisión DG' },
  DEVUELTO:       { bg: '#FEE2E2', text: '#991B1B', label: 'Devuelto'       },
  DEVUELTO_DG:    { bg: '#FFEDD5', text: '#9A3412', label: 'Devuelto por DG' },
};

// EN_PROGRESO y DEVUELTO ya no avanzan directamente; abren el modal de revisión.
const SIGUIENTE_ESTADO: Partial<Record<EstadoTarea, { estado: EstadoTarea; label: string }>> = {
  PENDIENTE: { estado: 'EN_PROGRESO', label: 'Iniciar' },
};

// ── Configuración de filter pills ────────────────────────────

const FILTRO_PILLS: {
  key:   FiltroCategoria;
  label: string;
  bg:    string;
  text:  string;
  estados: EstadoTarea[];
}[] = [
  { key: 'todas',       label: 'Todas',       bg: '#F3F4F6', text: '#374151', estados: [] },
  { key: 'en_proceso',  label: 'En Proceso',  bg: '#DBEAFE', text: '#1E40AF', estados: ['PENDIENTE', 'EN_PROGRESO'] },
  { key: 'en_revision', label: 'En Revisión', bg: '#FEF3C7', text: '#92400E', estados: ['EN_REVISION', 'EN_REVISION_DG'] },
  { key: 'devueltas',   label: 'Devueltas',   bg: '#FEE2E2', text: '#991B1B', estados: ['DEVUELTO'] },
];

// ── Component principal ───────────────────────────────────────

export const Dashboard_DirectorArea: React.FC = () => {
  const { user } = useAuth();
  // Los asistentes de la DG (Fabian, Tania) actúan como directores/DG en eventos.
  const esDirector = user?.rol === 'DIRECTOR' || esAsistenteDG(user);
  const esDG = (user as any)?.unidad_tipo === 'DIRECCION_GENERAL';
  const isMobile = useIsMobile();
  const padX = isMobile ? '12px' : '32px';
  // Observador: usuario de Dirección General que NO es director ni asistente de la DG
  // (p. ej. otra secretaría). Ve los eventos en modo solo lectura.
  const esObservador = esDG && !esDirector;

  // El observador no tiene actividades propias → arranca en "Mis Eventos"
  const [seccion, setSeccion] = useState<'actividades' | 'eventos'>(esObservador ? 'eventos' : 'actividades');

  // Lista unificada: propias + revisión de equipo (director)
  const [actividades,  setActividades]  = useState<TareaUnificada[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [tareaErrors,  setTareaErrors]  = useState<Record<number, string>>({});
  const [advancing,    setAdvancing]    = useState<number | null>(null);

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>('todas');
  const [filtroEvento,    setFiltroEvento]    = useState<number | ''>('');

  // Carga unificada: una sola llamada para operativos; dos para directores
  const fetchActividades = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Tareas del usuario (asignadas a él o delegadas a él). Se clasifican:
      //   - Si YO soy el asignado pero la delegué a OTRO → la REVISO (revision_equipo)
      //   - Si la trabajo yo (asignada a mí sin delegar, o delegada A MÍ) → propia
      const propias = await apiFetch<{ data: TareaConEvento[] }>('/eventos/mis-tareas');
      const listaPropias: TareaUnificada[] = [];
      const listaRevisaDelegadas: TareaUnificada[] = [];
      for (const t of propias.data) {
        const yoAsignado    = (t as any).asignado_a_id === user?.id;
        const delegadaAOtro = !!(t as any).reasignado_a_id && (t as any).reasignado_a_id !== user?.id;
        if (yoAsignado && delegadaAOtro) {
          listaRevisaDelegadas.push({ ...t, tipo: 'revision_equipo' });
        } else {
          listaPropias.push({ ...t, tipo: 'propia' });
        }
      }

      // Tareas de revisión que le corresponden al usuario:
      //   - DG → solo EN_REVISION_DG (su cola de aprobación final, nivel 2)
      //   - Director de área → EN_REVISION / EN_REVISION_DG / DEVUELTO, pero SOLO de
      //     su propia unidad. Si es responsable de un evento ve las tareas de otras
      //     unidades en el detalle del evento (observador), NO aquí para autorizar.
      const miUnidad = user?.oficina_id;
      let listaEquipo: TareaUnificada[] = [];
      if (esDirector) {
        const estadosRevision = esDG
          ? ['EN_REVISION_DG']
          : ['EN_REVISION', 'EN_REVISION_DG', 'DEVUELTO'];
        const eventosRes = await apiFetch<{ data: any[] }>('/eventos');
        const abiertos   = eventosRes.data.filter((e: any) => e.estado === 'ABIERTO');
        await Promise.all(
          abiertos.map(async (ev: any) => {
            try {
              const det = await apiFetch<{ data: any }>(`/eventos/${ev.id}`);
              (det.data.tareas ?? [])
                .filter((t: any) => estadosRevision.includes(t.estado))
                // La DG revisa de todas las unidades; el director solo de la suya
                .filter((t: any) => esDG || t.asignado_unidad_id === miUnidad)
                .forEach((t: any) => {
                  // Evitar duplicar si ya está en propias o en las delegadas que reviso
                  const yaIncluida = listaPropias.some((p) => p.id === t.id)
                    || listaRevisaDelegadas.some((p) => p.id === t.id);
                  if (!yaIncluida) {
                    listaEquipo.push({ ...t, evento_titulo: ev.titulo, tipo: 'revision_equipo' });
                  }
                });
            } catch { /* ignorar errores individuales */ }
          }),
        );
      }

      // Ordenar: DEVUELTO primero, luego EN_REVISION, luego resto
      const orden: Partial<Record<EstadoTarea, number>> = { DEVUELTO: 0, EN_REVISION: 1, EN_REVISION_DG: 2 };
      const unificadas = [...listaPropias, ...listaRevisaDelegadas, ...listaEquipo];
      unificadas.sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9));

      setActividades(unificadas);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [esDirector, esDG]);

  useEffect(() => { fetchActividades(); }, [fetchActividades]);

  const handleAvanzar = async (tarea: TareaConEvento) => {
    const siguiente = SIGUIENTE_ESTADO[tarea.estado];
    if (!siguiente) return;
    setAdvancing(tarea.id);
    setTareaErrors((prev) => { const n = { ...prev }; delete n[tarea.id]; return n; });
    try {
      const res = await apiFetch<{ data: TareaConEvento }>(
        `/eventos/${tarea.evento_id}/tareas/${tarea.id}/estado`,
        { method: 'PATCH', body: JSON.stringify({ estado: siguiente.estado }) },
      );
      setActividades((prev) => prev.map((t) => t.id === tarea.id ? { ...t, ...res.data } : t));
    } catch (err: any) {
      setTareaErrors((prev) => ({ ...prev, [tarea.id]: err.message }));
    } finally { setAdvancing(null); }
  };

  // Conteos para los pills — respeta también el filtro de evento activo
  const conteoPorCategoria = (cat: FiltroCategoria) => {
    const base = filtroEvento
      ? actividades.filter((t) => t.evento_id === filtroEvento)
      : actividades;
    if (cat === 'todas') return base.length;
    const pill = FILTRO_PILLS.find((p) => p.key === cat)!;
    return base.filter((t) => pill.estados.includes(t.estado as EstadoTarea)).length;
  };

  // Filtrado combinado: pills + evento
  const actividadesFiltradas = actividades.filter((t) => {
    if (filtroEvento && t.evento_id !== filtroEvento) return false;
    if (filtroCategoria !== 'todas') {
      const pill = FILTRO_PILLS.find((p) => p.key === filtroCategoria)!;
      if (!pill.estados.includes(t.estado as EstadoTarea)) return false;
    }
    return true;
  });

  // Agrupar por evento para el renderizado
  const grupos = new Map<number, { titulo: string; tareas: TareaUnificada[] }>();
  for (const t of actividadesFiltradas) {
    if (!grupos.has(t.evento_id)) grupos.set(t.evento_id, { titulo: t.evento_titulo, tareas: [] });
    grupos.get(t.evento_id)!.tareas.push(t);
  }

  const eventosUnicos = Array.from(
    new Map(actividades.map((t) => [t.evento_id, t.evento_titulo])).entries()
  ).map(([id, titulo]) => ({ id, titulo }));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.colors.background, fontFamily: theme.font.family }}>

      {/* Header */}
      <div style={{ padding: `20px ${padX} 0` }}>
        <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 700 }}>
          Supervisión de Eventos
        </h2>
        <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
          {user?.nombre}{user?.oficina_nombre ? ` · ${user.oficina_nombre}` : ''}
        </p>
      </div>

      {/* Pestañas — solo 2: Mis Actividades y Mis Eventos (DIRECTOR) */}
      <div style={{ padding: `0 ${padX}`, display: 'flex', gap: '8px', borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.surface, marginTop: '12px' }}>
        {([
          // El observador no tiene actividades propias → solo ve "Mis Eventos"
          ...(esObservador ? [] : [{ key: 'actividades', label: 'Mis Actividades', icon: '🗂️' }]),
          ...((esDirector || esDG) ? [{ key: 'eventos', label: esObservador ? 'Eventos' : 'Mis Eventos', icon: '📅' }] : []),
        ] as { key: 'actividades' | 'eventos'; label: string; icon: string }[]).map(({ key, label, icon }) => {
          const active = seccion === key;
          return (
            <button
              key={key}
              onClick={() => setSeccion(key)}
              style={{
                padding: '10px 20px', border: 'none',
                borderBottom: active ? `3px solid ${theme.colors.primary}` : '3px solid transparent',
                backgroundColor: 'transparent',
                color: active ? theme.colors.primary : theme.colors.textSecondary,
                fontWeight: active ? 700 : 500, fontSize: '0.875rem',
                cursor: 'pointer', fontFamily: theme.font.family,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {icon} {label}
              {key === 'actividades' && actividades.length > 0 && (
                <span style={{ backgroundColor: theme.colors.primary, color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>
                  {actividades.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mis Eventos */}
      {seccion === 'eventos' && (esDirector || esDG) && <SeccionEventos />}

      {/* Mis Actividades */}
      {seccion === 'actividades' && (
        <div style={{ padding: `20px ${padX}`, maxWidth: '1000px', margin: '0 auto' }}>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {FILTRO_PILLS.map((pill) => {
              const count  = conteoPorCategoria(pill.key);
              const active = filtroCategoria === pill.key;
              return (
                <button
                  key={pill.key}
                  onClick={() => setFiltroCategoria(pill.key)}
                  style={{
                    padding: '7px 16px', borderRadius: '20px', cursor: 'pointer',
                    border:           active ? `2px solid ${pill.text}` : `1px solid ${theme.colors.border}`,
                    backgroundColor:  active ? pill.bg : '#fff',
                    color:            active ? pill.text : theme.colors.textSecondary,
                    fontSize: '0.8rem', fontWeight: active ? 700 : 500,
                    fontFamily: theme.font.family,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {pill.label}
                  <span style={{
                    backgroundColor: active ? pill.text : theme.colors.border,
                    color: '#fff', borderRadius: '10px',
                    padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700,
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filtro por evento + contador + actualizar */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', padding: '12px 16px', backgroundColor: theme.colors.surface, borderRadius: '10px', border: `1px solid ${theme.colors.border}`, alignItems: 'center' }}>
            <select
              value={filtroEvento}
              onChange={(e) => setFiltroEvento(e.target.value ? Number(e.target.value) : '')}
              style={selectStyle}
              aria-label="Filtrar por evento"
            >
              <option value="">Todos los eventos</option>
              {eventosUnicos.map((ev) => <option key={ev.id} value={ev.id}>{ev.titulo}</option>)}
            </select>
            {filtroEvento && (
              <button onClick={() => setFiltroEvento('')} style={{ ...btnSecondary, padding: '7px 14px', fontSize: '0.8rem' }}>✕ Limpiar</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
              {actividadesFiltradas.length} actividad{actividadesFiltradas.length !== 1 ? 'es' : ''}
            </span>
            <button onClick={fetchActividades} disabled={loading} style={{ ...btnSecondary, padding: '7px 14px', fontSize: '0.8rem' }}>↻ Actualizar</button>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: theme.colors.textSecondary }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
              <p style={{ margin: 0, fontWeight: 600 }}>Cargando actividades…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ padding: '16px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '8px', marginBottom: '16px' }}>
              <strong>Error:</strong> {error}
              <button onClick={fetchActividades} style={{ marginLeft: '12px', ...btnSecondary, padding: '4px 12px', fontSize: '0.8rem' }}>Reintentar</button>
            </div>
          )}

          {/* Lista agrupada por evento */}
          {!loading && !error && (
            grupos.size === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: theme.colors.textSecondary }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✅</div>
                <p style={{ margin: 0 }}>
                  {actividades.length === 0
                    ? 'No tienes actividades asignadas.'
                    : 'No hay actividades con los filtros seleccionados.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {Array.from(grupos.entries()).map(([eventoId, grupo]) => (
                  <div key={eventoId}>
                    {/* Cabecera del evento */}
                    <div style={{ padding: '10px 16px', backgroundColor: theme.colors.primaryDark, borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.9rem' }}>📅</span>
                      <h3 style={{ margin: 0, color: '#fff', fontSize: '0.9rem', fontWeight: 700 }}>{grupo.titulo}</h3>
                      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>
                        {grupo.tareas.length} actividad{grupo.tareas.length !== 1 ? 'es' : ''}
                      </span>
                    </div>

                    {/* Tareas del evento */}
                    <div style={{ border: `1px solid ${theme.colors.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden', backgroundColor: theme.colors.surface }}>
                      {grupo.tareas.map((tarea, i) =>
                        tarea.tipo === 'revision_equipo' ? (
                          // Tarea del equipo que el Director debe revisar/aprobar
                          <BandejaTareaCardArea
                            key={tarea.id}
                            tarea={tarea}
                            esDirector={esDirector}
                            esDG={esDG}
                            onRefresh={fetchActividades}
                          />
                        ) : (
                          // Tarea propia del usuario
                          <TareaRow
                            key={tarea.id}
                            tarea={tarea}
                            isLast={i === grupo.tareas.length - 1}
                            onAvanzar={() => handleAvanzar(tarea)}
                            advancing={advancing === tarea.id}
                            error={tareaErrors[tarea.id]}
                            onRevisionSuccess={fetchActividades}
                          />
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

// ── EnviarRevisionModal ───────────────────────────────────────

interface EnviarRevisionModalProps {
  open:      boolean;
  tarea:     TareaConEvento | null;
  onClose:   () => void;
  onSuccess: () => void;
  /** true cuando quien envía es un director: el mensaje es opcional (redacción neutra,
   *  sirve tanto si el avance sube a la DG como si se finaliza en su propio evento) */
  mensajeOpcional?: boolean;
}

const EnviarRevisionModal: React.FC<EnviarRevisionModalProps> = ({ open, tarea, onClose, onSuccess, mensajeOpcional = false }) => {
  const [comentario, setComentario] = useState('');
  const [archivo,    setArchivo]    = useState<File | null>(null);
  const [enviando,   setEnviando]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [aviso,      setAviso]      = useState<string | null>(null);

  // Limpiar estado al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setComentario('');
      setArchivo(null);
      setEnviando(false);
      setError(null);
      setAviso(null);
    }
  }, [open]);

  if (!open || !tarea) return null;

  const valido = comentario.trim().length > 0 || archivo !== null;

  const handleEnviar = async () => {
    if (!valido) {
      setError('Debes incluir al menos un comentario o un archivo.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const url = `${BASE}/eventos/${tarea.evento_id}/tareas/${tarea.id}/enviar-revision`;

      let res: Response;
      if (archivo) {
        const form = new FormData();
        if (comentario.trim()) form.append('comentario', comentario.trim());
        form.append('documento', archivo);
        res = await fetch(url, { method: 'POST', headers, body: form });
      } else {
        res = await fetch(url, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ comentario: comentario.trim() }),
        });
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }

      // Aviso sutil de optimización; si hubo, se muestra un momento antes de cerrar
      const textoAviso = textoCompresion(body?.compresion);
      if (textoAviso) {
        setAviso(textoAviso);
        setEnviando(false);
        setTimeout(() => onSuccess(), 2200);
        return;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revision-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '10px', padding: '24px',
        width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        fontFamily: theme.font.family,
      }}>
        <h3 id="revision-modal-title" style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>
          {mensajeOpcional ? 'Enviar avance' : 'Enviar para revisión'}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>
          {tarea.titulo}
        </p>

        {/* Comentario / Mensaje */}
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: theme.colors.textPrimary, marginBottom: '6px' }}>
          {mensajeOpcional
            ? <>Mensaje <span style={{ fontWeight: 400, color: theme.colors.textSecondary }}>(opcional)</span></>
            : 'Comentario de avance'}
        </label>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={4}
          placeholder={mensajeOpcional ? 'Agrega un mensaje para acompañar tu avance (opcional)…' : 'Describe el avance realizado…'}
          disabled={enviando}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px',
            border: `1px solid ${theme.colors.border}`, borderRadius: '6px',
            fontSize: '0.85rem', fontFamily: theme.font.family, resize: 'vertical',
            marginBottom: '14px',
          }}
        />

        {/* Archivo */}
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: theme.colors.textPrimary, marginBottom: '6px' }}>
          Documento de avance <span style={{ fontWeight: 400, color: theme.colors.textSecondary }}>(opcional)</span>
        </label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.webm,.mkv,.mpeg"
          disabled={enviando}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', fontFamily: theme.font.family }}
        />
        <p style={{ margin: '0 0 12px', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
          PDF, imágenes o video · Máximo 200 MB
        </p>

        {/* Validación hint */}
        {!valido && (
          <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.yellow }}>
            ⚠ Debes incluir al menos un comentario o un archivo.
          </p>
        )}

        {/* Error de envío */}
        {error && (
          <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.red }}>
            ⚠ {error}
          </p>
        )}

        {/* Aviso sutil de optimización */}
        {aviso && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            margin: '0 0 12px', padding: '6px 10px', borderRadius: '6px',
            backgroundColor: '#EAF7EE', color: '#1B7A3D',
            fontSize: '0.72rem', fontWeight: 500,
          }}>
            <span aria-hidden>📉</span>{aviso} · Enviado ✓
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={onClose}
            disabled={enviando}
            style={{
              padding: '8px 18px', backgroundColor: '#fff', color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`, borderRadius: '7px',
              fontSize: '0.85rem', fontWeight: 600, cursor: enviando ? 'not-allowed' : 'pointer',
              fontFamily: theme.font.family,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando || !valido}
            style={{
              padding: '8px 18px', backgroundColor: theme.colors.primary, color: '#fff',
              border: 'none', borderRadius: '7px',
              fontSize: '0.85rem', fontWeight: 700,
              cursor: (enviando || !valido) ? 'not-allowed' : 'pointer',
              opacity: (enviando || !valido) ? 0.6 : 1,
              fontFamily: theme.font.family,
            }}
          >
            {enviando ? 'Enviando…' : (mensajeOpcional ? 'Enviar avance' : 'Enviar para revisión')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── TareaRow ──────────────────────────────────────────────────

interface TareaRowProps {
  tarea: TareaConEvento; isLast: boolean;
  onAvanzar: () => void; advancing: boolean; error?: string;
  onRevisionSuccess: () => void;
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const TareaRow: React.FC<TareaRowProps> = ({ tarea, isLast, onAvanzar, advancing, error, onRevisionSuccess }) => {
  const cfg       = ESTADO_CFG[tarea.estado] ?? ESTADO_CFG.PENDIENTE;
  const siguiente = SIGUIENTE_ESTADO[tarea.estado];

  // Modal de revisión
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  // Último comentario de devolución (solo se carga cuando estado === 'DEVUELTO')
  const [ultimaDevolucion,        setUltimaDevolucion]        = useState<string | null>(null);
  const [cargandoDevolucion,      setCargandoDevolucion]      = useState(false);

  useEffect(() => {
    if (tarea.estado === 'DEVUELTO') {
      setCargandoDevolucion(true);
      apiFetch<{ data: import('../types').RegistroHistorial[] }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/historial`)
        .then((res) => {
          // El último registro de tipo DEVOLUCION
          const devoluciones = res.data.filter((r) => r.tipo === 'DEVOLUCION');
          const ultima = devoluciones[devoluciones.length - 1];
          setUltimaDevolucion(ultima?.contenido ?? null);
        })
        .catch(() => setUltimaDevolucion(null))
        .finally(() => setCargandoDevolucion(false));
    }
  }, [tarea.estado, tarea.evento_id, tarea.id]);

  // Determinar si el usuario actual es DIRECTOR (puede reasignar) u OPERATIVO (no puede)
  const userStr   = localStorage.getItem('user');
  const userRol   = userStr ? JSON.parse(userStr).rol : '';
  const esDirector = userRol === 'DIRECTOR';

  const [editandoFecha,   setEditandoFecha]   = useState(false);
  const [fechaCompromiso, setFechaCompromiso] = useState(tarea.fecha_compromiso ?? '');
  const [guardandoFecha,  setGuardandoFecha]  = useState(false);
  const [errorFecha,      setErrorFecha]      = useState<string | null>(null);

  const [reasignando,     setReasignando]     = useState(false);
  const [operativos,      setOperativos]      = useState<{id: number; nombre: string}[]>([]);
  const [operativoSel,    setOperativoSel]    = useState<number | ''>('');
  const [guardandoReasig, setGuardandoReasig] = useState(false);
  const [errorReasig,     setErrorReasig]     = useState<string | null>(null);
  const [reasignadoNombre, setReasignadoNombre] = useState(tarea.reasignado_a_nombre ?? null);

  const handleAbrirReasignacion = async () => {
    if (reasignando) { setReasignando(false); return; }
    setReasignando(true); setErrorReasig(null);
    if (operativos.length === 0) {
      try {
        const token = localStorage.getItem('token');
        // Obtener unidad_id del usuario autenticado para filtrar solo su equipo
        const userStr = localStorage.getItem('user');
        const unidadId = userStr ? JSON.parse(userStr).oficina_id : '';
        const url = `${BASE}/usuarios?rol=OPERATIVO&limit=100${unidadId ? `&oficina_id=${unidadId}` : ''}`;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const body = await res.json();
        setOperativos((body.data ?? []).map((u: any) => ({ id: u.id, nombre: u.nombre })));
      } catch { setOperativos([]); }
    }
  };

  const handleReasignar = async () => {
    if (!operativoSel) return;
    setGuardandoReasig(true); setErrorReasig(null);
    try {
      const res = await apiFetch<{ data: any; message: string }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/reasignar`, { method: 'PATCH', body: JSON.stringify({ reasignado_a_id: Number(operativoSel) }) });
      setReasignadoNombre(res.data.reasignado_a_nombre);
      setReasignando(false);
      // Al delegar, la tarea pasa a la bandeja de revisión del director (ya no la
      // trabaja él). Refrescar para que desaparezcan los botones Iniciar/Enviar.
      onRevisionSuccess();
    } catch (err: any) { setErrorReasig(err.message); }
    finally { setGuardandoReasig(false); }
  };

  const handleGuardarFecha = async () => {
    if (!fechaCompromiso) return;
    setGuardandoFecha(true); setErrorFecha(null);
    try {
      const res = await apiFetch<{ data: TareaConEvento }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/fecha-compromiso`, { method: 'PATCH', body: JSON.stringify({ fecha_compromiso: fechaCompromiso }) });
      tarea.fecha_compromiso = res.data.fecha_compromiso;
      setEditandoFecha(false);
    } catch (err: any) { setErrorFecha(err.message); }
    finally { setGuardandoFecha(false); }
  };

  // ── Modal "Abrir" — mismo que BandejaTareaCardArea ───────────
  const [showDetalle,      setShowDetalle]      = useState(false);
  const [detalleHistorial, setDetalleHistorial] = useState<import('../types').RegistroHistorial[]>([]);
  const [detalleComents,   setDetalleComents]   = useState<Comentario[]>([]);
  const [detalleLoading,   setDetalleLoading]   = useState(false);
  const [detalleError,     setDetalleError]     = useState<string | null>(null);
  const [nuevoComentario,  setNuevoComentario]  = useState('');
  const [enviandoCom,      setEnviandoCom]      = useState(false);
  const [errorCom,         setErrorCom]         = useState<string | null>(null);

  const TIPO_LABEL_ROW: Record<string, { bg: string; text: string; label: string }> = {
    AVANCE:        { bg: '#DBEAFE', text: '#1E40AF', label: 'Avance'      },
    DEVOLUCION:    { bg: '#FEF3C7', text: '#92400E', label: 'Devolución'  },
    APROBACION_N1: { bg: '#D1FAE5', text: '#065F46', label: 'Aprobado N1' },
    APROBACION_N2: { bg: '#EDE9FE', text: '#5B21B6', label: 'Aprobado DG' },
  };

  const handleAbrirDetalle = async () => {
    setShowDetalle(true);
    setDetalleLoading(true); setDetalleError(null);
    try {
      const [hRes, cRes] = await Promise.all([
        apiFetch<{ data: import('../types').RegistroHistorial[] }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/historial`),
        apiFetch<{ data: Comentario[] }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/comentarios`).catch(() => ({ data: [] as Comentario[] })),
      ]);
      setDetalleHistorial(hRes.data);
      setDetalleComents(cRes.data);
    } catch (err: any) { setDetalleError(err.message); }
    finally { setDetalleLoading(false); }
  };

  const handleEnviarComentario = async () => {
    if (!nuevoComentario.trim()) return;
    setEnviandoCom(true); setErrorCom(null);
    try {
      const res = await apiFetch<{ data: Comentario }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/comentarios`, {
        method: 'POST', body: JSON.stringify({ contenido: nuevoComentario.trim() }),
      });
      setDetalleComents((prev) => [...prev, res.data]);
      setNuevoComentario('');
    } catch (err: any) { setErrorCom(err.message); }
    finally { setEnviandoCom(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: !isLast ? `1px solid ${theme.colors.border}` : 'none', flexWrap: 'wrap' }}>

        {/* Título */}
        <div style={{ flex: 1, minWidth: '160px' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: theme.colors.textPrimary }}>{tarea.titulo}</p>
          {tarea.descripcion && <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>{tarea.descripcion}</p>}
        </div>

        {/* Badge estado */}
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
          {cfg.label}
        </span>

        {/* Fechas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📅 Límite: <strong>{tarea.fecha_programada}</strong></span>
            {tarea.vencida && <span style={{ color: theme.colors.alert.red, fontWeight: 700, fontSize: '0.7rem', backgroundColor: '#FEE2E2', padding: '2px 8px', borderRadius: '20px' }}>🔴 Vencida</span>}
            {!tarea.vencida && tarea.proxima_a_vencer && <span style={{ color: theme.colors.alert.yellow, fontWeight: 700, fontSize: '0.7rem', backgroundColor: '#FFFBEB', padding: '2px 8px', borderRadius: '20px' }}>🟡 Próxima</span>}
          </div>
          {!editandoFecha ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {tarea.fecha_compromiso ? <span style={{ color: theme.colors.primary }}>🤝 Compromiso: <strong>{tarea.fecha_compromiso}</strong></span> : <span style={{ fontStyle: 'italic' }}>Sin fecha compromiso</span>}
              <button onClick={() => { setEditandoFecha(true); setErrorFecha(null); }} style={{ background: 'none', border: 'none', color: theme.colors.primary, cursor: 'pointer', fontSize: '0.7rem', padding: '0 4px', fontFamily: theme.font.family, textDecoration: 'underline' }}>
                {tarea.fecha_compromiso ? 'Cambiar' : '+ Agregar'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <input type="date" value={fechaCompromiso} onChange={(e) => setFechaCompromiso(e.target.value)} max={tarea.fecha_programada} min={new Date().toISOString().slice(0,10)} style={{ padding: '4px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: '5px', fontSize: '0.75rem', fontFamily: theme.font.family }} />
              <button onClick={handleGuardarFecha} disabled={guardandoFecha || !fechaCompromiso} style={{ padding: '4px 10px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, cursor: (guardandoFecha || !fechaCompromiso) ? 'not-allowed' : 'pointer', opacity: (guardandoFecha || !fechaCompromiso) ? 0.6 : 1, fontFamily: theme.font.family }}>{guardandoFecha ? '…' : 'Guardar'}</button>
              <button onClick={() => { setEditandoFecha(false); setFechaCompromiso(tarea.fecha_compromiso ?? ''); setErrorFecha(null); }} style={{ padding: '4px 8px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '5px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              {errorFecha && <span style={{ color: theme.colors.alert.red, fontSize: '0.72rem' }}>⚠ {errorFecha}</span>}
            </div>
          )}
        </div>

        {/* Reasignación — solo visible para DIRECTOR, no para OPERATIVO */}
        {esDirector && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}>
          {reasignadoNombre ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: theme.colors.primary }}>👷 Delegado a: <strong>{reasignadoNombre}</strong></span>
              <button onClick={handleAbrirReasignacion} style={{ background: 'none', border: 'none', color: theme.colors.primary, cursor: 'pointer', fontSize: '0.7rem', textDecoration: 'underline', fontFamily: theme.font.family, padding: 0 }}>Cambiar</button>
            </div>
          ) : (
            <button onClick={handleAbrirReasignacion} style={{ padding: '5px 12px', backgroundColor: reasignando ? theme.colors.primaryDark : '#fff', color: reasignando ? '#fff' : theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family, flexShrink: 0 }}>👷 Delegar a mi equipo</button>
          )}
          {reasignando && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              <select value={operativoSel} onChange={(e) => setOperativoSel(Number(e.target.value))} style={{ ...selectStyle, fontSize: '0.75rem', padding: '5px 8px' }}>
                <option value="">— Selecciona colaborador —</option>
                {operativos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
              <button onClick={handleReasignar} disabled={guardandoReasig || !operativoSel} style={{ padding: '5px 12px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, cursor: (guardandoReasig || !operativoSel) ? 'not-allowed' : 'pointer', opacity: (guardandoReasig || !operativoSel) ? 0.6 : 1, fontFamily: theme.font.family }}>{guardandoReasig ? '…' : 'Asignar'}</button>
              <button onClick={() => { setReasignando(false); setErrorReasig(null); }} style={{ padding: '5px 8px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '5px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              {errorReasig && <span style={{ color: theme.colors.alert.red, fontSize: '0.72rem' }}>⚠ {errorReasig}</span>}
            </div>
          )}
        </div>
        )}

        {/* Botón Abrir — igual que BandejaTareaCardArea */}
        <button
          onClick={handleAbrirDetalle}
          style={{ padding: '6px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family, flexShrink: 0 }}
        >
          Abrir
        </button>

        {/* Avanzar / Revisión — lógica según estado */}
        {tarea.estado === 'PENDIENTE' && siguiente && (
          <button onClick={onAvanzar} disabled={advancing} style={{ padding: '6px 14px', backgroundColor: '#3B82F6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: advancing ? 'not-allowed' : 'pointer', opacity: advancing ? 0.7 : 1, fontFamily: theme.font.family, flexShrink: 0 }}>
            {advancing ? '…' : 'Iniciar'}
          </button>
        )}

        {(tarea.estado === 'EN_PROGRESO') && (
          <button onClick={() => setShowRevisionModal(true)} style={{ padding: '6px 14px', backgroundColor: '#F59E0B', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family, flexShrink: 0 }}>
            📤 Enviar para revisión
          </button>
        )}

        {tarea.estado === 'DEVUELTO' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '260px' }}>
            {cargandoDevolucion && <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>⏳ Cargando devolución…</span>}
            {!cargandoDevolucion && ultimaDevolucion && (
              <div style={{ padding: '8px 10px', backgroundColor: '#FEE2E2', borderRadius: '6px', fontSize: '0.75rem', color: '#991B1B', borderLeft: '3px solid #F87171' }}>
                <strong>Motivo de devolución:</strong> {ultimaDevolucion}
              </div>
            )}
            <button onClick={() => setShowRevisionModal(true)} style={{ padding: '6px 14px', backgroundColor: '#EF4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family, flexShrink: 0 }}>
              🔄 Reenviar para revisión
            </button>
          </div>
        )}

        {tarea.estado === 'EN_REVISION' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 12px', backgroundColor: '#FEF3C7', color: '#92400E', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, fontFamily: theme.font.family, flexShrink: 0 }}>
            🔍 En revisión por el Director
          </span>
        )}

        {tarea.estado === 'EN_REVISION_DG' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 12px', backgroundColor: '#EDE9FE', color: '#5B21B6', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, fontFamily: theme.font.family, flexShrink: 0 }}>
            ⏳ En revisión por la Directora General
          </span>
        )}
      </div>

      {error && <div style={{ padding: '6px 16px', backgroundColor: '#FEE2E2', fontSize: '0.75rem', color: theme.colors.alert.red }}>⚠ {error}</div>}

      {/* Modal Abrir — idéntico al de BandejaTareaCardArea */}
      {showDetalle && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDetalle(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', width: '100%', maxWidth: '580px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' as const, fontFamily: theme.font.family }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 14px', borderBottom: `1px solid ${theme.colors.border}` }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>{tarea.titulo}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>📅 {tarea.evento_titulo}</p>
                <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '6px', padding: '2px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase' as const }}>
                  {cfg.label}
                </span>
              </div>
              <button onClick={() => setShowDetalle(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: theme.colors.textSecondary, flexShrink: 0, marginLeft: '12px' }}>×</button>
            </div>
            {/* Cuerpo — línea temporal unificada (historial + comentarios) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 12px' }}>
              <SeguimientoTarea eventoId={tarea.evento_id} tareaId={tarea.id} puedeEscribir={true} />
            </div>
            {/* Footer */}
            <div style={{ padding: '12px 24px 16px', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDetalle(false)} style={{ padding: '8px 20px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de envío a revisión */}
      <EnviarRevisionModal
        open={showRevisionModal}
        tarea={tarea}
        // Un director enviando su propia tarea (no delegada): el mensaje es opcional.
        // Redacción neutra: sirve tanto si sube a la DG como si se finaliza su evento.
        mensajeOpcional={esDirector && !tarea.reasignado_a_id}
        onClose={() => setShowRevisionModal(false)}
        onSuccess={() => {
          setShowRevisionModal(false);
          onRevisionSuccess();
        }}
      />
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────

const selectStyle: React.CSSProperties  = { padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' as const, fontFamily: theme.font.family, backgroundColor: '#fff' };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };

// ── BandejaTareaCardArea ──────────────────────────────────────

const ESTADO_CFG_BANDEJA: Partial<Record<EstadoTarea, { bg: string; text: string; label: string }>> = {
  EN_REVISION:    { bg: '#FEF3C7', text: '#92400E', label: 'Para revisar'   },
  EN_REVISION_DG: { bg: '#EDE9FE', text: '#5B21B6', label: 'En Revisión DG' },
  DEVUELTO:       { bg: '#FEE2E2', text: '#991B1B', label: 'Devuelto'       },
  DEVUELTO_DG:    { bg: '#FFEDD5', text: '#9A3412', label: 'Devuelto por DG' },
  FINALIZADO:     { bg: '#D1FAE5', text: '#065F46', label: 'Finalizado'     },
};

const BandejaTareaCardArea: React.FC<{
  tarea:      TareaUnificada;
  esDirector: boolean;
  esDG?:      boolean;
  onRefresh:  () => void;
}> = ({ tarea, esDirector, esDG = false, onRefresh }) => {
  const cfg = ESTADO_CFG_BANDEJA[tarea.estado] ?? { bg: '#F3F4F6', text: '#374151', label: tarea.estado };

  const [aprobando,        setAprobando]        = useState(false);
  const [aprobarError,     setAprobarError]     = useState<string | null>(null);
  const [showDevolver,     setShowDevolver]     = useState(false);
  const [showFinalizar,    setShowFinalizar]    = useState(false);
  const [confirmaFinal,    setConfirmaFinal]    = useState(false);
  const [showHistorial,    setShowHistorial]    = useState(false);
  const [comentarioDev,    setComentarioDev]    = useState('');
  const [enviandoDev,      setEnviandoDev]      = useState(false);
  const [errorDev,         setErrorDev]         = useState<string | null>(null);
  const [historialData,    setHistorialData]    = useState<RegistroHistorial[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError,   setHistorialError]   = useState<string | null>(null);
  const [comentariosModal, setComentariosModal] = useState<Comentario[]>([]);

  // N1: director de área aprueba (EN_REVISION → EN_REVISION_DG) — directo.
  const handleAprobar = async () => {
    setAprobando(true); setAprobarError(null);
    try {
      await apiFetch(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/aprobar`, { method: 'PATCH' });
      onRefresh();
    } catch (err: any) { setAprobarError(err.message); }
    finally { setAprobando(false); }
  };

  // N2: DG finaliza (EN_REVISION_DG → FINALIZADO) — requiere confirmación.
  const handleFinalizarDG = async () => {
    if (!confirmaFinal) return;
    setAprobando(true); setAprobarError(null);
    try {
      await apiFetch(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/aprobar-dg`, {
        method: 'PATCH',
        body: JSON.stringify({ justificacion: 'Dirección General aprueba la finalización de la actividad' }),
      });
      setShowFinalizar(false);
      setConfirmaFinal(false);
      onRefresh();
    } catch (err: any) { setAprobarError(err.message); }
    finally { setAprobando(false); }
  };

  const handleDevolver = async () => {
    if (!comentarioDev.trim()) return;
    setEnviandoDev(true); setErrorDev(null);
    try {
      const endpoint = esDG ? 'devolver-dg' : 'devolver';
      await apiFetch(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/${endpoint}`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: comentarioDev.trim() }),
      });
      setShowDevolver(false);
      setComentarioDev('');
      onRefresh();
    } catch (err: any) { setErrorDev(err.message); }
    finally { setEnviandoDev(false); }
  };

  const handleVerHistorial = async () => {
    setShowHistorial(true);
    setHistorialLoading(true); setHistorialError(null);
    try {
      const [histRes, comentRes] = await Promise.all([
        apiFetch<{ data: RegistroHistorial[] }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/historial`),
        apiFetch<{ data: Comentario[] }>(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/comentarios`).catch(() => ({ data: [] as Comentario[] })),
      ]);
      setHistorialData(histRes.data);
      setComentariosModal(comentRes.data);
    } catch (err: any) { setHistorialError(err.message); }
    finally { setHistorialLoading(false); }
  };

  const TIPO_LABEL: Record<string, { bg: string; text: string; label: string }> = {
    AVANCE:        { bg: '#DBEAFE', text: '#1E40AF', label: 'Avance'      },
    DEVOLUCION:    { bg: '#FEF3C7', text: '#92400E', label: 'Devolución'  },
    APROBACION_N1: { bg: '#D1FAE5', text: '#065F46', label: 'Aprobado N1' },
    APROBACION_N2: { bg: '#EDE9FE', text: '#5B21B6', label: 'Aprobado DG' },
  };

  function fmt(iso: string) {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', flexWrap: 'wrap' as const }}>

        {/* Barra de color lateral */}
        <div style={{ width: '4px', alignSelf: 'stretch', backgroundColor: cfg.text, borderRadius: '2px', flexShrink: 0 }} />

        {/* Info */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: theme.colors.textPrimary }}>{tarea.titulo}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
            📅 {tarea.evento_titulo}
            {esDirector && <> &nbsp;·&nbsp; 👤 {tarea.asignado_a_nombre}</>}
          </p>
          {tarea.descripcion && (
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>{tarea.descripcion}</p>
          )}
        </div>

        {/* Badge estado */}
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase' as const, letterSpacing: '0.05em', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
          {cfg.label}
        </span>

        {/* Fecha */}
        <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
          📅 {tarea.fecha_programada}
        </span>

        {/* Acciones director: Aprobar / Devolver cuando EN_REVISION */}
        {esDirector && tarea.estado === 'EN_REVISION' && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={handleAprobar}
              disabled={aprobando}
              style={{ padding: '6px 14px', backgroundColor: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: aprobando ? 'not-allowed' : 'pointer', opacity: aprobando ? 0.6 : 1, fontFamily: theme.font.family }}
            >
              {aprobando ? '…' : '✓ Aprobar'}
            </button>
            <button
              onClick={() => { setShowDevolver(true); setComentarioDev(''); setErrorDev(null); }}
              disabled={aprobando}
              style={{ padding: '6px 14px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family }}
            >
              ↩ Devolver
            </button>
          </div>
        )}

        {/* Mensaje operativo: en revisión */}
        {!esDirector && tarea.estado === 'EN_REVISION' && (
          <span style={{ fontSize: '0.75rem', color: '#92400E', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px', padding: '5px 10px', fontWeight: 600, flexShrink: 0 }}>
            🔍 Revisando tu jefe directo
          </span>
        )}

        {/* DEVUELTO_DG: la DG devolvió y le toca al director bajarla a su
            colaborador con observaciones extra. */}
        {tarea.estado === 'DEVUELTO_DG' && (
          esDirector && !esDG ? (
            <button
              onClick={() => { setShowDevolver(true); setComentarioDev(''); setErrorDev(null); }}
              style={{ padding: '6px 14px', backgroundColor: '#FFEDD5', color: '#9A3412', border: '1px solid #FDBA74', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family, flexShrink: 0 }}
              title="Bajar la actividad a tu colaborador con observaciones extra"
            >
              ↩ Bajar a mi colaborador
            </button>
          ) : (
            <span style={{ fontSize: '0.75rem', color: '#9A3412', backgroundColor: '#FFEDD5', border: '1px solid #FDBA74', borderRadius: '6px', padding: '5px 10px', fontWeight: 600, flexShrink: 0 }}>
              ↩ Devuelta por DG — con el director de área
            </span>
          )
        )}

        {/* EN_REVISION_DG: la DG finaliza o devuelve (N2); el resto solo ve el estado */}
        {tarea.estado === 'EN_REVISION_DG' && (
          esDG ? (
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => { setShowFinalizar(true); setConfirmaFinal(false); setAprobarError(null); }}
                disabled={aprobando}
                style={{ padding: '6px 14px', backgroundColor: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: aprobando ? 'not-allowed' : 'pointer', opacity: aprobando ? 0.6 : 1, fontFamily: theme.font.family }}
              >
                {aprobando ? '…' : '✓ Finalizar'}
              </button>
              <button
                onClick={() => { setShowDevolver(true); setComentarioDev(''); setErrorDev(null); }}
                disabled={aprobando}
                style={{ padding: '6px 14px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family }}
              >
                ↩ Devolver
              </button>
            </div>
          ) : (
            <span style={{ fontSize: '0.75rem', color: '#5B21B6', backgroundColor: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: '6px', padding: '5px 10px', fontWeight: 600, flexShrink: 0 }}>
              ⏳ Pendiente aprobación DG
            </span>
          )
        )}

        {/* DEVUELTO: el director la devolvió a su colaborador; espera la corrección */}
        {tarea.estado === 'DEVUELTO' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 12px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, fontFamily: theme.font.family, flexShrink: 0 }}>
            ↩ Devuelta — esperando corrección del colaborador
          </span>
        )}

        {/* Botón Abrir */}
        <button
          onClick={handleVerHistorial}
          style={{ padding: '6px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family, flexShrink: 0 }}
        >
          Abrir
        </button>
      </div>

      {/* Error aprobar */}
      {aprobarError && (
        <div style={{ padding: '6px 16px', backgroundColor: '#FEE2E2', fontSize: '0.78rem', color: theme.colors.alert.red }}>
          ⚠ {aprobarError}
        </div>
      )}

      {/* Modal devolver */}
      {showDevolver && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDevolver(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '460px', fontFamily: theme.font.family }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>↩ Devolver tarea</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{tarea.titulo}</p>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: theme.colors.textPrimary }}>
              Motivo de devolución <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <textarea
              value={comentarioDev}
              onChange={(e) => setComentarioDev(e.target.value)}
              rows={4}
              placeholder="Describe qué debe corregirse o completarse…"
              disabled={enviandoDev}
              style={{ width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.85rem', fontFamily: theme.font.family, resize: 'vertical' as const, marginBottom: '14px' }}
            />
            {errorDev && <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.red }}>⚠ {errorDev}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDevolver(false)} disabled={enviandoDev} style={{ padding: '8px 18px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              <button onClick={handleDevolver} disabled={enviandoDev || !comentarioDev.trim()} style={{ padding: '8px 18px', backgroundColor: '#F59E0B', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 700, cursor: (enviandoDev || !comentarioDev.trim()) ? 'not-allowed' : 'pointer', opacity: (enviandoDev || !comentarioDev.trim()) ? 0.6 : 1, fontFamily: theme.font.family }}>
                {enviandoDev ? 'Devolviendo…' : '↩ Devolver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Finalizar (DG) — justificación obligatoria */}
      {showFinalizar && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFinalizar(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '460px', fontFamily: theme.font.family }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>✓ Finalizar actividad</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{tarea.titulo}</p>
            <div style={{ padding: '10px 12px', backgroundColor: '#D1FAE5', border: '1px solid #6EE7B7', borderLeft: '4px solid #059669', borderRadius: '8px', marginBottom: '14px', fontSize: '0.82rem', color: '#065F46', lineHeight: 1.5 }}>
              ✅ <strong>La Dirección General aprueba la finalización de esta actividad.</strong>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px', fontSize: '0.85rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmaFinal}
                onChange={(e) => setConfirmaFinal(e.target.checked)}
                disabled={aprobando}
                style={{ marginTop: '2px', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Confirmo la finalización de esta actividad.</span>
            </label>
            {aprobarError && <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.red }}>⚠ {aprobarError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowFinalizar(false)} disabled={aprobando} style={{ padding: '8px 18px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              <button onClick={handleFinalizarDG} disabled={aprobando || !confirmaFinal} style={{ padding: '8px 18px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 700, cursor: (aprobando || !confirmaFinal) ? 'not-allowed' : 'pointer', opacity: (aprobando || !confirmaFinal) ? 0.6 : 1, fontFamily: theme.font.family }}>
                {aprobando ? 'Finalizando…' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Abrir — detalle completo de la actividad */}
      {showHistorial && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowHistorial(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', width: '100%', maxWidth: '580px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' as const, fontFamily: theme.font.family }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 14px', borderBottom: `1px solid ${theme.colors.border}` }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>{tarea.titulo}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                  📅 {tarea.evento_titulo}
                  {tarea.asignado_a_nombre && <> &nbsp;·&nbsp; 👤 {tarea.asignado_a_nombre}</>}
                </p>
                <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '6px', padding: '2px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase' as const }}>
                  {cfg.label}
                </span>
              </div>
              <button onClick={() => setShowHistorial(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: theme.colors.textSecondary, flexShrink: 0, marginLeft: '12px' }}>×</button>
            </div>

            {/* Cuerpo — línea temporal unificada (historial + comentarios) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 12px' }}>
              <SeguimientoTarea eventoId={tarea.evento_id} tareaId={tarea.id} puedeEscribir={false} />
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px 16px', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowHistorial(false)} style={{ padding: '8px 20px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
