/**
 * View: Dashboard_Juridico
 * Kanban board — JURIDICO role
 */

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { theme }        from '../theme';
import { StatusBadge }  from '../components/StatusBadge';
import { TerminoTimer } from '../components/TerminoTimer';
import { Modal }        from '../components/Modal';
import { PDFPreviewer } from '../components/PDFPreviewer';
import { useAuth }      from '../context/AuthContext';
import { useIsMobile }  from '../hooks/useIsMobile';
import { getOficios, subirProyecto, getComentarios } from '../api';
import type { Oficio, EstatusOficio } from '../types';
import type { ComentarioReconsideracion } from '../api';

type KanbanColumn = {
  key:      string;
  label:    string;
  statuses: EstatusOficio[];
  color:    string;
};

const COLUMNS: KanbanColumn[] = [
  { key: 'pendientes',      label: 'Pendientes',         statuses: ['ASIGNADO'],                              color: '#FEF3C7' },
  { key: 'revision',        label: 'En Revisión',        statuses: ['EN_REVISION'],                           color: '#FDE68A' },
  { key: 'reconsideracion', label: 'En Reconsideración', statuses: ['EN_RECONSIDERACION'],                    color: '#FEE2E2' },
  { key: 'completados',     label: 'Completados',        statuses: ['VOBO_APROBADO', 'FINALIZADO'],           color: '#D1FAE5' },
];

type DetalleTab = 'pdf' | 'texto' | 'proyecto' | 'comentarios';

