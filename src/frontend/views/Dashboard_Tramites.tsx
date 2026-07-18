/**
 * View: Dashboard_Tramites
 * Módulo de Seguimiento de Trámites
 * File: src/frontend/views/Dashboard_Tramites.tsx
 */

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { theme }   from '../theme';
import { Modal }   from '../components/Modal';
import { useIsMobile } from '../hooks/useIsMobile';
import { SeguimientoTramite } from '../components/SeguimientoTramite';

// ── Helpers ───────────────────────────────────────────────────

const Req: React.FC = () => <span style={{ color: theme.colors.alert.red }}>*</span>;

const inputStyle: React.CSSProperties   = { padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' as const, fontFamily: theme.font.family };
const labelStyle: React.CSSProperties   = { display: 'block', marginBottom: '5px', fontWeight: 600, fontSize: '0.8rem', color: theme.colors.charcoal };
const selectStyle: React.CSSProperties  = { padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.875rem', fontFamily: theme.font.family, backgroundColor: '#fff' };
const btnPrimary: React.CSSProperties   = { padding: '9px 20px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const alertStyle: React.CSSProperties   = { padding: '10px 14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px' };
const modalFooter: React.CSSProperties  = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' };

// ── API ───────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────

type EstatusTramite =
  | 'NUEVO'
  | 'EN_REVISION'
  | 'EN_PROCESO'
  | 'FINALIZADO'
  | 'RECHAZADO'
  | 'DEVUELTO_DELEGADO'
  | 'DEVUELTO_JURIDICO';

const TIPOS_TRAMITE = ['Convenio', 'Contrato', 'Consulta Jurídica', 'Acuerdo', 'Resolución', 'Otro'];

const ESTATUS_CFG: Record<EstatusTramite, { bg: string; text: string; label: string }> = {
  NUEVO:              { bg: '#DBEAFE', text: '#1E40AF', label: 'Nuevo'                },
  EN_REVISION:        { bg: '#FEF3C7', text: '#92400E', label: 'En Revisión'          },
  EN_PROCESO:         { bg: '#D1FAE5', text: '#065F46', label: 'En Proceso'           },
  FINALIZADO:         { bg: '#F3F4F6', text: '#374151', label: 'Finalizado'           },
  RECHAZADO:          { bg: '#FEE2E2', text: '#991B1B', label: 'Rechazado'            },
  DEVUELTO_DELEGADO:  { bg: '#FEF3C7', text: '#92400E', label: 'Devuelto al Delegado' },
  DEVUELTO_JURIDICO:  { bg: '#FEE2E2', text: '#991B1B', label: 'Devuelto a Jurídico'  },
};

interface Tramite {
  id:                   number;
  folio:                string;
  descripcion:          string;
  estatus:              EstatusTramite;
  unidad_nombre:        string;
  creado_por_nombre:    string;
  fecha_creacion:       string;
  fecha_compromiso:     string | null;
  fecha_cierre:         string | null;
  numero_ticket:        string;
  nombre_solicitante:   string;
  correo_solicitante:   string;
  telefono_solicitante: string;
  checklist_documentacion: boolean;
  checklist_proyecto:   boolean;
  fecha_registro:       string;
}

interface TramiteDetalle extends Tramite {
  documentos: {
    id: number;
    archivo_url: string;
    nombre_original: string;
    subido_por_nombre: string;
    subido_en: string;
  }[];
  auditoria: {
    id: number;
    estado_anterior: string | null;
    estado_nuevo: string;
    usuario_nombre: string;
    fecha_cambio: string;
    comentario: string | null;
  }[];
}

interface Comentario {
  id: number;
  tramite_id: number;
  contenido: string;
  creado_en: string;
  autor_id: number;
  autor_nombre: string;
}

type TramiteRol = 'creador' | 'revisor' | 'finalizador' | 'supervisora' | 'observador';

// ── Detectar rol del usuario en el módulo ─────────────────────

async function detectarRol(user: any): Promise<TramiteRol | null> {
  if (!user) return null;
  try {
    const res = await apiFetch<{ data: { unidad_tipo: string } }>(`/usuarios/${user.id}`);
    const tipo = res.data?.unidad_tipo;

    // Roles determinados por tipo de unidad (robusto, no depende de IDs):
    //   - DIRECCION_GENERAL → supervisora (ve todo)
    //   - DELEGACION + DIRECTOR (jefe/jefa) → creador (sube tickets)
    //   - DELEGACION + otro miembro         → observador (solo ve su delegación)
    if (tipo === 'DIRECCION_GENERAL') return 'supervisora';
    if (tipo === 'DELEGACION')        return user.rol === 'DIRECTOR' ? 'creador' : 'observador';

    // Revisor y Finalizador son actores ÚNICOS configurados en flujos.
    // Se resuelven igual que el backend (configuracion_flujos), NO por
    // unidad hardcodeada — así coincide con quién puede actuar de verdad.
    const flujoRes = await apiFetch<{ data: { modulo_clave: string; rol_flujo: string }[] }>(
      `/usuarios/mis-roles-flujo`,
    );
    const flujos = (flujoRes.data ?? []).filter((r) => r.modulo_clave === 'tramites_seguimiento');
    if (flujos.some((r) => r.rol_flujo === 'REVISOR'))     return 'revisor';
    if (flujos.some((r) => r.rol_flujo === 'FINALIZADOR')) return 'finalizador';
  } catch { /* fallback */ }
  return null;
}

// ── Agrupación bitácora ───────────────────────────────────────

type Categoria = 'ingresados' | 'en_proceso' | 'cerrados';

const CATEGORIA_CFG: Record<Categoria, {
  label:   string;
  icon:    string;
  header:  string;
  bg:      string;
  estados: EstatusTramite[];
}> = {
  ingresados: {
    label:   'Ingresados',
    icon:    '📥',
    header:  'rgb(255, 0, 50)',
    bg:      '#FFF0F3',
    estados: ['NUEVO', 'EN_REVISION', 'DEVUELTO_DELEGADO'],
  },
  en_proceso: {
    label:   'En Proceso',
    icon:    '⚙️',
    header:  'rgb(0, 122, 255)',
    bg:      '#EFF6FF',
    estados: ['EN_PROCESO', 'DEVUELTO_JURIDICO'],
  },
  cerrados: {
    label:   'Cerrados',
    icon:    '✅',
    header:  'rgb(52, 199, 89)',
    bg:      '#F0FDF4',
    estados: ['FINALIZADO', 'RECHAZADO'],
  },
};

function categorizar(estatus: EstatusTramite): Categoria {
  if (CATEGORIA_CFG.ingresados.estados.includes(estatus)) return 'ingresados';
  if (CATEGORIA_CFG.en_proceso.estados.includes(estatus)) return 'en_proceso';
  return 'cerrados';
}



export const Dashboard_Tramites: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const padX = isMobile ? '12px' : '32px';
  const [rol,      setRol]      = useState<TramiteRol | null>(null);
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Detalle
  const [detalle,        setDetalle]        = useState<TramiteDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [showDetalle,    setShowDetalle]    = useState(false);

  // Nuevo trámite
  const [showNuevo,          setShowNuevo]          = useState(false);
  const [nuevoTicket,        setNuevoTicket]        = useState('');
  const [nuevoNombre,        setNuevoNombre]        = useState('');
  const [nuevoCorreo,        setNuevoCorreo]        = useState('');
  const [nuevoTelefono,      setNuevoTelefono]      = useState('');
  const [nuevoDesc,          setNuevoDesc]          = useState('');
  const [nuevoArchivos,      setNuevoArchivos]      = useState<File[]>([]);
  const [nuevoCheckDoc,      setNuevoCheckDoc]      = useState(false);
  const [nuevoCheckProyecto, setNuevoCheckProyecto] = useState(false);
  const [creando,            setCreando]            = useState(false);
  const [errorNuevo,         setErrorNuevo]         = useState<string | null>(null);

  // Enviar a Mesa de Control (aprobar)
  const [showTurnar,    setShowTurnar]    = useState(false);
  const [tramiteTurnar, setTramiteTurnar] = useState<Tramite | null>(null);
  const [turnarComent,  setTurnarComent]  = useState('');
  const [fechaComp,     setFechaComp]     = useState('');
  const [turnando,      setTurnando]      = useState(false);
  const [errorTurnar,   setErrorTurnar]   = useState<string | null>(null);

  // Regresar al Delegado
  const [showDevolverDelegado,    setShowDevolverDelegado]    = useState(false);
  const [tramiteDevolverDelegado, setTramiteDevolverDelegado] = useState<Tramite | null>(null);
  const [comentDevolverDelegado,  setComentDevolverDelegado]  = useState('');
  const [devolviendo,             setDevolviendo]             = useState(false);
  const [errorDevolverDelegado,   setErrorDevolverDelegado]   = useState<string | null>(null);

  // Rechazar
  const [showRechazar,   setShowRechazar]   = useState(false);
  const [tramiteRechazar, setTramiteRechazar] = useState<Tramite | null>(null);
  const [motivoRechazo,  setMotivoRechazo]  = useState('');
  const [rechazando,     setRechazando]     = useState(false);
  const [errorRechazar,  setErrorRechazar]  = useState<string | null>(null);

  // Reenviar desde DEVUELTO_JURIDICO (revisor)
  const [showReenviarJuridico,    setShowReenviarJuridico]    = useState(false);
  const [tramiteReenviarJuridico, setTramiteReenviarJuridico] = useState<Tramite | null>(null);
  const [comentReenviarJuridico,  setComentReenviarJuridico]  = useState('');
  const [reenviandoJuridico,      setReenviandoJuridico]      = useState(false);
  const [errorReenviarJuridico,   setErrorReenviarJuridico]   = useState<string | null>(null);

  // Cerrar Proceso (finalizador)
  const [showCerrar,    setShowCerrar]    = useState(false);
  const [tramiteCerrar, setTramiteCerrar] = useState<Tramite | null>(null);
  const [comentCierre,  setComentCierre]  = useState('');
  const [cerrando,      setCerrando]      = useState(false);
  const [errorCerrar,   setErrorCerrar]   = useState<string | null>(null);

  // Devolver a Jurídico (finalizador)
  const [showDevolverJuridico,    setShowDevolverJuridico]    = useState(false);
  const [tramiteDevolverJuridico, setTramiteDevolverJuridico] = useState<Tramite | null>(null);
  const [comentDevolverJuridico,  setComentDevolverJuridico]  = useState('');
  const [devolviendoJuridico,     setDevolviendoJuridico]     = useState(false);
  const [errorDevolverJuridico,   setErrorDevolverJuridico]   = useState<string | null>(null);

  // Corregir y Reenviar (creador — DEVUELTO_DELEGADO)
  const [showCorregir,        setShowCorregir]        = useState(false);
  const [tramiteCorregir,     setTramiteCorregir]     = useState<Tramite | null>(null);
  const [corregirNombre,      setCorregirNombre]      = useState('');
  const [corregirCorreo,      setCorregirCorreo]      = useState('');
  const [corregirTelefono,    setCorregirTelefono]    = useState('');
  const [corregirComentarios, setCorregirComentarios] = useState('');
  const [corregirCheckDoc,    setCorregirCheckDoc]    = useState(false);
  const [corregirCheckProy,   setCorregirCheckProy]   = useState(false);
  const [corregirDetalle,     setCorregirDetalle]     = useState<TramiteDetalle | null>(null);
  const [reenviando,          setReenviando]          = useState(false);
  const [errorCorregir,       setErrorCorregir]       = useState<string | null>(null);

  // Filtros — ya no se usa filtro de estatus (layout bitácora agrupa por categoría)
  const [filtroEstatus] = useState('');

  useEffect(() => {
    if (!user) return;
    detectarRol(user).then(setRol);
  }, [user]);

  const fetchTramites = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = filtroEstatus ? `?estatus=${filtroEstatus}` : '';
      const res = await apiFetch<{ data: Tramite[] }>(`/tramites${qs}`);
      setTramites(res.data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [filtroEstatus]);

  useEffect(() => { if (rol) fetchTramites(); }, [rol, fetchTramites]);

  const abrirDetalle = async (t: Tramite) => {
    setShowDetalle(true);
    setDetalle(null);
    setDetalleLoading(true);
    try {
      const res = await apiFetch<{ data: TramiteDetalle }>(`/tramites/${t.id}`);
      setDetalle(res.data);
      if (t.estatus === 'NUEVO' && res.data.estatus === 'EN_REVISION') {
        setTramites(prev => prev.map(x => x.id === t.id ? { ...x, estatus: 'EN_REVISION' } : x));
      }
    } catch { setDetalle(null); }
    finally { setDetalleLoading(false); }
  };

  const abrirCorregir = async (t: Tramite) => {
    setTramiteCorregir(t);
    setCorregirNombre(t.nombre_solicitante ?? '');
    setCorregirCorreo(t.correo_solicitante ?? '');
    setCorregirTelefono(t.telefono_solicitante ?? '');
    setCorregirComentarios('');
    setCorregirCheckDoc(false);
    setCorregirCheckProy(false);
    setErrorCorregir(null);
    setCorregirDetalle(null);
    setShowCorregir(true);
    try {
      const res = await apiFetch<{ data: TramiteDetalle }>(`/tramites/${t.id}`);
      setCorregirDetalle(res.data);
    } catch { /* no-op */ }
  };

  // ── Handlers ──────────────────────────────────────────────

  const handleCrear = async (e: FormEvent) => {
    e.preventDefault();
    setCreando(true); setErrorNuevo(null);
    try {
      let body: FormData | string;
      if (nuevoArchivos.length > 0) {
        const fd = new FormData();
        fd.append('numero_ticket',        nuevoTicket);
        fd.append('nombre_solicitante',   nuevoNombre);
        fd.append('correo_solicitante',   nuevoCorreo);
        fd.append('telefono_solicitante', nuevoTelefono);
        fd.append('descripcion',          nuevoDesc);
        fd.append('checklist_documentacion', String(nuevoCheckDoc));
        fd.append('checklist_proyecto',      String(nuevoCheckProyecto));
        nuevoArchivos.forEach(f => fd.append('archivos', f));
        body = fd;
      } else {
        body = JSON.stringify({
          numero_ticket:           nuevoTicket,
          nombre_solicitante:      nuevoNombre,
          correo_solicitante:      nuevoCorreo,
          telefono_solicitante:    nuevoTelefono,
          descripcion:             nuevoDesc,
          checklist_documentacion: nuevoCheckDoc,
          checklist_proyecto:      nuevoCheckProyecto,
        });
      }
      const res = await apiFetch<{ data: Tramite }>('/tramites', { method: 'POST', body });
      setTramites(prev => [res.data, ...prev]);
      setShowNuevo(false);
      setNuevoTicket(''); setNuevoNombre(''); setNuevoCorreo(''); setNuevoTelefono('');
      setNuevoDesc(''); setNuevoArchivos([]);
      setNuevoCheckDoc(false); setNuevoCheckProyecto(false);
    } catch (err: any) { setErrorNuevo(err.message); }
    finally { setCreando(false); }
  };

  const handleTurnar = async (e: FormEvent) => {
    e.preventDefault();
    if (!tramiteTurnar) return;
    setTurnando(true); setErrorTurnar(null);
    try {
      await apiFetch(`/tramites/${tramiteTurnar.id}/aprobar`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: turnarComent, fecha_compromiso: fechaComp }),
      });
      setTramites(prev => prev.map(t => t.id === tramiteTurnar.id
        ? { ...t, estatus: 'EN_PROCESO', fecha_compromiso: fechaComp } : t));
      setShowTurnar(false); setTurnarComent(''); setFechaComp(''); setTramiteTurnar(null);
      if (detalle?.id === tramiteTurnar.id) setDetalle(d => d ? { ...d, estatus: 'EN_PROCESO' } : d);
    } catch (err: any) { setErrorTurnar(err.message); }
    finally { setTurnando(false); }
  };

  const handleDevolverDelegado = async (e: FormEvent) => {
    e.preventDefault();
    if (!tramiteDevolverDelegado) return;
    setDevolviendo(true); setErrorDevolverDelegado(null);
    try {
      await apiFetch(`/tramites/${tramiteDevolverDelegado.id}/devolver-delegado`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: comentDevolverDelegado }),
      });
      setTramites(prev => prev.map(t => t.id === tramiteDevolverDelegado.id
        ? { ...t, estatus: 'DEVUELTO_DELEGADO' } : t));
      setShowDevolverDelegado(false); setComentDevolverDelegado(''); setTramiteDevolverDelegado(null);
      if (detalle?.id === tramiteDevolverDelegado.id) setDetalle(d => d ? { ...d, estatus: 'DEVUELTO_DELEGADO' } : d);
    } catch (err: any) { setErrorDevolverDelegado(err.message); }
    finally { setDevolviendo(false); }
  };

  const handleRechazar = async (e: FormEvent) => {
    e.preventDefault();
    if (!tramiteRechazar) return;
    setRechazando(true); setErrorRechazar(null);
    try {
      await apiFetch(`/tramites/${tramiteRechazar.id}/rechazar`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: motivoRechazo }),
      });
      setTramites(prev => prev.map(t => t.id === tramiteRechazar.id ? { ...t, estatus: 'RECHAZADO' } : t));
      setShowRechazar(false); setMotivoRechazo(''); setTramiteRechazar(null);
      if (detalle?.id === tramiteRechazar.id) setDetalle(d => d ? { ...d, estatus: 'RECHAZADO' } : d);
    } catch (err: any) { setErrorRechazar(err.message); }
    finally { setRechazando(false); }
  };

  const handleReenviarJuridico = async (e: FormEvent) => {
    e.preventDefault();
    if (!tramiteReenviarJuridico) return;
    setReenviandoJuridico(true); setErrorReenviarJuridico(null);
    try {
      await apiFetch(`/tramites/${tramiteReenviarJuridico.id}/reenviar-juridico`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: comentReenviarJuridico }),
      });
      setTramites(prev => prev.map(t => t.id === tramiteReenviarJuridico.id
        ? { ...t, estatus: 'EN_PROCESO' } : t));
      setShowReenviarJuridico(false); setComentReenviarJuridico(''); setTramiteReenviarJuridico(null);
      if (detalle?.id === tramiteReenviarJuridico.id) setDetalle(d => d ? { ...d, estatus: 'EN_PROCESO' } : d);
    } catch (err: any) { setErrorReenviarJuridico(err.message); }
    finally { setReenviandoJuridico(false); }
  };

  const handleCerrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!tramiteCerrar) return;
    setCerrando(true); setErrorCerrar(null);
    try {
      await apiFetch(`/tramites/${tramiteCerrar.id}/cerrar`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: comentCierre }),
      });
      setTramites(prev => prev.map(t => t.id === tramiteCerrar.id ? { ...t, estatus: 'FINALIZADO' } : t));
      setShowCerrar(false); setComentCierre(''); setTramiteCerrar(null);
      if (detalle?.id === tramiteCerrar.id) setDetalle(d => d ? { ...d, estatus: 'FINALIZADO' } : d);
    } catch (err: any) { setErrorCerrar(err.message); }
    finally { setCerrando(false); }
  };

  const handleDevolverJuridico = async (e: FormEvent) => {
    e.preventDefault();
    if (!tramiteDevolverJuridico) return;
    setDevolviendoJuridico(true); setErrorDevolverJuridico(null);
    try {
      await apiFetch(`/tramites/${tramiteDevolverJuridico.id}/devolver-juridico`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: comentDevolverJuridico }),
      });
      setTramites(prev => prev.map(t => t.id === tramiteDevolverJuridico.id
        ? { ...t, estatus: 'DEVUELTO_JURIDICO' } : t));
      setShowDevolverJuridico(false); setComentDevolverJuridico(''); setTramiteDevolverJuridico(null);
      if (detalle?.id === tramiteDevolverJuridico.id) setDetalle(d => d ? { ...d, estatus: 'DEVUELTO_JURIDICO' } : d);
    } catch (err: any) { setErrorDevolverJuridico(err.message); }
    finally { setDevolviendoJuridico(false); }
  };

  const handleReenviarCorregido = async (e: FormEvent) => {
    e.preventDefault();
    if (!tramiteCorregir) return;
    setReenviando(true); setErrorCorregir(null);
    try {
      await apiFetch(`/tramites/${tramiteCorregir.id}/reenviar`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre_solicitante:      corregirNombre,
          correo_solicitante:      corregirCorreo,
          telefono_solicitante:    corregirTelefono,
          checklist_documentacion: corregirCheckDoc,
          checklist_proyecto:      corregirCheckProy,
          comentarios:             corregirComentarios.trim() || undefined,
        }),
      });
      setTramites(prev => prev.map(t => t.id === tramiteCorregir.id ? { ...t, estatus: 'NUEVO' } : t));
      setShowCorregir(false); setTramiteCorregir(null);
    } catch (err: any) { setErrorCorregir(err.message); }
    finally { setReenviando(false); }
  };

  const rolLabel: Record<TramiteRol, string> = {
    creador:     'Delegación',
    revisor:     'Director Jurídico',
    finalizador: 'Cierre de Trámites',
    supervisora: 'Supervisión General',
  };

  const hoy = new Date().toISOString().slice(0, 10);

  // Agrupar tickets por categoría
  const grupos: Record<Categoria, Tramite[]> = { ingresados: [], en_proceso: [], cerrados: [] };
  tramites.forEach(t => grupos[categorizar(t.estatus)].push(t));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.colors.background, fontFamily: theme.font.family }}>

      {/* Header */}
      <div style={{ padding: `20px ${padX} 0`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>🎫</span>
            <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 700 }}>
              Seguimiento de Resoluciones
            </h2>
          </div>
          <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            {user?.nombre} · {rol ? rolLabel[rol] : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={fetchTramites} disabled={loading} style={{ ...btnSecondary, padding: '8px 14px', fontSize: '0.8rem' }}>
            ↻ Actualizar
          </button>
          {rol === 'creador' && (
            <button onClick={() => { setShowNuevo(true); setErrorNuevo(null); }} style={btnPrimary}>
              + Nuevo Trámite
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de conteo */}
      <div style={{ padding: `16px ${padX} 0`, display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        {(Object.keys(grupos) as Categoria[]).map(cat => {
          const cfg   = CATEGORIA_CFG[cat];
          const count = grupos[cat].length;
          return (
            <div key={cat} style={{ flex: '1 1 160px', backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: '10px', boxShadow: theme.shadow.sm, overflow: 'hidden' }}>
              <div style={{ height: '5px', backgroundColor: cfg.header }} />
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
                  {cfg.icon}
                </span>
                <div>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: cfg.header, lineHeight: 1 }}>{count}</p>
                  <p style={{ margin: '3px 0 0', fontSize: '0.78rem', fontWeight: 600, color: theme.colors.textSecondary }}>{cfg.label}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ flex: '1 1 160px', backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: '10px', boxShadow: theme.shadow.sm, overflow: 'hidden' }}>
          <div style={{ height: '5px', backgroundColor: 'rgb(33, 37, 41)' }} />
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>🎫</span>
            <div>
              <p style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: 'rgb(33, 37, 41)', lineHeight: 1 }}>{tramites.length}</p>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', fontWeight: 600, color: theme.colors.textSecondary }}>Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading / Error */}
      <div style={{ padding: `16px ${padX} 0` }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: theme.colors.textSecondary }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
            <p style={{ margin: 0, fontWeight: 600 }}>Cargando trámites…</p>
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: '14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '8px' }}>
            <strong>Error:</strong> {error}
            <button onClick={fetchTramites} style={{ marginLeft: '12px', ...btnSecondary, padding: '4px 12px', fontSize: '0.8rem' }}>Reintentar</button>
          </div>
        )}
      </div>

      {/* Columnas bitácora */}
      {!loading && !error && (
        <div style={{ padding: `16px ${padX} 24px`, display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {(Object.keys(grupos) as Categoria[]).map(cat => {
            const cfg  = CATEGORIA_CFG[cat];
            const list = grupos[cat];
            return (
              <div key={cat} style={{ flex: '1 1 300px', minWidth: '280px', display: 'flex', flexDirection: 'column', borderRadius: '10px', overflow: 'hidden', boxShadow: theme.shadow.sm, border: `1px solid ${theme.colors.border}` }}>
                {/* Header columna */}
                <div style={{ backgroundColor: cfg.header, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{cfg.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>{cfg.label}</span>
                  </div>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: '20px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {list.length}
                  </span>
                </div>
                {/* Cuerpo columna */}
                <div style={{ backgroundColor: cfg.bg, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                  {list.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>Sin tickets</div>
                  ) : (
                    list.map(t => (
                      <TramiteCard
                        key={t.id}
                        tramite={t}
                        rol={rol}
                        onVerDetalle={() => abrirDetalle(t)}
                        onTurnar={() => { setTramiteTurnar(t); setTurnarComent(''); setFechaComp(''); setErrorTurnar(null); setShowTurnar(true); }}
                        onDevolverDelegado={() => { setTramiteDevolverDelegado(t); setComentDevolverDelegado(''); setErrorDevolverDelegado(null); setShowDevolverDelegado(true); }}
                        onRechazar={() => { setTramiteRechazar(t); setMotivoRechazo(''); setErrorRechazar(null); setShowRechazar(true); }}
                        onReenviarJuridico={() => { setTramiteReenviarJuridico(t); setComentReenviarJuridico(''); setErrorReenviarJuridico(null); setShowReenviarJuridico(true); }}
                        onCerrar={() => { setTramiteCerrar(t); setComentCierre(''); setErrorCerrar(null); setShowCerrar(true); }}
                        onDevolverJuridico={() => { setTramiteDevolverJuridico(t); setComentDevolverJuridico(''); setErrorDevolverJuridico(null); setShowDevolverJuridico(true); }}
                        onCorregir={() => abrirCorregir(t)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Nuevo Trámite ──────────────────────────── */}
      <Modal open={showNuevo} title="Nuevo Trámite" onClose={() => setShowNuevo(false)} width={560}>
        <form onSubmit={handleCrear} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Número de Ticket <Req /></label>
              <input type="text" value={nuevoTicket} onChange={e => setNuevoTicket(e.target.value)} required placeholder="Ej. TKT-2024-001" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Nombre completo del solicitante <Req /></label>
              <input type="text" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} required placeholder="Nombre completo" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Correo electrónico <Req /></label>
              <input type="email" value={nuevoCorreo} onChange={e => setNuevoCorreo(e.target.value)} required placeholder="correo@ejemplo.com" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Número telefónico <Req /></label>
              <input type="tel" value={nuevoTelefono} onChange={e => setNuevoTelefono(e.target.value)} required placeholder="Ej. 998 123 4567" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Descripción <Req /></label>
              <textarea value={nuevoDesc} onChange={e => setNuevoDesc(e.target.value)} rows={3} required placeholder="Describe el trámite…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Documentos adjuntos <span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional, máx. 10 MB c/u)</span></label>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={e => setNuevoArchivos(Array.from(e.target.files ?? []))}
                style={{ fontSize: '0.85rem', fontFamily: theme.font.family }}
              />
              {nuevoArchivos.length > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                  {nuevoArchivos.length} archivo{nuevoArchivos.length !== 1 ? 's' : ''} seleccionado{nuevoArchivos.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div style={{ backgroundColor: '#F9FAFB', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: theme.colors.textPrimary, lineHeight: 1.4 }}>
                <input type="checkbox" checked={nuevoCheckDoc} onChange={e => setNuevoCheckDoc(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Checklist 1</strong> — Confirmo que toda la documentación necesaria está correctamente adjunta al ID. <Req /></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: theme.colors.textPrimary, lineHeight: 1.4 }}>
                <input type="checkbox" checked={nuevoCheckProyecto} onChange={e => setNuevoCheckProyecto(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Checklist 2</strong> — Confirmo que el proyecto de resolución ha sido remitido a la Dirección Jurídica mediante correo electrónico. <Req /></span>
              </label>
            </div>
          </div>
          {errorNuevo && <div style={alertStyle}>{errorNuevo}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowNuevo(false)} style={btnSecondary}>Cancelar</button>
            <button
              type="submit"
              disabled={creando || !nuevoTicket.trim() || !nuevoNombre.trim() || !nuevoCorreo.trim() || !nuevoTelefono.trim() || !nuevoDesc.trim() || !nuevoCheckDoc || !nuevoCheckProyecto}
              style={{ ...btnPrimary, opacity: (creando || !nuevoCheckDoc || !nuevoCheckProyecto) ? 0.6 : 1 }}
            >
              {creando ? 'Creando…' : '+ Crear Trámite'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Enviar a Mesa de Control ──────────────── */}
      <Modal open={showTurnar} title="Enviar a Mesa de Control" onClose={() => setShowTurnar(false)} width={460}>
        <form onSubmit={handleTurnar} noValidate>
          <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: theme.colors.textSecondary }}>
            Trámite: <strong style={{ color: theme.colors.textPrimary }}>{tramiteTurnar?.folio}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Comentario <Req /></label>
              <textarea value={turnarComent} onChange={e => setTurnarComent(e.target.value)} rows={3} required placeholder="Comentario sobre la aprobación…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Fecha Compromiso <Req /></label>
              <input type="date" value={fechaComp} onChange={e => setFechaComp(e.target.value)} required min={hoy} style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          {errorTurnar && <div style={alertStyle}>{errorTurnar}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowTurnar(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={turnando || !turnarComent.trim() || !fechaComp} style={{ ...btnPrimary, backgroundColor: theme.colors.alert.green }}>
              {turnando ? 'Procesando…' : 'Procesar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Regresar al Delegado ───────────────────── */}
      <Modal open={showDevolverDelegado} title="Regresar al Delegado" onClose={() => setShowDevolverDelegado(false)} width={460}>
        <form onSubmit={handleDevolverDelegado} noValidate>
          <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: theme.colors.textSecondary }}>
            Trámite: <strong style={{ color: theme.colors.textPrimary }}>{tramiteDevolverDelegado?.folio}</strong>
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Comentario <Req /></label>
            <textarea value={comentDevolverDelegado} onChange={e => setComentDevolverDelegado(e.target.value)} rows={3} required placeholder="Explica qué información falta o qué requisito no se cumple…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          {errorDevolverDelegado && <div style={alertStyle}>{errorDevolverDelegado}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowDevolverDelegado(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={devolviendo || !comentDevolverDelegado.trim()} style={{ ...btnPrimary, backgroundColor: '#D97706' }}>
              {devolviendo ? 'Observando...' : 'Observar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Rechazar ───────────────────────────────── */}
      <Modal open={showRechazar} title="Rechazar Trámite" onClose={() => setShowRechazar(false)} width={460}>
        <form onSubmit={handleRechazar} noValidate>
          <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: theme.colors.textSecondary }}>
            Trámite: <strong style={{ color: theme.colors.textPrimary }}>{tramiteRechazar?.folio}</strong>
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Justificación del rechazo <Req /></label>
            <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} rows={3} required placeholder="Justificación del rechazo…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          {errorRechazar && <div style={alertStyle}>{errorRechazar}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowRechazar(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={rechazando || !motivoRechazo.trim()} style={{ ...btnPrimary, backgroundColor: theme.colors.alert.red }}>
              {rechazando ? 'Rechazando...' : 'Rechazar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Reenviar a TICS (desde DEVUELTO_JURIDICO) ─ */}
      <Modal open={showReenviarJuridico} title="Subsanar Trámite" onClose={() => setShowReenviarJuridico(false)} width={460}>
        <form onSubmit={handleReenviarJuridico} noValidate>
          <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: theme.colors.textSecondary }}>
            Trámite: <strong style={{ color: theme.colors.textPrimary }}>{tramiteReenviarJuridico?.folio}</strong>
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Comentario <Req /></label>
            <textarea value={comentReenviarJuridico} onChange={e => setComentReenviarJuridico(e.target.value)} rows={3} required placeholder="Comentario para reenviar a TICS…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          {errorReenviarJuridico && <div style={alertStyle}>{errorReenviarJuridico}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowReenviarJuridico(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={reenviandoJuridico || !comentReenviarJuridico.trim()} style={{ ...btnPrimary, backgroundColor: '#2563EB' }}>
              {reenviandoJuridico ? 'Subsanando...' : 'Subsanar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Cerrar Proceso ─────────────────────────── */}
      <Modal open={showCerrar} title="Cerrar Proceso" onClose={() => setShowCerrar(false)} width={460}>
        <form onSubmit={handleCerrar} noValidate>
          <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: theme.colors.textSecondary }}>
            Trámite: <strong style={{ color: theme.colors.textPrimary }}>{tramiteCerrar?.folio}</strong>
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Comentario de cierre <Req /></label>
            <textarea value={comentCierre} onChange={e => setComentCierre(e.target.value)} rows={3} required placeholder="Describe cómo se cerró el trámite…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          {errorCerrar && <div style={alertStyle}>{errorCerrar}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowCerrar(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={cerrando || !comentCierre.trim()} style={{ ...btnPrimary, backgroundColor: '#374151' }}>
              {cerrando ? 'Cerrando…' : '🔒 Cerrar Proceso'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Devolver a Jurídico ────────────────────── */}
      <Modal open={showDevolverJuridico} title="Devolver a Jurídico" onClose={() => setShowDevolverJuridico(false)} width={460}>
        <form onSubmit={handleDevolverJuridico} noValidate>
          <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: theme.colors.textSecondary }}>
            Trámite: <strong style={{ color: theme.colors.textPrimary }}>{tramiteDevolverJuridico?.folio}</strong>
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Comentario <Req /></label>
            <textarea value={comentDevolverJuridico} onChange={e => setComentDevolverJuridico(e.target.value)} rows={3} required placeholder="Explica por qué no está listo para cierre…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          {errorDevolverJuridico && <div style={alertStyle}>{errorDevolverJuridico}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowDevolverJuridico(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={devolviendoJuridico || !comentDevolverJuridico.trim()} style={{ ...btnPrimary, backgroundColor: '#EA580C' }}>
              {devolviendoJuridico ? 'Devolviendo…' : '↩ Devolver a Jurídico'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Corregir y Reenviar ────────────────────── */}
      <Modal open={showCorregir} title="Corregir y Reenviar Trámite" onClose={() => setShowCorregir(false)} width={560}>
        <form onSubmit={handleReenviarCorregido} noValidate>
          {corregirDetalle && (() => {
            const comentRevision = [...corregirDetalle.auditoria]
              .reverse()
              .find(a => a.estado_nuevo === 'DEVUELTO_DELEGADO' && a.comentario);
            return comentRevision ? (
              <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.78rem', color: '#92400E' }}>📋 Comentario del Revisor:</p>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#78350F', lineHeight: 1.5 }}>{comentRevision.comentario}</p>
              </div>
            ) : null;
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Nombre completo del solicitante <Req /></label>
              <input type="text" value={corregirNombre} onChange={e => setCorregirNombre(e.target.value)} required style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Correo electrónico <Req /></label>
              <input type="email" value={corregirCorreo} onChange={e => setCorregirCorreo(e.target.value)} required style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Número telefónico <Req /></label>
              <input type="tel" value={corregirTelefono} onChange={e => setCorregirTelefono(e.target.value)} required style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ backgroundColor: '#F9FAFB', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: theme.colors.textPrimary, lineHeight: 1.4 }}>
                <input type="checkbox" checked={corregirCheckDoc} onChange={e => setCorregirCheckDoc(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Checklist 1</strong> — Confirmo que toda la documentación necesaria está correctamente adjunta al ID. <Req /></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: theme.colors.textPrimary, lineHeight: 1.4 }}>
                <input type="checkbox" checked={corregirCheckProy} onChange={e => setCorregirCheckProy(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Checklist 2</strong> — Confirmo que el proyecto de resolución ha sido remitido a la Dirección Jurídica mediante correo electrónico. <Req /></span>
              </label>
            </div>
            <div>
              <label style={labelStyle}>Comentarios <span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>(opcional)</span></label>
              <textarea value={corregirComentarios} onChange={e => setCorregirComentarios(e.target.value)} rows={2} placeholder="Comentarios adicionales…" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
            </div>
          </div>
          {errorCorregir && <div style={alertStyle}>{errorCorregir}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowCorregir(false)} style={btnSecondary}>Cancelar</button>
            <button
              type="submit"
              disabled={reenviando || !corregirNombre.trim() || !corregirCorreo.trim() || !corregirTelefono.trim() || !corregirCheckDoc || !corregirCheckProy}
              style={{ ...btnPrimary, opacity: (!corregirCheckDoc || !corregirCheckProy) ? 0.6 : 1 }}
            >
              {reenviando ? 'Reenviando…' : '↩ Reenviar Trámite'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Detalle ────────────────────────────────── */}
      <Modal open={showDetalle} title={detalle ? `${detalle.folio}` : 'Cargando…'} onClose={() => setShowDetalle(false)} width={700}>
        {detalleLoading && <p style={{ textAlign: 'center', padding: '32px', color: theme.colors.textSecondary }}>⏳ Cargando…</p>}
        {!detalleLoading && detalle && (
          <DetallePanel
            detalle={detalle}
            rol={rol}
            onTurnar={() => { setTramiteTurnar(detalle); setTurnarComent(''); setFechaComp(''); setErrorTurnar(null); setShowDetalle(false); setShowTurnar(true); }}
            onDevolverDelegado={() => { setTramiteDevolverDelegado(detalle); setComentDevolverDelegado(''); setErrorDevolverDelegado(null); setShowDetalle(false); setShowDevolverDelegado(true); }}
            onRechazar={() => { setTramiteRechazar(detalle); setMotivoRechazo(''); setErrorRechazar(null); setShowDetalle(false); setShowRechazar(true); }}
            onReenviarJuridico={() => { setTramiteReenviarJuridico(detalle); setComentReenviarJuridico(''); setErrorReenviarJuridico(null); setShowDetalle(false); setShowReenviarJuridico(true); }}
            onCerrar={() => { setTramiteCerrar(detalle); setComentCierre(''); setErrorCerrar(null); setShowDetalle(false); setShowCerrar(true); }}
            onDevolverJuridico={() => { setTramiteDevolverJuridico(detalle); setComentDevolverJuridico(''); setErrorDevolverJuridico(null); setShowDetalle(false); setShowDevolverJuridico(true); }}
            onComentarioAgregado={() => setDetalle(d => d ? { ...d } : d)}
          />
        )}
      </Modal>
    </div>
  );
};

// ── TramiteCard ───────────────────────────────────────────────

interface TramiteCardProps {
  tramite:            Tramite;
  rol:                TramiteRol | null;
  onVerDetalle:       () => void;
  onTurnar:           () => void;
  onDevolverDelegado: () => void;
  onRechazar:         () => void;
  onReenviarJuridico: () => void;
  onCerrar:           () => void;
  onDevolverJuridico: () => void;
  onCorregir:         () => void;
}

const TramiteCard: React.FC<TramiteCardProps> = ({
  tramite, rol, onVerDetalle, onTurnar, onDevolverDelegado, onRechazar,
  onReenviarJuridico, onCerrar, onDevolverJuridico, onCorregir,
}) => {
  const cfg = ESTATUS_CFG[tramite.estatus] ?? ESTATUS_CFG.NUEVO;
  const esRevisor     = rol === 'revisor';
  const esFinalizador = rol === 'finalizador';
  const esCreador     = rol === 'creador';

  const puedeAccionRevisor    = esRevisor && ['NUEVO', 'EN_REVISION'].includes(tramite.estatus);
  const puedeReenviarJuridico = esRevisor && tramite.estatus === 'DEVUELTO_JURIDICO';
  const puedeCerrar           = esFinalizador && tramite.estatus === 'EN_PROCESO';
  const puedeDevolverJuridico = esFinalizador && tramite.estatus === 'EN_PROCESO';
  const puedeCorregir         = esCreador && tramite.estatus === 'DEVUELTO_DELEGADO';

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '7px',
      boxShadow: theme.shadow.sm,
      border: `1px solid ${theme.colors.border}`,
      borderLeft: `4px solid ${cfg.text}`,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 12px',
      flexWrap: 'wrap',
    }}>
      {/* Badge estatus */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: '20px', fontSize: '0.62rem', fontWeight: 700,
        backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {cfg.label}
      </span>

      {/* Número de ticket */}
      <span style={{ fontWeight: 700, fontSize: '0.82rem', color: theme.colors.primary, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {tramite.numero_ticket ? `#${tramite.numero_ticket}` : tramite.folio}
      </span>

      {/* Delegación */}
      <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, flex: 1, minWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        🏛 {tramite.unidad_nombre}
      </span>

      {/* Fecha */}
      <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, whiteSpace: 'nowrap', flexShrink: 0 }}>
        📅 {new Date(tramite.fecha_creacion).toLocaleDateString('es-MX')}
      </span>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={onVerDetalle} style={{ ...btnSecondary, padding: '3px 10px', fontSize: '0.7rem' }}>Ver detalle</button>
        {puedeCorregir && (
          <button onClick={onCorregir} style={{ ...btnPrimary, padding: '3px 10px', fontSize: '0.7rem', backgroundColor: '#D97706' }}>✏ Corregir</button>
        )}
        {puedeAccionRevisor && (
          <>
            <button onClick={onTurnar}           style={{ ...btnPrimary, padding: '3px 10px', fontSize: '0.7rem', backgroundColor: theme.colors.alert.green }}>Procesar</button>
            <button onClick={onDevolverDelegado} style={{ ...btnPrimary, padding: '3px 10px', fontSize: '0.7rem', backgroundColor: '#D97706' }}>Observar</button>
            <button onClick={onRechazar}         style={{ ...btnPrimary, padding: '3px 10px', fontSize: '0.7rem', backgroundColor: theme.colors.alert.red }}>Rechazar</button>
          </>
        )}
        {puedeReenviarJuridico && (
          <button onClick={onReenviarJuridico} style={{ ...btnPrimary, padding: '3px 10px', fontSize: '0.7rem', backgroundColor: '#2563EB' }}>Subsanar</button>
        )}
        {puedeCerrar && (
          <button onClick={onCerrar} style={{ ...btnPrimary, padding: '3px 10px', fontSize: '0.7rem', backgroundColor: '#374151' }}>🔒 Cerrar</button>
        )}
        {puedeDevolverJuridico && (
          <button onClick={onDevolverJuridico} style={{ ...btnPrimary, padding: '3px 10px', fontSize: '0.7rem', backgroundColor: '#EA580C' }}>↩ Jurídico</button>
        )}
      </div>
    </div>
  );
};

// ── DetallePanel ──────────────────────────────────────────────

interface DetallePanelProps {
  detalle:              TramiteDetalle;
  rol:                  TramiteRol | null;
  onTurnar:             () => void;
  onDevolverDelegado:   () => void;
  onRechazar:           () => void;
  onReenviarJuridico:   () => void;
  onCerrar:             () => void;
  onDevolverJuridico:   () => void;
  onComentarioAgregado: () => void;
}

const DetallePanel: React.FC<DetallePanelProps> = ({
  detalle, rol, onTurnar, onDevolverDelegado, onRechazar,
  onReenviarJuridico, onCerrar, onDevolverJuridico,
}) => {
  const cfg = ESTATUS_CFG[detalle.estatus] ?? ESTATUS_CFG.NUEVO;

  const esRevisor     = rol === 'revisor';
  const esFinalizador = rol === 'finalizador';

  const puedeAccionRevisor    = esRevisor && ['NUEVO', 'EN_REVISION'].includes(detalle.estatus);
  const puedeReenviarJuridico = esRevisor && detalle.estatus === 'DEVUELTO_JURIDICO';
  const puedeCerrar           = esFinalizador && detalle.estatus === 'EN_PROCESO';
  const puedeDevolverJuridico = esFinalizador && detalle.estatus === 'EN_PROCESO';
  const puedeCommentar        = rol !== 'supervisora';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
      {/* Info básica */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase' }}>{cfg.label}</span>
        <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary }}>· {detalle.unidad_nombre}</span>
      </div>

      {/* Datos del solicitante */}
      {detalle.nombre_solicitante && (
        <div style={{ backgroundColor: '#F9FAFB', borderRadius: '8px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.78rem', color: theme.colors.charcoal }}>👤 Datos del solicitante</p>
          <p style={{ margin: 0, fontSize: '0.82rem', color: theme.colors.textPrimary }}>{detalle.nombre_solicitante}</p>
          {detalle.correo_solicitante && <p style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary }}>✉ {detalle.correo_solicitante}</p>}
          {detalle.telefono_solicitante && <p style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary }}>📞 {detalle.telefono_solicitante}</p>}
          {detalle.numero_ticket && <p style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary }}>🎫 Ticket: {detalle.numero_ticket}</p>}
        </div>
      )}

      <div style={{ backgroundColor: '#F9FAFB', borderRadius: '8px', padding: '12px 14px' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: theme.colors.textPrimary, lineHeight: 1.6 }}>{detalle.descripcion}</p>
      </div>

      {/* Fechas */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: theme.colors.textSecondary, flexWrap: 'wrap' }}>
        <span>📅 Creado: {new Date(detalle.fecha_creacion).toLocaleDateString('es-MX')}</span>
        {detalle.fecha_compromiso && <span style={{ color: theme.colors.primary }}>🤝 Compromiso: {detalle.fecha_compromiso}</span>}
        {detalle.fecha_cierre && <span style={{ color: theme.colors.alert.green }}>✅ Cerrado: {new Date(detalle.fecha_cierre).toLocaleDateString('es-MX')}</span>}
      </div>

      {/* Documentos */}
      {detalle.documentos.length > 0 && (
        <div>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.8rem', color: theme.colors.charcoal }}>📎 Documentos adjuntos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {detalle.documentos.map(d => (
              <a key={d.id} href={`/files${d.archivo_url}`} target="_blank" rel="noreferrer"
                style={{ fontSize: '0.8rem', color: theme.colors.primary, textDecoration: 'underline' }}>
                {d.nombre_original || d.archivo_url.split('/').pop()}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Acciones del revisor */}
      {puedeAccionRevisor && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: `1px solid ${theme.colors.border}` }}>
          <button onClick={onTurnar}           style={{ ...btnPrimary, backgroundColor: theme.colors.alert.green }}>Procesar</button>
          <button onClick={onDevolverDelegado} style={{ ...btnPrimary, backgroundColor: '#D97706' }}>Observar</button>
          <button onClick={onRechazar}         style={{ ...btnPrimary, backgroundColor: theme.colors.alert.red }}>✗ Rechazar</button>
        </div>
      )}

      {/* Acción revisor — DEVUELTO_JURIDICO */}
      {puedeReenviarJuridico && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: `1px solid ${theme.colors.border}` }}>
          <button onClick={onReenviarJuridico} style={{ ...btnPrimary, backgroundColor: '#2563EB' }}>Subsanar</button>
        </div>
      )}

      {/* Acciones del finalizador */}
      {(puedeCerrar || puedeDevolverJuridico) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: `1px solid ${theme.colors.border}` }}>
          {puedeCerrar           && <button onClick={onCerrar}           style={{ ...btnPrimary, backgroundColor: '#374151' }}>🔒 Cerrar Proceso</button>}
          {puedeDevolverJuridico && <button onClick={onDevolverJuridico} style={{ ...btnPrimary, backgroundColor: '#EA580C' }}>↩ Devolver a Jurídico</button>}
        </div>
      )}

      {/* Línea de tiempo unificada: movimientos (🔄) + comentarios (💬) */}
      <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: '12px' }}>
        <SeguimientoTramite
          tramiteId={detalle.id}
          auditoria={detalle.auditoria}
          puedeEscribir={puedeCommentar}
        />
      </div>
    </div>
  );
};
