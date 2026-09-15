/**
 * View: SeccionEventos
 * Gestión de eventos operativos para la Directora General.
 * File: src/frontend/views/SeccionEventos.tsx
 */

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Icono } from '../components/Icono';
import type { NombreIcono } from '../components/Icono';
import { theme } from '../theme';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { esAsistenteDG, esDireccionGeneral } from '../utils/asistentesDG';
import { useDialogo } from '../context/DialogoContext';
import { borrarTareaEvento, cancelarTareaEvento, borrarEvento } from '../api';
import { ResumenEvento } from '../components/ResumenEvento';
import type { EventoResumen, EventoDetalle, TareaEvento, EstadoTarea, RegistroHistorial } from '../types';
import type { UsuarioAdmin } from '../api';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

// ── Tipo Comentario ───────────────────────────────────────────

interface Comentario {
  id:           number;
  tarea_id:     number;
  contenido:    string;
  creado_en:    string;
  autor_id:     number;
  autor_nombre: string;
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
      ...(options?.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Estado badge config ───────────────────────────────────────

const ESTADO_TAREA_CFG: Record<EstadoTarea, { bg: string; text: string; label: string }> = {
  PENDIENTE:      { bg: '#FEF3C7', text: '#92400E', label: 'Pendiente'      },
  EN_PROGRESO:    { bg: '#EFEDEA', text: '#3D3935', label: 'En Progreso'    },
  COMPLETADA:     { bg: '#D1FAE5', text: '#065F46', label: 'Completada'     },
  FINALIZADO:     { bg: '#D1FAE5', text: '#065F46', label: 'Finalizado'     },
  EN_REVISION:    { bg: '#FEF3C7', text: '#92400E', label: 'En Revisión'    },
  EN_REVISION_DG: { bg: '#FDE8EF', text: '#8A0730', label: 'En Revisión DG' },
  DEVUELTO:       { bg: '#FEE2E2', text: '#991B1B', label: 'Devuelto'       },
  DEVUELTO_DG:    { bg: '#FFEDD5', text: '#9A3412', label: 'Devuelto por DG' },
  // Gris apagado a propósito: cancelada no es un error ni un logro, es trabajo
  // que dejó de esperarse. No debe competir por atención con lo que sigue vivo.
  CANCELADA:      { bg: '#EDE9E4', text: '#6B6560', label: 'Cancelada'      },
};

// ── Component ─────────────────────────────────────────────────

export const SeccionEventos: React.FC = () => {
  const { user } = useAuth();
  const dialogoEventos = useDialogo();
  const isMobile = useIsMobile();
  // La DG real (DIRECTOR en Dirección General) y sus asistentes designados
  // (Fabian, Tania) actúan como la Directora General: mismos permisos y roles.
  const esDG = esDireccionGeneral(user);

  // Director de área: puede crear sus propios eventos privados (sin aprobación DG).
  const esDirectorArea = user?.rol === 'DIRECTOR' && (user as any)?.unidad_tipo !== 'DIRECCION_GENERAL';
  const puedeCrearEvento = esDG || esDirectorArea;
  const [eventos,       setEventos]       = useState<EventoResumen[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [detalle,       setDetalle]       = useState<EventoDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  const [showNuevoEvento, setShowNuevoEvento] = useState(false);
  const [nuevoTitulo,     setNuevoTitulo]     = useState('');
  const [nuevoDesc,       setNuevoDesc]       = useState('');
  const [nuevoDirectores, setNuevoDirectores] = useState<number[]>([]);
  const [nuevoResponsable, setNuevoResponsable] = useState<number | ''>('');
  const [nuevoFecha,      setNuevoFecha]      = useState('');
  const [creandoEvento,   setCreandoEvento]   = useState(false);
  const [errorEvento,     setErrorEvento]     = useState<string | null>(null);
  const [todosDirectores, setTodosDirectores] = useState<UsuarioAdmin[]>([]);

  const [showNuevaTarea,  setShowNuevaTarea]  = useState(false);
  const [tareaEventoId,   setTareaEventoId]   = useState<number | null>(null);
  const [tareaTitulo,     setTareaTitulo]     = useState('');
  const [tareaDesc,       setTareaDesc]       = useState('');
  const [tareaAsignado,   setTareaAsignado]   = useState<number | ''>('');
  const [tareaFecha,      setTareaFecha]      = useState('');
  const [creandoTarea,    setCreandoTarea]    = useState(false);
  const [errorTarea,      setErrorTarea]      = useState<string | null>(null);
  const [directores,      setDirectores]      = useState<UsuarioAdmin[]>([]);

  /**
   * A quién puede invitar quien está creando el evento.
   *
   *   · La DG    → los titulares de área. Es coordinación entre direcciones.
   *   · Director → su propio equipo, que es la lista que ya se carga para poder
   *                asignarles actividades. Se le quita él mismo: quien crea el
   *                evento no se invita, ya es su dueño, y verse en la lista de
   *                participantes confunde.
   *
   * El servidor valida lo mismo por su cuenta; esto solo evita ofrecer algo que
   * después sería rechazado.
   *
   * Va AQUÍ y no junto a `esDG` arriba: allá se leía `todosDirectores` antes de su
   * propia declaración y React reventaba con «Cannot access before
   * initialization» — pantalla en blanco al abrir «Mis Eventos».
   */
  const invitables = React.useMemo(
    () => (esDG ? todosDirectores : directores.filter((d) => d.id !== user?.id)),
    [esDG, todosDirectores, directores, user?.id],
  );
  // Directores de otras áreas — solo se cargan cuando el usuario es el
  // responsable del evento (puede asignar actividades a otros directores).
  const [otrosDirectores, setOtrosDirectores] = useState<UsuarioAdmin[]>([]);

  const [cerrando,        setCerrando]        = useState<number | null>(null);
  const [errorCierre,     setErrorCierre]     = useState<Record<number, string>>({});
  // Modal de cierre de evento (con justificación obligatoria)
  const [cierreEvento,    setCierreEvento]    = useState<EventoResumen | null>(null);
  const [justifCierre,    setJustifCierre]    = useState('');
  // Modal de resumen del evento (avance, fechas, participantes, actividades)
  const [resumenEvento,   setResumenEvento]   = useState<EventoResumen | null>(null);

  const fetchEventos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: EventoResumen[] }>('/eventos');
      setEventos(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEventos(); }, [fetchEventos]);

  // Cargar todos los directores de área (para el selector al crear evento)
  // Aplica tanto a la DG como a directores de área — ambos pueden invitar participantes
  useEffect(() => {
    if (!user) return;
    apiFetch<{ data: UsuarioAdmin[] }>('/usuarios?rol=DIRECTOR&limit=100')
      .then(({ data }) => {
        // Excluir al usuario actual y a la Directora General (unidad tipo DIRECCION_GENERAL)
        setTodosDirectores(
          data.filter(
            (d) => d.id !== user.id && (d as any).unidad_tipo !== 'DIRECCION_GENERAL',
          ),
        );
      })
      .catch(() => {});
  }, [user]);

  // Cargar asignables según tipo de unidad del usuario:
  // - DIRECCION_GENERAL → directores de área (excluye su propia unidad)
  // - DIRECCION / DELEGACION → [Yo mismo] + su equipo operativo (misma unidad)
  useEffect(() => {
    if (!user) return;
    const unidadId   = user.oficina_id;
    const unidadTipo = (user as any).unidad_tipo ?? '';

    if (unidadTipo === 'DIRECCION_GENERAL') {
      apiFetch<{ data: UsuarioAdmin[] }>('/usuarios?rol=DIRECTOR&limit=100')
        .then(({ data: dirs }) => setDirectores(dirs.filter((u) => u.unidad_id !== unidadId)))
        .catch(() => {});
    } else {
      // Director de Área: carga a sí mismo + su equipo operativo
      apiFetch<{ data: UsuarioAdmin[] }>(`/usuarios?rol=OPERATIVO&oficina_id=${unidadId}&limit=100`)
        .then(({ data: ops }) => {
          const yo: UsuarioAdmin = {
            id:             user.id,
            nombre:         `${user.nombre} (yo)`,
            email:          user.email,
            rol:            user.rol as any,
            activo:         true,
            oficina_id:     unidadId,
            unidad_id:      unidadId,
            oficina_nombre: user.oficina_nombre ?? '',
          };
          // Sin el filtro, quien es a la vez operativo de la unidad y quien mira
          // —el encargado del evento, desde que puede repartir trabajo— salía dos
          // veces en el selector: una como «(yo)» y otra dentro de su propio
          // equipo, con la misma clave de React.
          setDirectores([yo, ...ops.filter((o) => o.id !== user.id)]);
        })
        .catch(() => {});
    }
  }, [user]);

  const handleExpandEvento = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetalle(null);
      return;
    }
    setExpandedId(id);
    setDetalle(null);
    setDetalleLoading(true);
    try {
      const res = await apiFetch<{ data: EventoDetalle }>(`/eventos/${id}`);
      setDetalle(res.data);
    } catch {
      setDetalle(null);
    } finally {
      setDetalleLoading(false);
    }
  };

  const handleCerrarEvento = async (id: number, justificacion: string) => {
    setCerrando(id);
    setErrorCierre((prev) => { const n = { ...prev }; delete n[id]; return n; });
    try {
      await apiFetch(`/eventos/${id}/cerrar`, {
        method: 'PATCH',
        body: JSON.stringify({ justificacion }),
      });
      setEventos((prev) => prev.map((e) => e.id === id ? { ...e, estado: 'CERRADO' } : e));
      if (detalle?.id === id) setDetalle((d) => d ? { ...d, estado: 'CERRADO' } : d);
      setCierreEvento(null);
      setJustifCierre('');
    } catch (err: any) {
      setErrorCierre((prev) => ({ ...prev, [id]: err.message }));
    } finally {
      setCerrando(null);
    }
  };

  /** Recarga el detalle de un evento (participantes, tareas, responsable) para
   *  que el resto de la vista no quede desfasada tras un cambio. */
  const refrescarDetalle = async (eventoId: number) => {
    try {
      const res = await apiFetch<{ data: EventoDetalle }>(`/eventos/${eventoId}`);
      setDetalle(res.data);
      if (expandedId !== eventoId) setExpandedId(eventoId);
    } catch { /* silencioso: el detalle se recarga al expandir */ }
  };

  const handleCrearEvento = async (e: FormEvent) => {
    e.preventDefault();
    setCreandoEvento(true);
    setErrorEvento(null);
    try {
      const res = await apiFetch<{ data: EventoResumen }>('/eventos', {
        method: 'POST',
        body: JSON.stringify({
          titulo:           nuevoTitulo,
          descripcion:      nuevoDesc || undefined,
          fecha_programada: nuevoFecha || undefined,
          director_ids:     nuevoDirectores.length > 0 ? nuevoDirectores : undefined,
          responsable_id:   nuevoResponsable !== '' ? Number(nuevoResponsable) : undefined,
        }),
      });
      setEventos((prev) => [res.data, ...prev]);
      setShowNuevoEvento(false);
      setNuevoTitulo('');
      setNuevoDesc('');
      setNuevoFecha('');
      setNuevoDirectores([]);
      setNuevoResponsable('');
    } catch (err: any) {
      setErrorEvento(err.message);
    } finally {
      setCreandoEvento(false);
    }
  };

  const openNuevaTarea = (eventoId: number) => {
    setTareaEventoId(eventoId);
    setTareaTitulo('');
    setTareaDesc('');
    setTareaAsignado('');
    setTareaFecha('');
    setErrorTarea(null);
    setOtrosDirectores([]);
    setShowNuevaTarea(true);

    // Si el usuario es el RESPONSABLE de este evento (y no es la DG),
    // cargar directores de otras áreas para poder asignarles actividades.
    const esResponsableDeEsteEvento = detalle?.id === eventoId && detalle?.es_responsable === true;
    const esDGUser = (user as any)?.unidad_tipo === 'DIRECCION_GENERAL';
    if (esResponsableDeEsteEvento && !esDGUser) {
      apiFetch<{ data: UsuarioAdmin[] }>('/usuarios?rol=DIRECTOR&limit=100')
        .then(({ data: dirs }) => {
          // Otros directores de área (excluir al propio usuario y a la DG)
          setOtrosDirectores(
            dirs.filter((d) => d.id !== user!.id && (d as any).unidad_tipo !== 'DIRECCION_GENERAL'),
          );
        })
        .catch(() => {});
    }
  };

  const handleCrearTarea = async (e: FormEvent) => {
    e.preventDefault();
    if (!tareaEventoId || !tareaAsignado) return;
    setCreandoTarea(true);
    setErrorTarea(null);
    try {
      await apiFetch(`/eventos/${tareaEventoId}/tareas`, {
        method: 'POST',
        body: JSON.stringify({
          titulo:           tareaTitulo,
          descripcion:      tareaDesc || undefined,
          asignado_a_id:    Number(tareaAsignado),
          // Sin plazo se omite el campo: el servidor lo guarda como nulo.
          fecha_programada: tareaFecha || undefined,
        }),
      });
      setShowNuevaTarea(false);
      // Recargar detalle si está expandido
      if (expandedId === tareaEventoId) {
        const res = await apiFetch<{ data: EventoDetalle }>(`/eventos/${tareaEventoId}`);
        setDetalle(res.data);
      }
      // Actualizar conteo en la lista
      fetchEventos();
    } catch (err: any) {
      setErrorTarea(err.message);
    } finally {
      setCreandoTarea(false);
    }
  };

  /**
   * Los terminados se guardan, no se archivan.
   *
   * «Cerrado» ya es el estado terminal: exige justificación y guarda quién lo
   * cerró. Lo que estorbaba era verlos siempre, no que existieran — así que en vez
   * de inventar un estado «archivado» —un tercer sitio donde buscar, y uno que no
   * obliga a explicar nada— la lista simplemente los oculta hasta que se piden.
   */
  const [verTerminados, setVerTerminados] = useState(false);
  const terminados = eventos.filter((e) => e.estado === 'CERRADO').length;

  const eventosOrdenados = [...eventos]
    .filter((e) => verTerminados || e.estado !== 'CERRADO')
    .sort((a, b) => {
      if (a.estado === b.estado) return 0;
      return a.estado === 'ABIERTO' ? -1 : 1;
    });

  const quitarEvento = async (evento: EventoResumen) => {
    const sigue = await dialogoEventos.confirmar({
      titulo:    'Borrar evento',
      mensaje:   `¿Borrar «${evento.titulo}»? Solo se puede si no tiene ninguna actividad.`,
      confirmar: 'Borrar',
      peligro:   true,
    });
    if (!sigue) return;
    try {
      await borrarEvento(evento.id);
      setEventos((prev) => prev.filter((e) => e.id !== evento.id));
      if (expandedId === evento.id) { setExpandedId(null); setDetalle(null); }
    } catch (err: any) {
      setErrorCierre((prev) => ({ ...prev, [evento.id]: err.message }));
    }
  };

  // ── Opciones del selector "Asignar a" (modal Agregar Tarea) ──────────
  //
  // Una actividad solo se le puede encomendar a quien fue incluido en el evento.
  // Antes la lista del director de área mostraba a todo su equipo operativo,
  // participara o no, y al elegir a alguien de fuera el servidor rechazaba el
  // alta: la actividad no se guardaba y no quedaba claro por qué. Se filtra aquí
  // para que la lista no ofrezca lo que el servidor va a negar.
  //
  // El propio usuario siempre aparece: quien organiza el evento puede quedarse
  // con una actividad aunque no se haya agregado a sí mismo como participante.
  //
  // En los eventos de la Dirección General el participante es el director del
  // área, y él reparte libremente entre su equipo: ahí el filtro no aplica a los
  // operativos, solo a los directores.
  const detalleTarea = detalle?.id === tareaEventoId ? detalle : null;
  const eventoDeDirector = detalleTarea?.requiere_aprobacion_dg === false;
  const idsParticipantesEvento = new Set(
    (detalleTarea?.directores_participantes ?? []).map((p) => p.id),
  );
  const directoresOpciones = (esDG || eventoDeDirector)
    ? directores.filter((d) => d.id === user?.id || idsParticipantesEvento.has(d.id))
    : directores;
  const otrosDirectoresOpciones = otrosDirectores.filter((d) => idsParticipantesEvento.has(d.id));

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px', fontFamily: theme.font.family }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, color: theme.colors.primaryDark, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Eventos Operativos
          </h2>
          <p style={{ margin: '3px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            {eventos.filter((e) => e.estado === 'ABIERTO').length} evento{eventos.filter((e) => e.estado === 'ABIERTO').length !== 1 ? 's' : ''} abierto{eventos.filter((e) => e.estado === 'ABIERTO').length !== 1 ? 's' : ''}
            {terminados > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => setVerTerminados((v) => !v)}
                  style={{ background: 'none', border: 'none', padding: 0, color: theme.colors.primary, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family, textDecoration: 'underline' }}
                >
                  {verTerminados ? 'ocultar' : 'ver'} {terminados} terminado{terminados !== 1 ? 's' : ''}
                </button>
              </>
            )}
          </p>
        </div>
        {puedeCrearEvento && (
          <button
            onClick={() => { setNuevoTitulo(''); setNuevoDesc(''); setNuevoFecha(''); setErrorEvento(null); setShowNuevoEvento(true); }}
            style={btnPrimary}
          >
            + Nuevo Evento
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: theme.colors.textSecondary }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Cargando eventos…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ padding: '16px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '8px', marginBottom: '16px' }}>
          <strong>Error:</strong> {error}
          <button onClick={fetchEventos} style={{ marginLeft: '12px', ...btnSecondary, padding: '4px 12px', fontSize: '0.8rem' }}>Reintentar</button>
        </div>
      )}

      {/* Lista de eventos */}
      {!loading && !error && (
        eventosOrdenados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: theme.colors.textSecondary }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Icono nombre="calendario" size={40} color={theme.colors.grayMid} /></div>
            <p style={{ margin: 0 }}>No hay eventos registrados. Crea el primero.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {eventosOrdenados.map((evento) => (
              <EventoCard
                key={evento.id}
                evento={evento}
                expanded={expandedId === evento.id}
                detalle={expandedId === evento.id ? detalle : null}
                detalleLoading={expandedId === evento.id && detalleLoading}
                onToggle={() => handleExpandEvento(evento.id)}
                onAbrir={() => setResumenEvento(evento)}
                onCerrar={() => { setCierreEvento(evento); setJustifCierre(''); }}
                cerrando={cerrando === evento.id}
                errorCierre={errorCierre[evento.id]}
                onAgregarTarea={() => openNuevaTarea(evento.id)}
                esDG={esDG}
                /* El encargado coordina aunque no sea director: por eso deja de
                   contar como solo lectura en SU evento. */
                soloLectura={user?.rol !== 'DIRECTOR' && !esAsistenteDG(user)
                             && evento.responsable_id !== user?.id}
                esEncargado={!!user && evento.responsable_id === user.id}
                puedeCerrar={esDG || evento.creado_por_id === user?.id}
                onBorrar={() => quitarEvento(evento)}
              />
            ))}
          </div>
        )
      )}

      {/* ── Modal: Resumen del Evento ─────────────────────── */}
      {resumenEvento && (
        <ResumenEvento
          resumen={resumenEvento}
          onClose={() => { setResumenEvento(null); fetchEventos(); }}
          /* Armar la lista de participantes la puede el dueño y también el
             encargado, que es quien coordina y quien nota que falta alguien.
             Designar encargado se queda con el dueño: pasarle el encargo a otro
             no es algo que decida quien lo tiene. */
          puedeGestionar={esDG || resumenEvento.creado_por_id === user?.id
                          || resumenEvento.responsable_id === user?.id}
          puedeDesignarEncargado={esDG || resumenEvento.creado_por_id === user?.id}
          directoresArea={esDG ? todosDirectores : invitables}
          ambito={esDG ? 'DIRECCION_GENERAL' : 'AREA'}
          onCambio={() => refrescarDetalle(resumenEvento.id)}
        />
      )}

      {/* ── Modal: Terminar Evento (justificación obligatoria) ── */}
      <Modal open={!!cierreEvento} title="Terminar evento" onClose={() => setCierreEvento(null)} width={460}>
        {cierreEvento && (
          <div>
            {/* Advertencia — solo en eventos de la Dirección General */}
            {esDG && (
              <div style={{ padding: '12px 14px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderLeft: '4px solid #D97706', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', color: '#92400E', lineHeight: 1.5 }}>
                <Icono nombre="alerta" inline /><strong>Dirección General aprueba la conclusión de este proceso.</strong> Verifica con cuidado antes de continuar: al terminar el evento no se puede reabrir.
              </div>
            )}

            <p style={{ margin: '0 0 14px', fontSize: '0.88rem', color: theme.colors.textPrimary, lineHeight: 1.5 }}>
              ¿Deseas terminar el evento <strong>{cierreEvento.titulo}</strong>? Esta acción lo cierra y no se puede deshacer.
            </p>

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: theme.colors.textSecondary, marginBottom: '6px' }}>
              Justificación del cierre <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <textarea
              value={justifCierre}
              onChange={(e) => setJustifCierre(e.target.value)}
              rows={3}
              placeholder="Explica por qué se termina el evento (queda como registro)…"
              style={{ padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.85rem', fontFamily: theme.font.family, resize: 'vertical', width: '100%', boxSizing: 'border-box' as const }}
            />
            {errorCierre[cierreEvento.id] && (
              <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{errorCierre[cierreEvento.id]}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button type="button" onClick={() => setCierreEvento(null)} style={btnSecondary}>Cancelar</button>
              <button
                type="button"
                onClick={() => handleCerrarEvento(cierreEvento.id, justifCierre.trim())}
                disabled={!justifCierre.trim() || cerrando === cierreEvento.id}
                style={{ padding: '8px 18px', backgroundColor: '#374151', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.85rem', cursor: (!justifCierre.trim() || cerrando === cierreEvento.id) ? 'not-allowed' : 'pointer', opacity: (!justifCierre.trim() || cerrando === cierreEvento.id) ? 0.6 : 1, fontFamily: theme.font.family }}
              >
                {cerrando === cierreEvento.id ? 'Cerrando…' : 'Terminar evento'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Nuevo Evento ───────────────────────────── */}
      <Modal open={showNuevoEvento} title="Nuevo Evento" onClose={() => setShowNuevoEvento(false)} width={480}>
        <form onSubmit={handleCrearEvento} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Título <span style={{ color: theme.colors.alert.red }}>*</span></label>
              <input
                type="text"
                value={nuevoTitulo}
                onChange={(e) => setNuevoTitulo(e.target.value)}
                required
                placeholder="Ej. Revisión de expedientes Q1"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Descripción <span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional)</span></label>
              <textarea
                value={nuevoDesc}
                onChange={(e) => setNuevoDesc(e.target.value)}
                rows={3}
                placeholder="Descripción del evento…"
                style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Fecha programada <span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional)</span></label>
              <input
                type="date"
                value={nuevoFecha}
                onChange={(e) => setNuevoFecha(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            {/* A quién se puede invitar depende de quién crea:
                  · la DG    → titulares de área (coordinación entre direcciones)
                  · director → su propio equipo operativo
                Antes este bloque llevaba `esDG &&`, así que a un director nunca se
                le dibujaba —aunque el comentario de la carga de datos ya decía que
                ambos podían invitar—. */}
            {invitables.length > 0 && (
              <div>
                <label style={labelStyle}>
                  {esDG ? 'Directores participantes' : 'Participantes de mi equipo'}
                  {' '}<span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional)</span>
                </label>
                <div style={{ backgroundColor: '#F9FAFB', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {invitables.map(d => (
                    <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: theme.colors.textPrimary }}>
                      <input
                        type="checkbox"
                        checked={nuevoDirectores.includes(d.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setNuevoDirectores(prev => [...prev, d.id]);
                          } else {
                            setNuevoDirectores(prev => prev.filter(id => id !== d.id));
                          }
                        }}
                        style={{ flexShrink: 0 }}
                      />
                      <span>
                        <strong>{d.nombre}</strong>
                        {d.oficina_nombre && <span style={{ color: theme.colors.textSecondary }}> · {d.oficina_nombre}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                {nuevoDirectores.length > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                    {nuevoDirectores.length} director{nuevoDirectores.length !== 1 ? 'es' : ''} seleccionado{nuevoDirectores.length !== 1 ? 's' : ''}
                  </p>
                )}

                {/* Responsable del evento — debe ser uno de los participantes */}
                {nuevoDirectores.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={labelStyle}>
                      {esDG ? 'Director responsable' : 'Responsable del evento'}
                      {' '}<span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <select
                      value={nuevoResponsable}
                      onChange={(e) => setNuevoResponsable(e.target.value ? Number(e.target.value) : '')}
                      style={{ ...inputStyle, width: '100%' }}
                    >
                      <option value="">— Sin responsable designado —</option>
                      {invitables
                        .filter((d) => nuevoDirectores.includes(d.id))
                        .map((d) => (
                          <option key={d.id} value={d.id}>{d.nombre}{d.oficina_nombre ? ` · ${d.oficina_nombre}` : ''}</option>
                        ))}
                    </select>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                      {esDG
                        ? 'El responsable podrá ver todas las actividades del evento y asignar a otros directores.'
                        : 'El responsable podrá ver todas las actividades del evento y repartirlas dentro del equipo.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          {errorEvento && <div role="alert" style={alertErrorStyle}>{errorEvento}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowNuevoEvento(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={creandoEvento || !nuevoTitulo.trim()} style={btnPrimary}>
              {creandoEvento ? 'Creando…' : '+ Crear Evento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Agregar Tarea ──────────────────────────── */}
      <Modal open={showNuevaTarea} title="Agregar Tarea" onClose={() => setShowNuevaTarea(false)} width={500}>
        <form onSubmit={handleCrearTarea} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Título <span style={{ color: theme.colors.alert.red }}>*</span></label>
              <input
                type="text"
                value={tareaTitulo}
                onChange={(e) => setTareaTitulo(e.target.value)}
                required
                placeholder="Ej. Revisar contratos pendientes"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Descripción <span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional)</span></label>
              <textarea
                value={tareaDesc}
                onChange={(e) => setTareaDesc(e.target.value)}
                rows={2}
                placeholder="Descripción de la tarea…"
                style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Asignar a <span style={{ color: theme.colors.alert.red }}>*</span></label>
              <select
                value={tareaAsignado}
                onChange={(e) => setTareaAsignado(Number(e.target.value))}
                required
                style={{ ...inputStyle, width: '100%' }}
              >
                <option value="">
                  {directores.length === 0
                    ? 'Cargando…'
                    : directoresOpciones.length === 0 && otrosDirectoresOpciones.length === 0
                      ? '— El evento no tiene participantes —'
                      : esDG
                        ? '— Selecciona director de área —'
                        : '— Selecciona participante —'}
                </option>
                {/* Mi equipo / yo mismo */}
                {otrosDirectoresOpciones.length > 0 ? (
                  <optgroup label="Mi dirección">
                    {directoresOpciones.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}{d.oficina_nombre ? ` · ${d.oficina_nombre}` : ''}</option>
                    ))}
                  </optgroup>
                ) : (
                  directoresOpciones.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}{d.oficina_nombre ? ` · ${d.oficina_nombre}` : ''}</option>
                  ))
                )}
                {/* Otros directores de área participantes (si el usuario es responsable del evento) */}
                {otrosDirectoresOpciones.length > 0 && (
                  <optgroup label="Otros directores participantes">
                    {otrosDirectoresOpciones.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}{d.oficina_nombre ? ` · ${d.oficina_nombre}` : ''}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha límite <span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional)</span></label>
              <input
                type="date"
                value={tareaFecha}
                onChange={(e) => setTareaFecha(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={{ ...inputStyle, width: '100%' }}
              />
              <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                Si no se define un plazo, la actividad no vence ni entra en los avisos.
              </p>
            </div>
          </div>
          {errorTarea && <div role="alert" style={alertErrorStyle}>{errorTarea}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowNuevaTarea(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={creandoTarea || !tareaTitulo.trim() || !tareaAsignado} style={btnPrimary}>
              {creandoTarea ? 'Agregando…' : '+ Agregar Tarea'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ── EventoCard ────────────────────────────────────────────────

interface EventoCardProps {
  evento:           EventoResumen;
  expanded:         boolean;
  detalle:          EventoDetalle | null;
  detalleLoading:   boolean;
  onToggle:         () => void;
  onAbrir:          () => void;
  onCerrar:         () => void;
  cerrando:         boolean;
  errorCierre?:     string;
  onAgregarTarea:   () => void;
  esDG:             boolean;
  soloLectura:      boolean;
  esEncargado:      boolean;
  /** Terminar el evento: la DG en los suyos, el director que lo creó en el propio. */
  puedeCerrar:      boolean;
  onBorrar:         () => void;
}

const EventoCard: React.FC<EventoCardProps> = ({
  evento, expanded, detalle, detalleLoading, onToggle, onAbrir, onCerrar, cerrando, errorCierre, onAgregarTarea,
  esDG, soloLectura, esEncargado, puedeCerrar, onBorrar,
}) => {
  const isCerrado = evento.estado === 'CERRADO';
  const total     = evento.total_tareas || 1;
  const pctComp   = Math.round((evento.tareas_completada / total) * 100);
  const pctProg   = Math.round((evento.tareas_en_progreso / total) * 100);

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius:    '10px',
      boxShadow:       theme.shadow.sm,
      border:          `1px solid ${theme.colors.border}`,
      opacity:         isCerrado ? 0.65 : 1,
      overflow:        'hidden',
    }}>
      {/* Card header — clickable */}
      <div
        onClick={onToggle}
        style={{
          padding:    '14px 18px',
          cursor:     'pointer',
          display:    'flex',
          alignItems: 'center',
          gap:        '12px',
          flexWrap:   'wrap',
          userSelect: 'none',
        }}
      >
        {/* Expand icon */}
        <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary, flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
          ▶
        </span>

        {/* Título + badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: theme.colors.textPrimary }}>
              {evento.titulo}
            </span>
            <EstadoBadge estado={evento.estado} />
            {esEncargado && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FDE8EF', color: '#8A0730', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                <Icono nombre="persona" inline />Encargado
              </span>
            )}
            {evento.tareas_vencidas > 0 && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: theme.colors.alert.red, backgroundColor: '#FEE2E2', padding: '2px 8px', borderRadius: '20px' }}>
                <Icono nombre="alerta" inline />{evento.tareas_vencidas} vencida{evento.tareas_vencidas !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {evento.descripcion && (
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {evento.descripcion}
            </p>
          )}
          {evento.fecha_programada && (
            <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: theme.colors.primary, fontWeight: 600 }}>
              <Icono nombre="calendario" inline />Fecha límite: {evento.fecha_programada}
            </p>
          )}
        </div>

        {/* Barra de progreso */}
        <div style={{ flexShrink: 0, width: '120px' }}>
          <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginBottom: '4px', textAlign: 'right' }}>
            {evento.tareas_completada}/{evento.total_tareas} finalizadas
          </div>
          <div style={{ height: '6px', backgroundColor: theme.colors.border, borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${pctComp}%`, backgroundColor: theme.colors.alert.green, transition: 'width 0.3s' }} />
            <div style={{ width: `${pctProg}%`, backgroundColor: '#60A5FA', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Botón Abrir — resumen completo del evento */}
        <button
          onClick={(e) => { e.stopPropagation(); onAbrir(); }}
          style={{ flexShrink: 0, padding: '6px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family }}
          title="Ver resumen y detalles del evento"
        >
          <Icono nombre="carpeta" inline />Abrir
        </button>
      </div>

      {/* Error cierre */}
      {errorCierre && (
        <div style={{ padding: '6px 18px', backgroundColor: '#FEE2E2', fontSize: '0.78rem', color: theme.colors.alert.red }}>
          <Icono nombre="alerta" inline />{errorCierre}
        </div>
      )}

      {/* Detalle expandido */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>

          {/* El responsable y los participantes se gestionan dentro del modal «Abrir» */}

          {/* Acciones — ocultas para observadores (solo lectura) */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {/* Repartir trabajo lo hace quien coordina: el director participante o
                el encargado del evento, sea cual sea su rol. */}
            {!isCerrado && !soloLectura && (
              <button onClick={onAgregarTarea} style={{ ...btnPrimary, fontSize: '0.8rem', padding: '7px 14px' }}>
                + Agregar Tarea
              </button>
            )}
            {/* Terminar el evento es de su dueño, y va aparte: antes colgaba de la
                misma condición que «Agregar Tarea», así que al abrirle el reparto al
                encargado le habría aparecido también un botón que el servidor le
                niega. */}
            {!isCerrado && puedeCerrar && (
              <button
                onClick={onCerrar}
                disabled={cerrando}
                style={{ ...btnSecondary, fontSize: '0.8rem', padding: '7px 14px', color: theme.colors.alert.red, borderColor: theme.colors.alert.red }}
              >
                {cerrando ? 'Cerrando…' : 'Cerrar Evento'}
              </button>
            )}
            {/* Solo tiene sentido en el evento vacío: con actividades dentro, el
                servidor lo niega y manda a cerrarlo. Ofrecerlo igual sería un
                botón que falla, así que se muestra únicamente cuando procede. */}
            {!isCerrado && puedeCerrar && evento.total_tareas === 0 && (
              <button
                onClick={onBorrar}
                style={{ ...btnSecondary, fontSize: '0.8rem', padding: '7px 14px', color: theme.colors.textSecondary }}
                title="Se creó por error y no tiene ninguna actividad"
              >
                Borrar evento
              </button>
            )}
          </div>

          {/* Tareas */}
          {detalleLoading ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: theme.colors.textSecondary }}>
              <span style={{ fontSize: '1.5rem' }}>⏳</span>
              <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>Cargando tareas…</p>
            </div>
          ) : !detalle ? (
            <p style={{ color: theme.colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
              Error al cargar tareas
            </p>
          ) : detalle.tareas.length === 0 ? (
            <p style={{ color: theme.colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
              Sin tareas. Agrega la primera.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {detalle.tareas.map((t) => (
                <TareaRow key={t.id} tarea={t} fechaLimiteEvento={detalle.fecha_programada ?? null}
                          puedeEditar={!soloLectura && !isCerrado} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── DevolverTareaModal ────────────────────────────────────────

interface DevolverTareaModalProps {
  open:      boolean;
  tarea:     TareaEvento | null;
  onClose:   () => void;
  onSuccess: () => void;
}

const DevolverTareaModal: React.FC<DevolverTareaModalProps> = ({ open, tarea, onClose, onSuccess }) => {
  const [comentario, setComentario] = useState('');
  const [enviando,   setEnviando]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Limpiar estado al abrir/cerrar
  useEffect(() => {
    if (open) {
      setComentario('');
      setError(null);
      setEnviando(false);
    }
  }, [open]);

  if (!open || !tarea) return null;

  const handleDevolver = async () => {
    if (!comentario.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await apiFetch(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/devolver`, {
        method: 'PATCH',
        body:   JSON.stringify({ comentario: comentario.trim() }),
      });
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
      aria-labelledby="devolver-modal-title"
      style={{
        position:        'fixed',
        inset:           0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          1000,
        padding:         '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#fff',
        borderRadius:    '10px',
        boxShadow:       '0 8px 32px rgba(0,0,0,0.18)',
        width:           '100%',
        maxWidth:        '460px',
        padding:         '24px',
        fontFamily:      theme.font.family,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 id="devolver-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>
            <Icono nombre="regresarIzq" inline />Devolver Tarea
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: theme.colors.textSecondary, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Nombre de la tarea */}
        <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: theme.colors.textSecondary }}>
          Tarea: <strong style={{ color: theme.colors.textPrimary }}>{tarea.titulo}</strong>
        </p>

        {/* Campo comentario */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>
            Motivo de devolución <span style={{ color: theme.colors.alert.red }}>*</span>
          </label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={4}
            placeholder="Describe el motivo por el que se devuelve la tarea…"
            disabled={enviando}
            style={{
              ...inputStyle,
              width:   '100%',
              resize:  'vertical',
              opacity: enviando ? 0.7 : 1,
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div role="alert" style={{ ...alertErrorStyle, marginBottom: '14px' }}>
            <Icono nombre="alerta" inline />{error}
          </div>
        )}

        {/* Footer */}
        <div style={modalFooter}>
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            style={btnSecondary}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDevolver}
            disabled={enviando || !comentario.trim()}
            style={{
              ...btnPrimary,
              backgroundColor: '#F59E0B',
              opacity:         (enviando || !comentario.trim()) ? 0.6 : 1,
              cursor:          (enviando || !comentario.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {enviando ? 'Devolviendo…' : '↩ Devolver'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── HistorialRevisionModal ────────────────────────────────────

type TimelineTipo = 'AVANCE' | 'DEVOLUCION' | 'APROBACION_N1' | 'APROBACION_N2' | 'REASIGNACION' | 'COMENTARIO';

interface TimelineItem {
  key:           string;
  tipo:          TimelineTipo;
  autor_nombre:  string;
  creado_en:     string;
  contenido:     string | null;
  documento_url: string | null;
}

// Config visual por tipo — el COMENTARIO se distingue en morado
const TIMELINE_CFG: Record<TimelineTipo, { label: string; icon: NombreIcono; dot: string; bg: string; text: string }> = {
  AVANCE:        { label: 'Avance',            icon: 'subir', dot: '#3D3935', bg: '#EFEDEA', text: '#3D3935' },
  DEVOLUCION:    { label: 'Devolución',        icon: 'regresarIzq',  dot: '#D97706', bg: '#FEF3C7', text: '#92400E' },
  APROBACION_N1: { label: 'Aprobación (área)', icon: 'check',  dot: '#059669', bg: '#D1FAE5', text: '#065F46' },
  APROBACION_N2: { label: 'Aprobación (DG)',   icon: 'checkCirculo', dot: '#059669', bg: '#D1FAE5', text: '#065F46' },
  REASIGNACION:  { label: 'Delegación',        icon: 'personas', dot: '#B68400', bg: '#FBF3DF', text: '#7A5A00' },
  COMENTARIO:    { label: 'Comentario',        icon: 'comentario', dot: '#AB0A3D', bg: '#FDE8EF', text: '#8A0730' },
};

interface HistorialRevisionModalProps {
  open:    boolean;
  tarea:   TareaEvento | null;
  onClose: () => void;
  // Comentarios (mensajes) — se muestran junto al historial en la misma ventana
  comentarios:        Comentario[];
  comentariosLoading: boolean;
  comentariosError:   string | null;
  puedeEscribir:      boolean;
  nuevoComentario:    string;
  setNuevoComentario: (v: string) => void;
  enviando:           boolean;
  envioError:         string | null;
  onEnviarComentario: () => void;
}

const HistorialRevisionModal: React.FC<HistorialRevisionModalProps> = ({
  open, tarea, onClose,
  comentarios, comentariosLoading, comentariosError,
  puedeEscribir, nuevoComentario, setNuevoComentario, enviando, envioError, onEnviarComentario,
}) => {
  const [registros, setRegistros] = useState<RegistroHistorial[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tarea) return;
    setLoading(true);
    setError(null);
    setRegistros([]);
    apiFetch<{ data: RegistroHistorial[] }>(
      `/eventos/${tarea.evento_id}/tareas/${tarea.id}/historial`,
    )
      .then(({ data }) => setRegistros(data))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, tarea]);

  if (!open || !tarea) return null;

  // Fusiona historial (avances/devoluciones/aprobaciones) + comentarios en UNA
  // sola línea temporal ordenada cronológicamente (más antiguo → más reciente).
  const items: TimelineItem[] = [
    ...registros.map((r) => ({
      key: `h${r.id}`, tipo: r.tipo as TimelineTipo, autor_nombre: r.autor_nombre,
      creado_en: r.creado_en, contenido: r.contenido, documento_url: r.documento_url,
    })),
    ...comentarios.map((c) => ({
      key: `c${c.id}`, tipo: 'COMENTARIO' as TimelineTipo, autor_nombre: c.autor_nombre,
      creado_en: c.creado_en, contenido: c.contenido, documento_url: null,
    })),
  ].sort((a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime());

  const cargando = loading || comentariosLoading;
  const errorMsg = error || comentariosError;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="historial-modal-title"
      style={{
        position:        'fixed',
        inset:           0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          1000,
        padding:         '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#fff',
        borderRadius:    '10px',
        boxShadow:       '0 8px 32px rgba(0,0,0,0.18)',
        width:           '100%',
        maxWidth:        '520px',
        maxHeight:       '80vh',
        display:         'flex',
        flexDirection:   'column',
        fontFamily:      theme.font.family,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: `1px solid ${theme.colors.border}` }}>
          <h3 id="historial-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>
            <Icono nombre="lista" inline />Seguimiento de la tarea
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: theme.colors.textSecondary, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Nombre de la tarea */}
        <div style={{ padding: '10px 24px 0' }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: theme.colors.textSecondary }}>
            Tarea: <strong style={{ color: theme.colors.textPrimary }}>{tarea.titulo}</strong>
          </p>
        </div>

        {/* Contenido — línea temporal unificada (historial + comentarios) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 20px' }}>
          {cargando && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: theme.colors.textSecondary }}>
              <span style={{ fontSize: '1.5rem' }}>⏳</span>
              <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>Cargando…</p>
            </div>
          )}

          {!cargando && errorMsg && (
            <div role="alert" style={alertErrorStyle}><Icono nombre="alerta" inline />{errorMsg}</div>
          )}

          {!cargando && !errorMsg && items.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: theme.colors.textSecondary, textAlign: 'center', padding: '24px 0' }}>
              Sin actividad todavía.
            </p>
          )}

          {!cargando && !errorMsg && items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map((it, idx) => {
                const cfg          = TIMELINE_CFG[it.tipo] ?? TIMELINE_CFG.COMENTARIO;
                const isLast       = idx === items.length - 1;
                const esComentario = it.tipo === 'COMENTARIO';
                return (
                  <div key={it.key} style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                    {/* Columna de la línea temporal: punto + conector */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '14px' }}>
                      <span style={{ width: '13px', height: '13px', borderRadius: '50%', backgroundColor: cfg.dot, border: '2px solid #fff', boxShadow: `0 0 0 2px ${cfg.dot}`, marginTop: '4px', flexShrink: 0 }} />
                      {!isLast && <span style={{ width: '2px', flex: 1, backgroundColor: theme.colors.border, marginTop: '4px' }} />}
                    </div>

                    {/* Contenido del ítem */}
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? '2px' : '18px' }}>
                      <div style={{
                        backgroundColor: esComentario ? '#FAF5FF' : 'transparent',
                        border:          esComentario ? `1px solid ${cfg.dot}33` : 'none',
                        borderLeft:      esComentario ? `3px solid ${cfg.dot}` : 'none',
                        borderRadius:    esComentario ? '8px' : '0',
                        padding:         esComentario ? '8px 12px' : '0',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
                            <Icono nombre={cfg.icon} size={13} /> {cfg.label}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: theme.colors.textPrimary }}>{it.autor_nombre}</span>
                          <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{formatFecha(it.creado_en)}</span>
                        </div>
                        {it.contenido && (
                          <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: theme.colors.textPrimary, lineHeight: 1.5 }}>{it.contenido}</p>
                        )}
                        {it.documento_url && (
                          <a href={`/files${it.documento_url}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#3D3935', textDecoration: 'none', backgroundColor: '#F5F4F2', padding: '4px 10px', borderRadius: '6px', border: '1px solid #E2DDD8' }}>
                            <Icono nombre="documento" inline />Ver documento adjunto
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Formulario de escritura — solo para DIRECTOR */}
          {puedeEscribir && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '16px', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '14px' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                <Icono nombre="comentario" inline />Agregar comentario
              </p>
              <textarea
                value={nuevoComentario}
                onChange={(e) => setNuevoComentario(e.target.value)}
                rows={2}
                placeholder="Escribe un comentario…"
                disabled={enviando}
                style={{ padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.8rem', fontFamily: theme.font.family, resize: 'vertical', width: '100%', boxSizing: 'border-box' as const }}
              />
              {envioError && <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{envioError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={onEnviarComentario}
                  disabled={enviando || !nuevoComentario.trim()}
                  style={{ padding: '6px 16px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: (enviando || !nuevoComentario.trim()) ? 'not-allowed' : 'pointer', opacity: (enviando || !nuevoComentario.trim()) ? 0.6 : 1, fontFamily: theme.font.family }}
                >
                  {enviando ? 'Enviando…' : 'Comentar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 20px', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ── TareaRow ──────────────────────────────────────────────────

function formatFecha(iso: string): string {
  const d = new Date(iso);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

const TareaRow: React.FC<{ tarea: TareaEvento; fechaLimiteEvento: string | null; puedeEditar?: boolean }> = ({ tarea: tareaInicial, fechaLimiteEvento, puedeEditar = false }) => {
  const [tarea, setTarea] = useState<TareaEvento>(tareaInicial);
  /** Borrada de verdad: la fila desaparece sin esperar a recargar el detalle. */
  const [borrada, setBorrada] = useState(false);
  const dialogo = useDialogo();
  const cfg = ESTADO_TAREA_CFG[tarea.estado] ?? ESTADO_TAREA_CFG.PENDIENTE;

  /**
   * Corrección de la encomienda: su nombre y su descripción.
   *
   * La encomienda se redacta rápido al repartir el trabajo y muchas veces se
   * afina después de hablarlo con quien la va a hacer; hasta ahora no había forma
   * de enmendarla. Solo aparece para quien coordina el evento —el servidor exige
   * lo mismo—, y se apaga cuando la actividad ya terminó: reescribir lo que se
   * pidió después de que el trabajo se entregó y se aprobó dejaría el historial
   * contando otra cosa.
   */
  const [editando,  setEditando]  = useState(false);
  const [edTitulo,  setEdTitulo]  = useState('');
  const [edDesc,    setEdDesc]    = useState('');
  const [guardandoEd, setGuardandoEd] = useState(false);
  const [errorEd,   setErrorEd]   = useState<string | null>(null);
  // Cancelada cuenta como terminada: ni se edita ni se vuelve a quitar. Sin esto
  // seguía ofreciendo «Editar» y «Quitar» sobre algo que ya no espera nada.
  const terminada = tarea.estado === 'FINALIZADO' || tarea.estado === 'COMPLETADA'
                 || tarea.estado === 'CANCELADA';

  const abrirEdicion = () => {
    setEdTitulo(tarea.titulo);
    setEdDesc(tarea.descripcion ?? '');
    setErrorEd(null);
    setEditando(true);
  };

  /**
   * Quitar la actividad del tablero: borrarla o cancelarla.
   *
   * Cuál de las dos aplica lo decide el SERVIDOR, no esta pantalla. Aquí se
   * intenta borrar y, si responde que no se puede —porque ya tiene avances,
   * comentarios o arrancó—, se ofrece cancelar con su motivo. Así la regla vive en
   * un solo lugar: replicarla aquí significaría que el día que cambie, la pantalla
   * ofrecería una cosa y el servidor haría otra.
   */
  const [cancelando,  setCancelando]  = useState(false);
  const [motivoCanc,  setMotivoCanc]  = useState('');
  const [quitando,    setQuitando]    = useState(false);
  const [errorQuitar, setErrorQuitar] = useState<string | null>(null);

  const intentarBorrar = async () => {
    const sigue = await dialogo.confirmar({
      titulo:    'Borrar actividad',
      mensaje:   `¿Borrar «${tarea.titulo}»? Solo se puede si nadie la ha trabajado todavía.`,
      confirmar: 'Borrar',
      peligro:   true,
    });
    if (!sigue) return;
    setQuitando(true);
    setErrorQuitar(null);
    try {
      await borrarTareaEvento(tarea.evento_id, tarea.id);
      setBorrada(true);
    } catch (err: any) {
      // 409 = tiene trabajo encima. No es un fallo: es la señal de cancelar.
      if (err.status === 409) { setErrorQuitar(err.message); setCancelando(true); }
      else setErrorQuitar(err.message);
    } finally {
      setQuitando(false);
    }
  };

  const confirmarCancelar = async () => {
    if (!motivoCanc.trim()) { setErrorQuitar('Escribe por qué se cancela'); return; }
    setQuitando(true);
    setErrorQuitar(null);
    try {
      await cancelarTareaEvento(tarea.evento_id, tarea.id, motivoCanc);
      setTarea((t) => ({ ...t, estado: 'CANCELADA', motivo_cancelacion: motivoCanc.trim() }));
      setCancelando(false);
      setMotivoCanc('');
    } catch (err: any) {
      setErrorQuitar(err.message);
    } finally {
      setQuitando(false);
    }
  };

  const guardarEdicion = async () => {
    if (!edTitulo.trim()) { setErrorEd('El título es obligatorio'); return; }
    setGuardandoEd(true);
    setErrorEd(null);
    try {
      const res = await apiFetch<{ data: { titulo: string; descripcion: string | null } }>(
        `/eventos/${tarea.evento_id}/tareas/${tarea.id}`,
        { method: 'PATCH', body: JSON.stringify({ titulo: edTitulo, descripcion: edDesc }) },
      );
      setTarea((t) => ({ ...t, titulo: res.data.titulo, descripcion: res.data.descripcion }));
      setEditando(false);
    } catch (err: any) {
      setErrorEd(err.message);
    } finally {
      setGuardandoEd(false);
    }
  };

  // ── Estado local de comentarios ───────────────────────────
  const [comentarios,        setComentarios]        = useState<Comentario[]>([]);
  const [comentariosLoading, setComentariosLoading] = useState(false);
  const [comentariosError,   setComentariosError]   = useState<string | null>(null);
  const [nuevoComentario,    setNuevoComentario]    = useState('');
  const [enviando,           setEnviando]           = useState(false);
  const [envioError,         setEnvioError]         = useState<string | null>(null);

  // ── Estado local para modales de revisión ─────────────────
  const [showDevolverModal,    setShowDevolverModal]    = useState(false);
  const [showDevolverDGModal,  setShowDevolverDGModal]  = useState(false);
  const [showHistorialModal,   setShowHistorialModal]   = useState(false);
  const [aprobando,            setAprobando]            = useState(false);
  const [aprobarError,         setAprobarError]         = useState<string | null>(null);
  const [aprobandoDG,          setAprobandoDG]          = useState(false);
  const [aprobarDGError,       setAprobarDGError]       = useState<string | null>(null);
  const [showFinalizarDG,      setShowFinalizarDG]      = useState(false);
  const [confirmaFinalDG,      setConfirmaFinalDG]      = useState(false);
  const [comentarioDevolDG,    setComentarioDevolDG]    = useState('');
  const [enviandoDevolDG,      setEnviandoDevolDG]      = useState(false);
  const [errorDevolDG,         setErrorDevolDG]         = useState<string | null>(null);

  // El usuario actual
  const userStr      = localStorage.getItem('user');
  const userParsed   = userStr ? JSON.parse(userStr) : {};
  const userRol      = userParsed.rol ?? '';
  // La DG real y sus asistentes (Fabian, Tania) actúan como la Directora General.
  const esDG         = esDireccionGeneral(userParsed);
  const puedeEscribir = userRol === 'DIRECTOR' || esAsistenteDG(userParsed);
  // Solo el director de la MISMA unidad que el asignado puede autorizar (N1).
  // El responsable del evento (otra unidad) solo observa, no autoriza.
  const esRevisorN1  = puedeEscribir && !esDG &&
    (tarea as any).asignado_unidad_id === userParsed.oficina_id;

  // N1: Encargado aprueba EN_REVISION → EN_REVISION_DG
  const handleAprobar = async () => {
    setAprobando(true);
    setAprobarError(null);
    try {
      await apiFetch(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/aprobar`, { method: 'PATCH' });
      setTarea((prev) => ({ ...prev, estado: 'EN_REVISION_DG' }));
    } catch (err: any) {
      setAprobarError(err.message);
    } finally {
      setAprobando(false);
    }
  };

  // N2: DG aprueba EN_REVISION_DG → FINALIZADO
  const handleAprobarDG = async () => {
    if (!confirmaFinalDG) return;
    setAprobandoDG(true);
    setAprobarDGError(null);
    try {
      await apiFetch(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/aprobar-dg`, {
        method: 'PATCH',
        body: JSON.stringify({ justificacion: 'Dirección General aprueba la finalización de la actividad' }),
      });
      setTarea((prev) => ({ ...prev, estado: 'FINALIZADO' }));
      setShowFinalizarDG(false);
      setConfirmaFinalDG(false);
    } catch (err: any) {
      setAprobarDGError(err.message);
    } finally {
      setAprobandoDG(false);
    }
  };

  // N2: DG devuelve EN_REVISION_DG → DEVUELTO
  const handleDevolverDG = async () => {
    if (!comentarioDevolDG.trim()) return;
    setEnviandoDevolDG(true);
    setErrorDevolDG(null);
    try {
      await apiFetch(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/devolver-dg`, {
        method: 'PATCH',
        body:   JSON.stringify({ comentario: comentarioDevolDG.trim() }),
      });
      setTarea((prev) => ({ ...prev, estado: 'DEVUELTO' }));
      setShowDevolverDGModal(false);
      setComentarioDevolDG('');
    } catch (err: any) {
      setErrorDevolDG(err.message);
    } finally {
      setEnviandoDevolDG(false);
    }
  };

  const cargarComentarios = useCallback(async () => {
    setComentariosLoading(true);
    setComentariosError(null);
    try {
      const res = await apiFetch<{ data: Comentario[] }>(
        `/eventos/${tarea.evento_id}/tareas/${tarea.id}/comentarios`,
      );
      setComentarios(res.data);
    } catch (err: any) {
      setComentariosError(err.message);
    } finally {
      setComentariosLoading(false);
    }
  }, [tarea.evento_id, tarea.id]);

  // Abre la ventana unificada (historial + comentarios + documentos) y carga los comentarios
  const handleAbrir = () => {
    setShowHistorialModal(true);
    cargarComentarios();
  };

  const handleEnviarComentario = async () => {
    if (!nuevoComentario.trim()) return;
    setEnviando(true); setEnvioError(null);
    try {
      const res = await apiFetch<{ data: Comentario }>(
        `/eventos/${tarea.evento_id}/tareas/${tarea.id}/comentarios`,
        { method: 'POST', body: JSON.stringify({ contenido: nuevoComentario.trim() }) },
      );
      setComentarios((prev) => [...prev, res.data]);
      setNuevoComentario('');
    } catch (err: any) { setEnvioError(err.message); }
    finally { setEnviando(false); }
  };

  // Borrada: la fila se va en el acto. Esperar a que el padre recargue el detalle
  // dejaría un renglón fantasma que ya no existe en la base.
  if (borrada) return null;

  const cancelada = tarea.estado === 'CANCELADA';

  return (
    <div style={{
      borderRadius:    '8px',
      backgroundColor: cancelada ? '#F3F2F0' : '#F9FAFB',
      opacity:         cancelada ? 0.75 : 1,
      border:          `1px solid ${theme.colors.border}`,
      overflow:        'hidden',
    }}>
      {/* Fila principal */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '12px',
        padding:    '10px 12px',
        flexWrap:   'wrap',
      }}>
        {/* Título + asignado */}
        <div style={{ flex: 1, minWidth: '160px' }}>
          {editando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                value={edTitulo}
                onChange={(e) => setEdTitulo(e.target.value)}
                placeholder="Nombre de la actividad"
                style={{ width: '100%', padding: '6px 9px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, fontFamily: theme.font.family }}
              />
              <textarea
                value={edDesc}
                onChange={(e) => setEdDesc(e.target.value)}
                rows={2}
                placeholder="Descripción (opcional)"
                style={{ width: '100%', padding: '6px 9px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.78rem', fontFamily: theme.font.family, resize: 'vertical' }}
              />
              {errorEd && (
                <span style={{ fontSize: '0.72rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{errorEd}</span>
              )}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={guardarEdicion} disabled={guardandoEd || !edTitulo.trim()}
                  style={{ padding: '5px 12px', border: 'none', backgroundColor: theme.colors.primary, color: '#fff', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: guardandoEd ? 'wait' : 'pointer', opacity: !edTitulo.trim() ? 0.5 : 1, fontFamily: theme.font.family }}>
                  {guardandoEd ? 'Guardando…' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setEditando(false)} disabled={guardandoEd}
                  style={{ padding: '5px 12px', border: `1px solid ${theme.colors.border}`, background: '#fff', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: theme.colors.textPrimary }}>
                  {tarea.titulo}
                </p>
                {puedeEditar && !terminada && (
                  <button
                    type="button"
                    onClick={abrirEdicion}
                    title="Corregir el nombre y la descripción de la actividad"
                    style={{ border: `1px solid ${theme.colors.border}`, background: 'transparent', color: theme.colors.textSecondary, borderRadius: '5px', padding: '1px 7px', fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family }}
                  >
                    Editar
                  </button>
                )}
                {/* Un solo botón para las dos salidas. Se intenta borrar; si el
                    servidor dice que ya hay trabajo encima, ofrece cancelar. */}
                {puedeEditar && !terminada && (
                  <button
                    type="button"
                    onClick={intentarBorrar}
                    disabled={quitando}
                    title="Quitar esta actividad del evento"
                    style={{ border: `1px solid ${theme.colors.border}`, background: 'transparent', color: theme.colors.alert.red, borderRadius: '5px', padding: '1px 7px', fontSize: '0.66rem', fontWeight: 700, cursor: quitando ? 'wait' : 'pointer', fontFamily: theme.font.family }}
                  >
                    Quitar
                  </button>
                )}
              </div>
              {tarea.descripcion && (
                <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: theme.colors.textSecondary, lineHeight: 1.4 }}>
                  {tarea.descripcion}
                </p>
              )}
              {/* El porqué va a la vista, no escondido en un historial: es lo que
                  necesita saber quien la tenía asignada para no quedarse pensando
                  que se le desechó el esfuerzo. */}
              {cancelada && tarea.motivo_cancelacion && (
                <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: '#6B6560', fontStyle: 'italic', lineHeight: 1.4 }}>
                  <Icono nombre="alerta" inline />Cancelada: {tarea.motivo_cancelacion}
                </p>
              )}
              {errorQuitar && !cancelando && (
                <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: theme.colors.alert.red, lineHeight: 1.4 }}>
                  <Icono nombre="alerta" inline />{errorQuitar}
                </p>
              )}
              {cancelando && (
                <div style={{ marginTop: '8px', padding: '10px 12px', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {errorQuitar && (
                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#92400E', lineHeight: 1.4 }}>{errorQuitar}</p>
                  )}
                  <input
                    value={motivoCanc}
                    onChange={(e) => setMotivoCanc(e.target.value)}
                    placeholder="¿Por qué se cancela?"
                    style={{ width: '100%', padding: '6px 9px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.78rem', fontFamily: theme.font.family }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={confirmarCancelar} disabled={quitando || !motivoCanc.trim()}
                      style={{ padding: '5px 12px', border: 'none', backgroundColor: theme.colors.primary, color: '#fff', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: quitando ? 'wait' : 'pointer', opacity: !motivoCanc.trim() ? 0.5 : 1, fontFamily: theme.font.family }}>
                      {quitando ? 'Cancelando…' : 'Cancelar actividad'}
                    </button>
                    <button type="button" onClick={() => { setCancelando(false); setErrorQuitar(null); setMotivoCanc(''); }}
                      style={{ padding: '5px 12px', border: `1px solid ${theme.colors.border}`, background: '#fff', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>
                      Dejarla
                    </button>
                  </div>
                </div>
              )}
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                <Icono nombre="persona" inline />{tarea.asignado_a_nombre}
              </p>
            </>
          )}
        </div>

        {/* Badge estado */}
        <span style={{
          display:         'inline-flex',
          alignItems:      'center',
          padding:         '3px 10px',
          borderRadius:    '20px',
          fontSize:        '0.68rem',
          fontWeight:      700,
          backgroundColor: cfg.bg,
          color:           cfg.text,
          textTransform:   'uppercase',
          letterSpacing:   '0.05em',
          whiteSpace:      'nowrap',
        }}>
          {cfg.label}
        </span>

        {/* Fecha + indicadores */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {tarea.fecha_programada
              ? <span><Icono nombre="calendario" inline />Límite: <strong>{tarea.fecha_programada}</strong></span>
              : <span style={{ fontStyle: 'italic', color: theme.colors.grayMid }}>Sin fecha límite</span>}
            {tarea.vencida && (
              <span style={{ color: theme.colors.alert.red, fontWeight: 700, fontSize: '0.7rem' }}>Vencida</span>
            )}
            {!tarea.vencida && tarea.proxima_a_vencer && (
              <span style={{ color: theme.colors.alert.yellow, fontWeight: 700, fontSize: '0.7rem' }}>Próxima</span>
            )}
          </div>
        </div>

        {/* Botones de acción para EN_REVISION — solo el revisor N1 (director de la
            misma unidad). El responsable de otra unidad solo observa. */}
        {tarea.estado === 'EN_REVISION' && esRevisorN1 && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={handleAprobar}
              disabled={aprobando}
              style={{
                padding:         '5px 12px',
                backgroundColor: '#D1FAE5',
                color:           '#065F46',
                border:          '1px solid #6EE7B7',
                borderRadius:    '6px',
                fontSize:        '0.75rem',
                fontWeight:      700,
                cursor:          aprobando ? 'not-allowed' : 'pointer',
                opacity:         aprobando ? 0.6 : 1,
                fontFamily:      theme.font.family,
                flexShrink:      0,
              }}
            >
              {aprobando ? 'Aprobando…' : 'Aprobar'}
            </button>
            <button
              onClick={() => setShowDevolverModal(true)}
              disabled={aprobando}
              style={{
                padding:         '5px 12px',
                backgroundColor: '#FEF3C7',
                color:           '#92400E',
                border:          '1px solid #FCD34D',
                borderRadius:    '6px',
                fontSize:        '0.75rem',
                fontWeight:      700,
                cursor:          aprobando ? 'not-allowed' : 'pointer',
                opacity:         aprobando ? 0.6 : 1,
                fontFamily:      theme.font.family,
                flexShrink:      0,
              }}
            >
              <Icono nombre="regresarIzq" inline />Devolver
            </button>
          </div>
        )}

        {/* EN_REVISION_DG: DG ve botones de Finalizar y Devolver; otros ven indicador */}
        {tarea.estado === 'EN_REVISION_DG' && (
          esDG ? (
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
              <button
                onClick={() => { setShowFinalizarDG(true); setConfirmaFinalDG(false); setAprobarDGError(null); }}
                disabled={aprobandoDG}
                style={{ padding: '5px 12px', backgroundColor: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: aprobandoDG ? 'not-allowed' : 'pointer', opacity: aprobandoDG ? 0.6 : 1, fontFamily: theme.font.family }}
              >
                {aprobandoDG ? '…' : 'Finalizar'}
              </button>
              <button
                onClick={() => { setShowDevolverDGModal(true); setComentarioDevolDG(''); setErrorDevolDG(null); }}
                disabled={aprobandoDG}
                style={{ padding: '5px 12px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family }}
              >
                <Icono nombre="regresarIzq" inline />Devolver
              </button>
              {aprobarDGError && <span style={{ fontSize: '0.72rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{aprobarDGError}</span>}
            </div>
          ) : (
            <span style={{ fontSize: '0.75rem', color: '#8A0730', backgroundColor: '#FDE8EF', border: '1px solid #F2C9D6', borderRadius: '6px', padding: '5px 10px', fontWeight: 600, flexShrink: 0 }}>
              <Icono nombre="reloj" inline />Pendiente aprobación DG
            </span>
          )
        )}

        {/* FINALIZADO */}
        {(tarea.estado === 'FINALIZADO' || tarea.estado === 'COMPLETADA') && (
          <span style={{ fontSize: '0.75rem', color: '#065F46', backgroundColor: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: '6px', padding: '5px 10px', fontWeight: 600, flexShrink: 0 }}>
            <Icono nombre="checkCirculo" inline />Finalizado
          </span>
        )}

        {/* Botón único: Abrir — historial + comentarios + documentos en una ventana */}
        <button
          onClick={handleAbrir}
          style={{
            padding:         '5px 14px',
            backgroundColor: theme.colors.primary,
            color:           '#fff',
            border:          'none',
            borderRadius:    '6px',
            fontSize:        '0.75rem',
            fontWeight:      700,
            cursor:          'pointer',
            fontFamily:      theme.font.family,
            flexShrink:      0,
          }}
          title="Ver historial de avances, comentarios y documentos de la tarea"
          aria-label="Abrir seguimiento de la tarea"
        >
          <Icono nombre="lista" inline />Abrir
        </button>
      </div>

      {/* Error al aprobar */}
      {aprobarError && (
        <div style={{ padding: '6px 12px', backgroundColor: '#FEE2E2', fontSize: '0.78rem', color: theme.colors.alert.red }}>
          <Icono nombre="alerta" inline />{aprobarError}
        </div>
      )}

      {/* ── Modal: Devolver Tarea (N1) ───────────────────── */}
      <DevolverTareaModal
        open={showDevolverModal}
        tarea={tarea}
        onClose={() => setShowDevolverModal(false)}
        onSuccess={() => {
          setShowDevolverModal(false);
          setTarea((prev) => ({ ...prev, estado: 'DEVUELTO' }));
        }}
      />

      {/* ── Modal: Devolver desde DG (N2) ────────────────── */}
      {showDevolverDGModal && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDevolverDGModal(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '460px', fontFamily: theme.font.family }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}><Icono nombre="regresarIzq" inline />Devolver con observaciones</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{tarea.titulo}</p>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: theme.colors.textPrimary }}>
              Observaciones <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <textarea
              value={comentarioDevolDG}
              onChange={(e) => setComentarioDevolDG(e.target.value)}
              rows={4}
              placeholder="Indica qué debe corregirse o completarse…"
              disabled={enviandoDevolDG}
              style={{ width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.85rem', fontFamily: theme.font.family, resize: 'vertical' as const, marginBottom: '14px' }}
            />
            {errorDevolDG && <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{errorDevolDG}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDevolverDGModal(false)} disabled={enviandoDevolDG} style={{ padding: '8px 18px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              <button onClick={handleDevolverDG} disabled={enviandoDevolDG || !comentarioDevolDG.trim()} style={{ padding: '8px 18px', backgroundColor: '#F59E0B', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 700, cursor: (enviandoDevolDG || !comentarioDevolDG.trim()) ? 'not-allowed' : 'pointer', opacity: (enviandoDevolDG || !comentarioDevolDG.trim()) ? 0.6 : 1, fontFamily: theme.font.family }}>
                {enviandoDevolDG ? 'Devolviendo…' : '↩ Devolver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Finalizar (DG) con justificación obligatoria ── */}
      {showFinalizarDG && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFinalizarDG(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '460px', fontFamily: theme.font.family }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}><Icono nombre="check" inline />Finalizar actividad</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{tarea.titulo}</p>
            <div style={{ padding: '10px 12px', backgroundColor: '#D1FAE5', border: '1px solid #6EE7B7', borderLeft: '4px solid #059669', borderRadius: '8px', marginBottom: '14px', fontSize: '0.82rem', color: '#065F46', lineHeight: 1.5 }}>
              <Icono nombre="checkCirculo" inline /><strong>La Dirección General aprueba la finalización de esta actividad.</strong>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px', fontSize: '0.85rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmaFinalDG}
                onChange={(e) => setConfirmaFinalDG(e.target.checked)}
                disabled={aprobandoDG}
                style={{ marginTop: '2px', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Confirmo la finalización de esta actividad.</span>
            </label>
            {aprobarDGError && <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{aprobarDGError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowFinalizarDG(false)} disabled={aprobandoDG} style={{ padding: '8px 18px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              <button onClick={handleAprobarDG} disabled={aprobandoDG || !confirmaFinalDG} style={{ padding: '8px 18px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 700, cursor: (aprobandoDG || !confirmaFinalDG) ? 'not-allowed' : 'pointer', opacity: (aprobandoDG || !confirmaFinalDG) ? 0.6 : 1, fontFamily: theme.font.family }}>
                {aprobandoDG ? 'Finalizando…' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Historial de Revisión ──────────────────── */}
      <HistorialRevisionModal
        open={showHistorialModal}
        tarea={tarea}
        onClose={() => setShowHistorialModal(false)}
        comentarios={comentarios}
        comentariosLoading={comentariosLoading}
        comentariosError={comentariosError}
        puedeEscribir={puedeEscribir}
        nuevoComentario={nuevoComentario}
        setNuevoComentario={setNuevoComentario}
        enviando={enviando}
        envioError={envioError}
        onEnviarComentario={handleEnviarComentario}
      />
    </div>
  );
};

// ── EstadoBadge ───────────────────────────────────────────────

const EstadoBadge: React.FC<{ estado: 'ABIERTO' | 'CERRADO' }> = ({ estado }) => (
  <span style={{
    display:         'inline-flex',
    alignItems:      'center',
    padding:         '2px 10px',
    borderRadius:    '20px',
    fontSize:        '0.68rem',
    fontWeight:      700,
    backgroundColor: estado === 'ABIERTO' ? '#D1FAE5' : '#EDE9E4',
    color:           estado === 'ABIERTO' ? '#065F46' : '#3D3935',
    textTransform:   'uppercase',
    letterSpacing:   '0.05em',
    whiteSpace:      'nowrap',
  }}>
    {estado === 'ABIERTO' ? '● Abierto' : '● Cerrado'}
  </span>
);

// ── Styles ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties   = { padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' as const, fontFamily: theme.font.family };
const labelStyle: React.CSSProperties   = { display: 'block', marginBottom: '5px', fontWeight: 600, fontSize: '0.8rem', color: theme.colors.charcoal };
const btnPrimary: React.CSSProperties   = { padding: '9px 20px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const alertErrorStyle: React.CSSProperties = { padding: '10px 14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px' };
const modalFooter: React.CSSProperties  = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' };
