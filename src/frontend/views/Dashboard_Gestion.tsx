/**
 * View: Dashboard_Gestion
 * Master-Detail table for ENCARGADO, SECRETARIA, and DIRECTOR roles.
 *
 * Features:
 *  - Search by folio / remitente
 *  - Date-range filter
 *  - Traffic-light deadline indicator
 *  - Export to Excel (CSV)
 *  - ENCARGADO: Assign abogado modal + VoBo action
 *  - SECRETARIA: Download project + Upload signed PDF modal
 */

import React, { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { theme } from '../theme';
import { StatusBadge }  from '../components/StatusBadge';
import { TerminoTimer } from '../components/TerminoTimer';
import { Modal }        from '../components/Modal';
import { OficioDetalle } from '../components/OficioDetalle';
import { SiqrooPanel }   from '../components/SiqrooPanel';
import { useAuth }      from '../context/AuthContext';
import { useIsMobile }  from '../hooks/useIsMobile';
import {
  getOficios,
  getAbogados,
  getCandidatosAsignacion,
  asignarOficio,
  reasignarOficio,
  subirProyecto,
  aprobarVobo,
  finalizarOficio,
  reconsiderarOficio,
  getComentarios,
  getOficioDocumentos,
} from '../api';
import type { Oficio, Abogado, EstatusOficio } from '../types';
import type { ComentarioReconsideracion, OficioDocumento } from '../api';
import { textoCompresion } from '../utils/compresion';
import { FiltrosOficios } from '../components/FiltrosOficios';
import type { OficiosFiltros } from '../components/FiltrosOficios';

const LIMIT = 20;

export const Dashboard_Gestion: React.FC = () => {
  const { user } = useAuth();
  const rol = user?.rol;
  const isMobile = useIsMobile();

  // Verificar si el usuario es el ENCARGADO configurado en flujos
  const [esEncargado, setEsEncargado] = useState(rol === 'ENCARGADO');

  useEffect(() => {
    if (rol === 'ENCARGADO') { setEsEncargado(true); return; }
    if (!user) return;
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL ?? '/api/v1'}/usuarios/mis-roles-flujo`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((body: any) => {
        const roles: any[] = body.data ?? [];
        const esEl = roles.some(
          (r: any) => r.modulo_clave === 'oficialia_partes' && r.rol_flujo === 'ENCARGADO'
        );
        setEsEncargado(esEl);
      })
      .catch(() => {});
  }, [user, rol]);

  // ── List state ────────────────────────────────────────────
  const [oficios,   setOficios]   = useState<Oficio[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [filtros,   setFiltros]   = useState<OficiosFiltros>({ search: '', estatus: '', termino: '', desde: '', hasta: '', siqroo_pendiente: false, pendiente_firma: false });
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Selected oficio (detail panel) ───────────────────────
  const [selected, setSelected] = useState<Oficio | null>(null);

  // ── Assign modal (ENCARGADO) ──────────────────────────────
  const [showAssign,    setShowAssign]    = useState(false);
  const [abogados,      setAbogados]      = useState<Abogado[]>([]);
  const [abogadoId,     setAbogadoId]     = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [assignError,   setAssignError]   = useState<string | null>(null);
  const [assigning,     setAssigning]     = useState(false);

  // ── Trabajar modal (ENCARGADO sube su propio proyecto) ────
  const [showTrabajar,  setShowTrabajar]  = useState(false);
  const [trabajarFile,  setTrabajarFile]  = useState<File | null>(null);
  const [trabajarError, setTrabajarError] = useState<string | null>(null);
  const [trabajando,    setTrabajando]    = useState(false);

  // ── Reassign modal (ENCARGADO) ────────────────────────────
  const [showReassign,    setShowReassign]    = useState(false);
  const [reassignAbogadoId, setReassignAbogadoId] = useState('');
  const [reassignMotivo,  setReassignMotivo]  = useState('');
  const [reassignError,   setReassignError]   = useState<string | null>(null);
  const [reassigning,     setReassigning]     = useState(false);

  // ── Upload signed PDF modal (SECRETARIA) ─────────────────
  const [showUpload,   setShowUpload]   = useState(false);
  const [signedFile,   setSignedFile]   = useState<File | null>(null);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);

  // ── Reconsideración modal (ENCARGADO) ─────────────────────
  const [showRecon,      setShowRecon]      = useState(false);
  const [reconComentario,setReconComentario]= useState('');
  const [reconError,     setReconError]     = useState<string | null>(null);
  const [reconLoading,   setReconLoading]   = useState(false);
  const [comentarios,    setComentarios]    = useState<ComentarioReconsideracion[]>([]);
  const [loadingComents, setLoadingComents] = useState(false);

  // ── Action feedback ───────────────────────────────────────
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // ¿El oficio tiene información SIQROO pendiente por completar?
  const siqrooPend = (o: Oficio) => !!o.siqroo_aplica && !o.siqroo_control_interno;

  const fetchOficios = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await getOficios({
        page, limit: LIMIT,
        search:           filtros.search || undefined,
        estatus:          filtros.estatus || undefined,
        termino:          filtros.termino || undefined,
        desde:            filtros.desde || undefined,
        hasta:            filtros.hasta || undefined,
        siqroo_pendiente: filtros.siqroo_pendiente || undefined,
        pendiente_firma:  filtros.pendiente_firma || undefined,
      });
      setOficios(res.data);
      setTotal(res.meta.total);
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filtros]);

  useEffect(() => { fetchOficios(); }, [fetchOficios]);

  // Load candidatos when assign or reassign modal opens.
  // Usuarios de la unidad del encargado que tienen el módulo de oficios habilitado.
  useEffect(() => {
    if ((showAssign || showReassign) && abogados.length === 0) {
      getCandidatosAsignacion()
        .then((data) => setAbogados(data))
        .catch(() => {});
    }
  }, [showAssign, showReassign]);

  // ── Handlers ──────────────────────────────────────────────

  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !abogadoId) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await asignarOficio(selected.id, { abogado_id: Number(abogadoId), observaciones: observaciones || undefined });
      setShowAssign(false);
      setAbogadoId(''); setObservaciones('');
      setActionMsg('Oficio asignado correctamente');
      fetchOficios();
    } catch (err: any) {
      setAssignError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleReassign = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !reassignAbogadoId) return;
    setReassigning(true);
    setReassignError(null);
    try {
      await reasignarOficio(selected.id, { abogado_id: Number(reassignAbogadoId), motivo: reassignMotivo || undefined });
      setShowReassign(false);
      setReassignAbogadoId(''); setReassignMotivo('');
      setActionMsg('Oficio reasignado correctamente');
      fetchOficios();
    } catch (err: any) {
      setReassignError(err.message);
    } finally {
      setReassigning(false);
    }
  };

  const handleVobo = async (oficio: Oficio) => {
    if (!confirm(`¿Otorgar VoBo al oficio ${oficio.folio}?`)) return;
    try {
      await aprobarVobo(oficio.id);
      setActionMsg('VoBo otorgado correctamente');
      fetchOficios();
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  // El encargado sube su propio proyecto de contestación (trabaja el oficio directo)
  const handleTrabajar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !trabajarFile) { setTrabajarError('Selecciona el archivo del proyecto'); return; }
    setTrabajando(true); setTrabajarError(null);
    try {
      await subirProyecto(selected.id, trabajarFile);
      setShowTrabajar(false); setTrabajarFile(null);
      setActionMsg('Proyecto subido. Queda en revisión para el VoBo del delegado.');
      fetchOficios();
    } catch (err: any) { setTrabajarError(err.message); }
    finally { setTrabajando(false); }
  };

  // Abre/descarga un archivo protegido (requiere token). Un <a href> normal no
  // envía el Authorization, por eso hay que traerlo con fetch y abrir el blob.
  const abrirArchivo = async (url: string) => {
    setActionMsg(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(res.status === 404 ? 'El documento aún no está disponible' : `No se pudo abrir (HTTP ${res.status})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch (err: any) {
      setActionMsg(err.message || 'No se pudo abrir el documento');
    }
  };

  // Cargar comentarios cuando se selecciona un oficio EN_RECONSIDERACION
  const handleSelectOficio = (oficio: Oficio) => {
    setSelected(oficio);
    setComentarios([]);
    if (['EN_RECONSIDERACION', 'EN_REVISION'].includes(oficio.estatus)) {
      setLoadingComents(true);
      getComentarios(oficio.id)
        .then(({ data }) => setComentarios(data))
        .catch(() => {})
        .finally(() => setLoadingComents(false));
    }
  };

  const handleReconsiderar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !reconComentario.trim()) return;
    setReconLoading(true);
    setReconError(null);
    try {
      await reconsiderarOficio(selected.id, reconComentario.trim());
      setShowRecon(false);
      setReconComentario('');
      setActionMsg('Correcciones enviadas al jurídico');
      fetchOficios();
    } catch (err: any) {
      setReconError(err.message);
    } finally {
      setReconLoading(false);
    }
  };

  const handleUploadSigned = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !signedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const resp = await finalizarOficio(selected.id, signedFile);
      const aviso = textoCompresion(resp.compresion);
      setShowUpload(false);
      setSignedFile(null);
      setActionMsg('Oficio finalizado correctamente' + (aviso ? ` · 📉 ${aviso}` : ''));
      fetchOficios();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Fecha "sólo día" (columna DATE) sin desfase por zona horaria.
  const soloFecha = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : s;
  };

  const exportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const filtroBase = {
        search:           filtros.search || undefined,
        estatus:          filtros.estatus || undefined,
        termino:          filtros.termino || undefined,
        desde:            filtros.desde || undefined,
        hasta:            filtros.hasta || undefined,
        siqroo_pendiente: filtros.siqroo_pendiente || undefined,
        pendiente_firma:  filtros.pendiente_firma || undefined,
      };
      // Traer TODOS los resultados filtrados (no solo la página visible)
      const todos: Oficio[] = [];
      for (let pagina = 1; ; pagina++) {
        const res = await getOficios({ ...filtroBase, page: pagina, limit: 100 });
        todos.push(...res.data);
        if (res.data.length === 0 || todos.length >= res.meta.total) break;
      }

      const headers = [
        'N° OFICIO INTERNO', 'N° OFICIO ORIGEN', 'DIRECCIÓN O DEPENDENCIA', 'SUBUNIDAD',
        'FECHA DEL OFICIO', 'FECHA ACUSE', 'TURNADO A', 'ASUNTO',
      ];
      const rows = todos.map((o) => [
        o.folio,
        o.numero_oficio_origen ?? '',
        o.dependencia_origen ?? '',
        o.unidad_interna ?? '',
        o.fecha_oficio ? soloFecha(o.fecha_oficio) : '',
        new Date(o.fecha_registro).toLocaleDateString('es-MX'),
        o.dirigido_a_nombre ?? '',
        o.descripcion_solicitud ?? '',
      ]);

      // Escape CSV robusto; BOM para que Excel muestre bien los acentos.
      const esc = (c: unknown) => {
        const s = String(c ?? '');
        return /["\n\r,;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `oficios_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setListError('No se pudo exportar el reporte: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: theme.colors.background, overflow: 'hidden' }}>

      {/* ── Master panel ──────────────────────────────────── */}
      <div style={{
        flex: selected ? (isMobile ? '1' : '0 0 55%') : '1',
        // En móvil, al abrir un oficio se oculta la lista y el detalle ocupa todo
        display: (isMobile && selected) ? 'none' : 'flex',
        flexDirection: 'column', overflow: 'hidden', transition: 'flex 0.2s',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', backgroundColor: theme.colors.surface, borderBottom: `1px solid ${theme.colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h1 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.4rem', fontWeight: 700 }}>
              Gestión de Oficios
            </h1>
            <button onClick={exportCSV} disabled={exporting} style={{ ...btnSecondary, opacity: exporting ? 0.6 : 1, cursor: exporting ? 'wait' : 'pointer' }} title="Exportar los oficios filtrados a Excel/CSV">
              {exporting ? '⏳ Exportando…' : '⬇ Exportar Excel'}
            </button>
          </div>

          {/* Filtros (componente compartido) */}
          <FiltrosOficios onChange={(f) => { setFiltros(f); setPage(1); }} />
        </div>

        {/* Feedback banner */}
        {actionMsg && (
          <div
            role="status"
            style={{ padding: '10px 24px', backgroundColor: '#D1FAE5', color: theme.colors.alert.green, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => setActionMsg(null)}
          >
            ✓ {actionMsg} &nbsp;<span style={{ opacity: 0.6 }}>(clic para cerrar)</span>
          </div>
        )}

        {listError && <div role="alert" style={{ ...alertStyle, margin: '12px 24px' }}>{listError}</div>}

        {/* Table — scroll horizontal en móvil para no romper el layout */}
        <div className="scroll-x" style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ backgroundColor: theme.colors.primary, color: '#fff' }}>
                {['', 'Folio', 'Delegación', 'Remitente', 'Ingreso', 'Término', 'Estatus', 'SIQROO', 'En bandeja de', 'Acciones'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: theme.colors.textSecondary }}>Cargando…</td></tr>
              ) : oficios.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: theme.colors.textSecondary }}>Sin registros</td></tr>
              ) : (
                oficios.map((o, i) => (
                  <tr
                    key={o.id}
                    onClick={() => handleSelectOficio(o)}
                    style={{
                      backgroundColor: selected?.id === o.id ? '#EFF6FF' : i % 2 === 0 ? '#fff' : '#F9FAFB',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Traffic light dot */}
                    <td style={{ ...tdStyle, width: '8px', padding: '0 0 0 12px' }}>
                      <TrafficDot tiene_termino={o.tiene_termino} dias={o.dias_restantes ?? null} />
                    </td>
                    <td style={tdStyle}><strong>{o.folio}</strong></td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem', color: theme.colors.textSecondary }}>{o.delegacion_nombre ?? '—'}</td>
                    <td style={tdStyle}>{o.remitente}</td>
                    <td style={tdStyle}>{new Date(o.fecha_registro).toLocaleDateString('es-MX')}</td>
                    <td style={tdStyle}><TerminoTimer tiene_termino={o.tiene_termino} fecha_vencimiento={o.fecha_vencimiento} /></td>
                    <td style={tdStyle}><StatusBadge estatus={o.estatus as EstatusOficio} /></td>
                    <td style={tdStyle}>
                      {!o.siqroo_aplica ? (
                        <span style={{ color: theme.colors.textSecondary, fontSize: '0.75rem' }}>—</span>
                      ) : siqrooPend(o) ? (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>🚩 Pendiente</span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>✓ Completo</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {o.en_bandeja_de ? (
                        <span style={{ fontSize: '0.78rem', color: theme.colors.textPrimary, fontWeight: 600 }}>
                          👤 {o.en_bandeja_de}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {/* Orquestación — solo el ENCARGADO (asigna, delega el trabajo) */}
                      {esEncargado && (
                        <>
                          {o.estatus === 'RECIBIDO' && (
                            <>
                              <button style={btnAction} onClick={() => { setSelected(o); setShowAssign(true); }}>
                                Asignar
                              </button>
                              <button style={{ ...btnAction, backgroundColor: '#1E40AF' }} onClick={() => { setSelected(o); setShowTrabajar(true); }}>
                                ✍️ Trabajar
                              </button>
                            </>
                          )}
                          {/* Trabajo directo del encargado: si lo reconsideran y no hay abogado
                              asignado, el propio encargado sube la corrección. */}
                          {o.estatus === 'EN_RECONSIDERACION' && !o.abogado_nombre && (
                            <button style={{ ...btnAction, backgroundColor: '#1E40AF' }} onClick={() => { setSelected(o); setShowTrabajar(true); }}>
                              ✍️ Corregir
                            </button>
                          )}
                          {(['ASIGNADO', 'EN_REVISION', 'EN_RECONSIDERACION'] as EstatusOficio[]).includes(o.estatus as EstatusOficio) && (
                            <button style={{ ...btnAction, backgroundColor: theme.colors.gold }} onClick={() => { handleSelectOficio(o); setShowReassign(true); }}>
                              Reasignar
                            </button>
                          )}
                        </>
                      )}

                      {/* Aprobación — quien tiene la autoridad: en delegaciones el DELEGADO,
                          en la Dirección General el encargado (backend: puede_vobo) */}
                      {o.puede_vobo && (o.estatus === 'EN_REVISION' || o.estatus === 'EN_RECONSIDERACION') && (
                        <>
                          <button style={{ ...btnAction, backgroundColor: theme.colors.alert.green }} onClick={() => handleVobo(o)}>
                            VoBo
                          </button>
                          <button style={{ ...btnAction, backgroundColor: theme.colors.alert.yellow, color: '#78350F' }} onClick={() => { handleSelectOficio(o); setShowRecon(true); }}>
                            Reconsiderar
                          </button>
                        </>
                      )}

                      {/* Ver el proyecto — el encargado o quien aprueba (para decidir el VoBo) */}
                      {(esEncargado || o.puede_vobo) && (['EN_REVISION', 'EN_RECONSIDERACION', 'VOBO_APROBADO', 'FINALIZADO'] as EstatusOficio[]).includes(o.estatus as EstatusOficio) && (
                        <button onClick={() => abrirArchivo(`/api/v1/files/${o.id}/proyecto`)} style={{ ...btnAction, backgroundColor: '#EFF6FF', color: '#1E40AF' }}>
                          📝 Proyecto
                        </button>
                      )}

                      {/* Subir firmado — VOBO_APROBADO: secretaría (DG) o encargado/delegado (delegación) */}
                      {o.puede_finalizar && o.estatus === 'VOBO_APROBADO' && (
                        <button style={btnAction} onClick={() => { setSelected(o); setShowUpload(true); }}>
                          ✍️ Subir Firmado
                        </button>
                      )}
                      {/* Ver documento firmado — al finalizar */}
                      {o.estatus === 'FINALIZADO' && (
                        <button onClick={() => abrirArchivo(`/api/v1/files/${o.id}/firmado`)} style={{ ...btnAction, backgroundColor: '#D1FAE5', color: '#065F46' }}>
                          ✍️ Firmado
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px', borderTop: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.surface }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>← Anterior</button>
            <span style={{ lineHeight: '36px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>Pág. {page} / {totalPages} · {total} registros</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnSecondary}>Siguiente →</button>
          </div>
        )}
      </div>

      {/* ── Detail panel ──────────────────────────────────── */}
      {selected && (
        <div style={{ flex: isMobile ? '1' : '0 0 45%', borderLeft: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.surface, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.primary }}>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
              Detalle — {selected.folio}
            </h2>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }} aria-label="Cerrar detalle">×</button>
          </div>
          <div style={{ padding: '20px', flex: 1 }}>
            <OficioDetalle
              oficio={selected}
              acciones={
                <>
                <SiqrooPanel oficio={selected} onDone={() => fetchOficios()} />
                {selected.puede_vobo && selected.estatus === 'EN_REVISION' ? (
                  <div style={{
                    padding: '14px 16px',
                    backgroundColor: '#F0FDF4', border: `1px solid #86EFAC`,
                    borderRadius: '8px', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
                  }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#166534' }}>
                        ¿El proyecto está correcto?
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#15803D' }}>
                        Al otorgar el VoBo, se notificará a Secretaría para la firma.
                      </p>
                    </div>
                    <button
                      onClick={() => handleVobo(selected)}
                      style={{
                        padding: '9px 20px', backgroundColor: theme.colors.alert.green,
                        color: '#fff', border: 'none', borderRadius: '7px',
                        fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      ✓ Otorgar VoBo
                    </button>
                  </div>
                ) : null}
                </>
              }
            />
            {/* La línea de tiempo ahora vive dentro del modal "Ver historial". */}
          </div>
        </div>
      )}

      {/* ── Assign Modal ──────────────────────────────────── */}
      <Modal open={showAssign} title={`Asignar Oficio — ${selected?.folio}`} onClose={() => { setShowAssign(false); setAssignError(null); }}>
        <form onSubmit={handleAssign} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Abogado <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <select value={abogadoId} onChange={(e) => setAbogadoId(e.target.value)} style={{ ...inputStyle, width: '100%' }} required>
              <option value="">— Selecciona un abogado —</option>
              {abogados.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre} ({a.email})</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Observaciones</label>
            <textarea style={{ ...inputStyle, width: '100%', height: '80px', resize: 'vertical' }} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Instrucciones adicionales…" />
          </div>
          {assignError && <div role="alert" style={alertStyle}>{assignError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => setShowAssign(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={assigning || !abogadoId} style={btnPrimary}>{assigning ? 'Asignando…' : 'Confirmar Asignación'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Trabajar el oficio (encargado sube su propio proyecto) */}
      <Modal open={showTrabajar} title={`Trabajar Oficio — ${selected?.folio}`} onClose={() => { setShowTrabajar(false); setTrabajarError(null); setTrabajarFile(null); }}>
        <form onSubmit={handleTrabajar} noValidate>
          <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: theme.colors.textSecondary }}>
            Subí tu <strong>proyecto de contestación</strong>. Quedará en revisión para que el <strong>delegado</strong> otorgue el VoBo.
          </p>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Proyecto de contestación <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setTrabajarFile(e.target.files?.[0] ?? null)}
              style={{ display: 'block', fontSize: '0.85rem', marginTop: '6px' }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>PDF o Word</p>
          </div>
          {trabajarError && <div role="alert" style={alertStyle}>{trabajarError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => { setShowTrabajar(false); setTrabajarFile(null); }} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={trabajando || !trabajarFile} style={btnPrimary}>{trabajando ? 'Subiendo…' : 'Subir proyecto'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Reconsideración Modal ─────────────────────────── */}
      <Modal
        open={showRecon}
        title={`Solicitar Reconsideración — ${selected?.folio}`}
        onClose={() => { setShowRecon(false); setReconComentario(''); setReconError(null); }}
      >
        <form onSubmit={handleReconsiderar} noValidate>
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#FFFBEB',
            border: `1px solid #FDE68A`,
            borderLeft: `3px solid ${theme.colors.alert.yellow}`,
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.82rem',
            color: '#78350F',
          }}>
            <p style={{ margin: 0, fontWeight: 700 }}>⚠️ El proyecto requiere correcciones</p>
            <p style={{ margin: '4px 0 0' }}>
              El oficio pasará a estado <strong>En Reconsideración</strong>. El jurídico recibirá tus comentarios y deberá subir una nueva versión.
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: theme.colors.charcoal }}>
              Comentarios de corrección <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <textarea
              value={reconComentario}
              onChange={(e) => setReconComentario(e.target.value)}
              required
              rows={5}
              placeholder="Describe qué debe corregir el jurídico en su proyecto de contestación…"
              style={{
                width: '100%', padding: '10px 12px',
                border: `1.5px solid ${theme.colors.border}`,
                borderRadius: theme.radius.sm,
                fontSize: '0.875rem',
                fontFamily: theme.font.family,
                resize: 'vertical',
                boxSizing: 'border-box' as const,
              }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
              {reconComentario.length} caracteres
            </p>
          </div>

          {reconError && (
            <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#FDE8EF', color: theme.colors.primary, borderRadius: theme.radius.sm, fontSize: '0.875rem', marginBottom: '12px', borderLeft: `3px solid ${theme.colors.primary}` }}>
              {reconError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => { setShowRecon(false); setReconComentario(''); setReconError(null); }}
              style={{ padding: '9px 18px', backgroundColor: '#fff', color: theme.colors.primary, border: `1.5px solid ${theme.colors.primary}`, borderRadius: theme.radius.sm, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: theme.font.family }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reconLoading || !reconComentario.trim()}
              style={{
                padding: '9px 20px',
                backgroundColor: reconLoading || !reconComentario.trim() ? theme.colors.grayMid : theme.colors.alert.yellow,
                color: '#78350F',
                border: 'none',
                borderRadius: theme.radius.sm,
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: reconLoading || !reconComentario.trim() ? 'not-allowed' : 'pointer',
                fontFamily: theme.font.family,
              }}
            >
              {reconLoading ? 'Enviando…' : '⚠️ Enviar Correcciones'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Reassign Modal ────────────────────────────────── */}
      <Modal
        open={showReassign}
        title={`Reasignar Oficio — ${selected?.folio}`}
        onClose={() => { setShowReassign(false); setReassignAbogadoId(''); setReassignMotivo(''); setReassignError(null); }}
      >
        <form onSubmit={handleReassign} noValidate>
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#FFF7ED',
            border: `1px solid #FED7AA`,
            borderLeft: `3px solid ${theme.colors.gold}`,
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.82rem',
            color: '#92400E',
          }}>
            <p style={{ margin: 0, fontWeight: 700 }}>🔄 Reasignación de oficio</p>
            <p style={{ margin: '4px 0 0' }}>
              La asignación actual quedará inactiva y el oficio regresará a estado <strong>Asignado</strong> con el nuevo jurídico.
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Nuevo abogado <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <select
              value={reassignAbogadoId}
              onChange={(e) => setReassignAbogadoId(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
              required
            >
              <option value="">— Selecciona un abogado —</option>
              {abogados.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre} ({a.email})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Motivo de reasignación</label>
            <textarea
              style={{ ...inputStyle, width: '100%', height: '80px', resize: 'vertical' }}
              value={reassignMotivo}
              onChange={(e) => setReassignMotivo(e.target.value)}
              placeholder="Indica el motivo del cambio de asignación…"
            />
          </div>

          {reassignError && <div role="alert" style={alertStyle}>{reassignError}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => { setShowReassign(false); setReassignAbogadoId(''); setReassignMotivo(''); setReassignError(null); }}
              style={btnSecondary}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reassigning || !reassignAbogadoId}
              style={{ ...btnPrimary, backgroundColor: reassigning || !reassignAbogadoId ? theme.colors.grayMid : theme.colors.gold }}
            >
              {reassigning ? 'Reasignando…' : '🔄 Confirmar Reasignación'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Upload Signed PDF Modal ───────────────────────── */}
      <Modal open={showUpload} title={`Subir Documento Firmado — ${selected?.folio}`} onClose={() => { setShowUpload(false); setSignedFile(null); setUploadError(null); }}>
        <form onSubmit={handleUploadSigned} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Documento escaneado y firmado (PDF) <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <input type="file" accept="application/pdf" onChange={(e) => setSignedFile(e.target.files?.[0] ?? null)} style={{ fontSize: '0.875rem' }} aria-required="true" />
            {signedFile && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: theme.colors.alert.green }}>✓ {signedFile.name}</p>}
          </div>
          {uploadError && <div role="alert" style={alertStyle}>{uploadError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => setShowUpload(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={uploading || !signedFile} style={btnPrimary}>{uploading ? 'Subiendo…' : 'Finalizar Oficio'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const TrafficDot: React.FC<{ tiene_termino: boolean; dias: number | null }> = ({ tiene_termino, dias }) => {
  let color = theme.colors.alert.green;
  if (tiene_termino && dias !== null) {
    if (dias <= 1) color = theme.colors.alert.red;
    else if (dias <= 3) color = theme.colors.alert.yellow;
  }
  return <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} aria-hidden="true" />;
};

// ── Styles ────────────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties      = { padding: '11px 14px', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties      = { padding: '11px 14px', verticalAlign: 'middle' };
const inputStyle: React.CSSProperties   = { padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' as const };
const labelStyle: React.CSSProperties   = { display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.875rem' };
const btnPrimary: React.CSSProperties   = { padding: '9px 20px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' };
const btnAction: React.CSSProperties    = { padding: '5px 12px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginRight: '4px' };
const alertStyle: React.CSSProperties   = { padding: '10px 14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px' };