export const Dashboard_Juridico: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [oficios,    setOficios]    = useState<Oficio[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [listError,  setListError]  = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Modal de detalle (PDF + Texto IA + Subir Proyecto) ────
  const [detalleOficio, setDetalleOficio] = useState<Oficio | null>(null);
  const [detalleTab,    setDetalleTab]    = useState<DetalleTab>('pdf');

  // ── Upload draft ──────────────────────────────────────────
  const [draftFile,   setDraftFile]   = useState<File | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Comentarios de reconsideración ────────────────────────
  const [comentarios,    setComentarios]    = useState<ComentarioReconsideracion[]>([]);
  const [loadingComents, setLoadingComents] = useState(false);

  const fetchOficios = useCallback(async () => {
    setLoading(true); setListError(null);
    try {
      const res = await getOficios({ limit: 200 });
      setOficios(res.data);
    } catch (err: any) { setListError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOficios(); }, [fetchOficios]);

  // Abrir detalle — tab por defecto según estatus
  const openDetalle = (oficio: Oficio, tab?: DetalleTab) => {
    setDetalleOficio(oficio);
    setDraftFile(null);
    setUploadError(null);
    setComentarios([]);

    // Si está en reconsideración: abrir directo en tab de correcciones y cargar comentarios
    if (oficio.estatus === 'EN_RECONSIDERACION') {
      setDetalleTab(tab ?? 'comentarios');
      setLoadingComents(true);
      getComentarios(oficio.id)
        .then(({ data }) => setComentarios(data))
        .catch(() => {})
        .finally(() => setLoadingComents(false));
    } else {
      const textoOcr = (oficio as any).texto_ocr;
      setDetalleTab(tab ?? (textoOcr ? 'texto' : 'pdf'));
    }
  };

  const closeDetalle = () => {
    setDetalleOficio(null);
    setDraftFile(null);
    setUploadError(null);
    setComentarios([]);
  };

  const handleUploadDraft = async (e: FormEvent) => {
    e.preventDefault();
    if (!detalleOficio || !draftFile) return;
    setUploading(true); setUploadError(null);
    try {
      await subirProyecto(detalleOficio.id, draftFile);
      setSuccessMsg(`Proyecto subido para oficio ${detalleOficio.folio}`);
      closeDetalle();
      fetchOficios();
    } catch (err: any) { setUploadError(err.message); }
    finally { setUploading(false); }
  };

  const getColumnOficios = (col: KanbanColumn) =>
    oficios.filter((o) => col.statuses.includes(o.estatus as EstatusOficio));

  const puedeSubirProyecto = detalleOficio &&
    (detalleOficio.estatus === 'ASIGNADO' ||
     detalleOficio.estatus === 'EN_REVISION' ||
     detalleOficio.estatus === 'EN_RECONSIDERACION');

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px', backgroundColor: theme.colors.background, minHeight: '100vh', fontFamily: theme.font.family }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: theme.colors.primaryDark, fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Mis Asignaciones
        </h1>
        <p style={{ margin: '4px 0 0', color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
          {user?.nombre} · Área Jurídica
        </p>
      </div>

      {/* Feedback */}
      {successMsg && (
        <div role="status" style={{ ...alertSuccess, marginBottom: '16px', cursor: 'pointer' }} onClick={() => setSuccessMsg(null)}>
          ✓ {successMsg}
        </div>
      )}
      {listError && <div role="alert" style={{ ...alertError, marginBottom: '16px' }}>{listError}</div>}

      {/* Kanban */}
      {loading ? (
        <p style={{ color: theme.colors.textSecondary }}>Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px', alignItems: 'start' }}>
          {COLUMNS.map((col) => {
            const items = getColumnOficios(col);
            return (
              <div key={col.key}>
                <div style={{
                  padding:         '10px 16px',
                  background:      `linear-gradient(90deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 100%)`,
                  color:           '#fff',
                  borderRadius:    '8px 8px 0 0',
                  fontWeight:      700,
                  fontSize:        '0.85rem',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'space-between',
                  letterSpacing:   '0.03em',
                  textTransform:   'uppercase',
                }}>
                  <span>{col.label}</span>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: '12px', padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    {items.length}
                  </span>
                </div>
                <div style={{
                  backgroundColor: col.color,
                  borderRadius:    '0 0 8px 8px',
                  padding:         '10px',
                  minHeight:       '120px',
                  display:         'flex',
                  flexDirection:   'column',
                  gap:             '10px',
                }}>
                  {items.length === 0 ? (
                    <p style={{ textAlign: 'center', color: theme.colors.textSecondary, fontSize: '0.8rem', margin: '16px 0' }}>
                      Sin oficios
                    </p>
                  ) : (
                    items.map((o) => (
                      <KanbanCard
                        key={o.id}
                        oficio={o}
                        onOpen={(tab) => openDetalle(o, tab)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal de detalle ──────────────────────────────── */}
      <Modal
        open={!!detalleOficio}
        title={detalleOficio?.folio ?? ''}
        onClose={closeDetalle}
        width={780}
      >
        {detalleOficio && (
          <div>
            {/* Info rápida */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', fontSize: '0.82rem' }}>
              <span style={{ color: theme.colors.textSecondary }}><strong>Remitente:</strong> {detalleOficio.remitente}</span>
              <span style={{ color: theme.colors.textSecondary }}>·</span>
              <span style={{ color: theme.colors.textSecondary }}><strong>Dependencia:</strong> {detalleOficio.dependencia_origen}</span>
              <span style={{ color: theme.colors.textSecondary }}>·</span>
              <StatusBadge estatus={detalleOficio.estatus as EstatusOficio} />
              <span style={{ marginLeft: 'auto' }}>
                <TerminoTimer tiene_termino={detalleOficio.tiene_termino} fecha_vencimiento={detalleOficio.fecha_vencimiento} />
              </span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `2px solid ${theme.colors.border}`, marginBottom: '16px' }}>
              {([
                { key: 'pdf',          label: '📄 Oficio Original'                                                        },
                { key: 'texto',        label: '🤖 Texto IA'                                                               },
                { key: 'comentarios',  label: '💬 Correcciones', show: detalleOficio.estatus === 'EN_RECONSIDERACION'     },
                { key: 'proyecto',     label: detalleOficio.estatus === 'EN_RECONSIDERACION' ? '⬆ Subir Corrección' : '⬆ Subir Proyecto', show: puedeSubirProyecto },
              ] as { key: DetalleTab; label: string; show?: boolean | null }[])
                .filter((t) => t.show !== false)
                .map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setDetalleTab(t.key)}
                    style={{
                      padding:         '9px 18px',
                      border:          'none',
                      borderBottom:    detalleTab === t.key ? `2px solid ${t.key === 'comentarios' ? theme.colors.alert.red : theme.colors.primary}` : '2px solid transparent',
                      marginBottom:    '-2px',
                      backgroundColor: 'transparent',
                      color:           detalleTab === t.key
                        ? (t.key === 'comentarios' ? theme.colors.alert.red : theme.colors.primary)
                        : theme.colors.textSecondary,
                      fontWeight:      detalleTab === t.key ? 700 : 400,
                      fontSize:        '0.85rem',
                      cursor:          'pointer',
                      whiteSpace:      'nowrap',
                      fontFamily:      theme.font.family,
                      position:        'relative' as const,
                    }}
                  >
                    {t.label}
                    {/* Badge con número de comentarios pendientes */}
                    {t.key === 'comentarios' && comentarios.filter(c => !c.resuelto).length > 0 && (
                      <span style={{
                        marginLeft: '6px',
                        backgroundColor: theme.colors.alert.red,
                        color: '#fff',
                        borderRadius: '10px',
                        padding: '1px 6px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                      }}>
                        {comentarios.filter(c => !c.resuelto).length}
                      </span>
                    )}
                  </button>
                ))}
            </div>

            {/* ── Tab: PDF Original ──────────────────────── */}
            {detalleTab === 'pdf' && (
              <PDFPreviewer
                url={`/api/v1/files/${detalleOficio.id}/original`}
                title={`Oficio ${detalleOficio.folio}`}
                height={480}
              />
            )}

            {/* ── Tab: Texto IA ──────────────────────────── */}
            {detalleTab === 'texto' && (() => {
              const textoOcr    = (detalleOficio as any).texto_ocr as string | null;
              const ocrMetodo   = (detalleOficio as any).ocr_metodo as string | null;
              const ocrProcesado = (detalleOficio as any).ocr_procesado as boolean;
              return (
                <div style={{ border: `1.5px solid ${theme.colors.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: theme.colors.charcoal, color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🤖</span>
                      <span style={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' as const, fontFamily: theme.font.family }}>
                        Texto extraído por IA
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {ocrMetodo && (
                        <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                          {ocrMetodo.toUpperCase()}
                        </span>
                      )}
                      <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '10px' }}>
                        {textoOcr ? `${textoOcr.length} chars` : 'Sin texto'}
                      </span>
                    </div>
                  </div>

                  {/* Cuerpo */}
                  {textoOcr ? (
                    <div style={{ padding: '16px', backgroundColor: '#FAFAF8', maxHeight: '420px', overflowY: 'auto', fontSize: '0.82rem', lineHeight: 1.8, color: theme.colors.textPrimary, whiteSpace: 'pre-wrap', fontFamily: 'monospace', userSelect: 'text' }}>
                      {textoOcr}
                    </div>
                  ) : !ocrProcesado ? (
                    <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#FAFAF8' }}>
                      <p style={{ margin: 0, color: '#0369A1', fontSize: '0.875rem' }}>⏳ El OCR está procesando este documento…</p>
                      <p style={{ margin: '6px 0 0', color: theme.colors.textSecondary, fontSize: '0.75rem' }}>Recarga en unos segundos</p>
                    </div>
                  ) : (
                    <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#FAFAF8' }}>
                      <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '0.875rem' }}>📋 No se pudo extraer texto de este documento.</p>
                    </div>
                  )}

                  {textoOcr && (
                    <div style={{ padding: '8px 14px', backgroundColor: '#F0F0EC', borderTop: `1px solid ${theme.colors.border}`, fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                      💡 Texto seleccionable — puedes copiar cualquier fragmento para tu proyecto de contestación
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Tab: Correcciones (EN_RECONSIDERACION) ── */}
            {detalleTab === 'comentarios' && (
              <div>
                {/* Banner de alerta */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#FEF2F2',
                  border: `1px solid #FECACA`,
                  borderLeft: `4px solid ${theme.colors.alert.red}`,
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#991B1B' }}>
                    ⚠️ Este oficio requiere correcciones
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#B91C1C' }}>
                    El Director Jurídico ha solicitado cambios en tu proyecto. Revisa los comentarios y sube una versión corregida desde la pestaña <strong>"⬆ Subir Corrección"</strong>.
                  </p>
                </div>

                {/* Lista de comentarios */}
                {loadingComents ? (
                  <p style={{ color: theme.colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', padding: '24px' }}>
                    Cargando comentarios…
                  </p>
                ) : comentarios.length === 0 ? (
                  <p style={{ color: theme.colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', padding: '24px' }}>
                    Sin comentarios registrados.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
                    {comentarios.map((c) => (
                      <div key={c.id} style={{
                        padding: '14px 16px',
                        backgroundColor: c.resuelto ? '#F0FDF4' : '#FFFBEB',
                        border: `1px solid ${c.resuelto ? '#86EFAC' : '#FDE68A'}`,
                        borderLeft: `4px solid ${c.resuelto ? theme.colors.alert.green : theme.colors.alert.yellow}`,
                        borderRadius: '8px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1rem' }}>👤</span>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: theme.colors.charcoal }}>
                              {c.encargado_nombre}
                            </span>
                            <span style={{ fontSize: '0.68rem', backgroundColor: '#FEF3C7', color: '#92400E', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                              Versión {c.version}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {c.resuelto && (
                              <span style={{ fontSize: '0.68rem', backgroundColor: '#D1FAE5', color: '#065F46', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                                ✓ Resuelto
                              </span>
                            )}
                            <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                              {new Date(c.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: theme.colors.textPrimary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {c.comentario}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA para ir a subir corrección */}
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setDetalleTab('proyecto')}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: theme.colors.primary,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '7px',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      fontFamily: theme.font.family,
                    }}
                  >
                    ⬆ Ir a Subir Corrección →
                  </button>
                </div>
              </div>
            )}

            {/* ── Tab: Subir Proyecto ────────────────────── */}
            {detalleTab === 'proyecto' && puedeSubirProyecto && (
              <form onSubmit={handleUploadDraft} noValidate>
                <div style={{
                  padding: '16px',
                  backgroundColor: detalleOficio.estatus === 'EN_RECONSIDERACION' ? '#FEF2F2' : '#FFF7ED',
                  border: `1px solid ${detalleOficio.estatus === 'EN_RECONSIDERACION' ? '#FECACA' : '#FED7AA'}`,
                  borderLeft: `4px solid ${detalleOficio.estatus === 'EN_RECONSIDERACION' ? theme.colors.alert.red : theme.colors.alert.yellow}`,
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: detalleOficio.estatus === 'EN_RECONSIDERACION' ? '#991B1B' : '#92400E' }}>
                    {detalleOficio.estatus === 'EN_RECONSIDERACION' ? '🔄 Subir proyecto corregido' : '📝 Proyecto de Contestación'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: detalleOficio.estatus === 'EN_RECONSIDERACION' ? '#B91C1C' : '#78350F' }}>
                    {detalleOficio.estatus === 'EN_RECONSIDERACION'
                      ? 'Sube la versión corregida de tu proyecto. El Director Jurídico recibirá una notificación para revisarlo nuevamente.'
                      : 'Sube tu borrador en PDF o Word. El oficio pasará a estado En Revisión y el Director Jurídico podrá revisarlo.'
                    }
                  </p>
                </div>

                {/* Drop zone */}
                <label
                  htmlFor="draft-upload"
                  style={{
                    display:         'flex',
                    flexDirection:   'column',
                    alignItems:      'center',
                    justifyContent:  'center',
                    gap:             '10px',
                    padding:         '32px 24px',
                    border:          `2px dashed ${draftFile ? theme.colors.primary : theme.colors.border}`,
                    borderRadius:    '10px',
                    backgroundColor: draftFile ? '#FDE8EF22' : theme.colors.background,
                    cursor:          'pointer',
                    marginBottom:    '20px',
                  }}
                >
                  <span style={{ fontSize: '2rem' }}>{draftFile ? '📝' : '📂'}</span>
                  {draftFile ? (
                    <>
                      <p style={{ margin: 0, fontWeight: 700, color: theme.colors.primary, fontSize: '0.875rem' }}>{draftFile.name}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.textSecondary }}>{(draftFile.size / 1024).toFixed(0)} KB · Clic para cambiar</p>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontWeight: 700, color: theme.colors.textPrimary, fontSize: '0.875rem' }}>Arrastra el archivo o haz clic para seleccionar</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.textSecondary }}>PDF o Word · Máximo 20 MB</p>
                    </>
                  )}
                  <input
                    id="draft-upload"
                    type="file"
                    accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: 'none' }}
                    onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                {uploadError && <div role="alert" style={alertError}>{uploadError}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" onClick={closeDetalle} style={btnSecondary}>Cancelar</button>
                  <button
                    type="submit"
                    disabled={uploading || !draftFile}
                    style={{ ...btnPrimary, opacity: (!draftFile || uploading) ? 0.6 : 1, cursor: (!draftFile || uploading) ? 'not-allowed' : 'pointer' }}
                  >
                    {uploading ? 'Subiendo…' : '⬆ Subir Proyecto'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

// ── KanbanCard ────────────────────────────────────────────────

interface CardProps {
  oficio: Oficio;
  onOpen: (tab?: DetalleTab) => void;
}

const KanbanCard: React.FC<CardProps> = ({ oficio, onOpen }) => {
  const textoOcr   = (oficio as any).texto_ocr as string | null;
  const puedeSubir = oficio.estatus === 'ASIGNADO' || oficio.estatus === 'EN_REVISION' || oficio.estatus === 'EN_RECONSIDERACION';
  const esRecon    = oficio.estatus === 'EN_RECONSIDERACION';

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius:    '8px',
      padding:         '14px',
      boxShadow:       '0 1px 4px rgba(0,0,0,0.08)',
      border:          esRecon ? `1.5px solid ${theme.colors.alert.red}` : `1px solid ${theme.colors.border}`,
      fontFamily:      theme.font.family,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <strong style={{ fontSize: '0.875rem', color: theme.colors.primary }}>{oficio.folio}</strong>
        <StatusBadge estatus={oficio.estatus as EstatusOficio} />
      </div>

      <p style={{ margin: '0 0 4px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{oficio.remitente}</p>
      <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
        {new Date(oficio.fecha_registro).toLocaleDateString('es-MX')}
      </p>

      <TerminoTimer tiene_termino={oficio.tiene_termino} fecha_vencimiento={oficio.fecha_vencimiento} />

      {/* Botones */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => onOpen('pdf')} style={btnSmall} title="Ver PDF original">
          📄 Ver PDF
        </button>
        {textoOcr && (
          <button onClick={() => onOpen('texto')} style={{ ...btnSmall, borderColor: theme.colors.charcoal, color: theme.colors.charcoal }} title="Ver texto extraído por IA">
            🤖 Texto IA
          </button>
        )}
        {esRecon && (
          <button
            onClick={() => onOpen('comentarios')}
            style={{ ...btnSmall, backgroundColor: '#FEF2F2', color: theme.colors.alert.red, borderColor: theme.colors.alert.red, fontWeight: 700 }}
            title="Ver correcciones solicitadas"
          >
            💬 Ver Correcciones
          </button>
        )}
        {puedeSubir && (
          <button
            onClick={() => onOpen('proyecto')}
            style={{ ...btnSmall, backgroundColor: theme.colors.primary, color: '#fff', border: 'none' }}
            title={esRecon ? 'Subir proyecto corregido' : 'Subir proyecto de contestación'}
          >
            ⬆ {esRecon ? 'Subir Corrección' : 'Subir Proyecto'}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties   = { padding: '9px 20px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const btnSmall: React.CSSProperties     = { padding: '5px 10px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '5px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family };
const alertError: React.CSSProperties   = { padding: '10px 14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px' };
const alertSuccess: React.CSSProperties = { padding: '10px 14px', backgroundColor: '#D1FAE5', color: theme.colors.alert.green, borderRadius: '6px', fontSize: '0.875rem' };
