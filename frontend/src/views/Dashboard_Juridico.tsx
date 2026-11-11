/**
 * View: Dashboard_Juridico
 * Kanban board — JURIDICO role
 */

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Icono } from '../components/Icono';
import { theme }        from '../theme';
import { StatusBadge }  from '../components/StatusBadge';
import { TerminoTimer } from '../components/TerminoTimer';
import { PanelExpediente } from '../components/PanelExpediente';
import { OficioDetalle } from '../components/OficioDetalle';
import { AccionesOficio } from '../components/AccionesOficio';
import { useAuth }      from '../context/AuthContext';
import { useIsMobile }  from '../hooks/useIsMobile';
import { getOficios, subirProyecto, getComentarios } from '../api';
import { FiltrosOficios } from '../components/FiltrosOficios';
import { PestanasBandeja, totalDeConteos, leerVistaFijada, alternarVistaFijada } from '../components/PestanasBandeja';
import type { VistaBandeja } from '../components/PestanasBandeja';
import type { OficiosFiltros } from '../components/FiltrosOficios';
import { textoCompresion } from '../utils/compresion';
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

// Botón desde el que se abre el detalle (solo controla la carga de comentarios).
type DetalleTab = 'pdf' | 'texto' | 'proyecto' | 'comentarios' | 'firmado';

export const Dashboard_Juridico: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [oficios,    setOficios]    = useState<Oficio[]>([]);
  const [conteos,    setConteos]    = useState<Record<string, number>>({});
  const [miPendientes, setMiPendientes] = useState(0);
  const [deOtrasAreas, setDeOtrasAreas] = useState(0);
  // Pestaña activa: el histórico, lo que espera algo de mí, o el archivo.
  // Arranca en la pestaña que la persona haya fijado, si fijó alguna.
  const [vistaFijada, setVistaFijada] = useState<VistaBandeja | null>(() => leerVistaFijada(user?.id));
  const [vista, setVista] = useState<VistaBandeja>(() => leerVistaFijada(user?.id) ?? 'todo');
  const [loading,    setLoading]    = useState(false);
  const [listError,  setListError]  = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Modal de detalle (secciones + subir proyecto) ────
  const [detalleOficio, setDetalleOficio] = useState<Oficio | null>(null);

  // ── Upload draft ──────────────────────────────────────────
  const [draftFile,   setDraftFile]   = useState<File | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Comentarios de reconsideración ────────────────────────
  const [comentarios,    setComentarios]    = useState<ComentarioReconsideracion[]>([]);
  const [loadingComents, setLoadingComents] = useState(false);

  const [filtros, setFiltros] = useState<OficiosFiltros>({ search: '', estatus: '', termino: '', desde: '', hasta: '', siqroo_pendiente: false, pendiente_firma: false, area: '', en_bandeja_de: '', situacion: '' });

  const fetchOficios = useCallback(async () => {
    setLoading(true); setListError(null);
    try {
      const res = await getOficios({
        mi_bandeja: vista === 'mia' || undefined,
        de_otras_areas: vista === 'otras_areas' || undefined,
        limit: 200,
        search:           filtros.search || undefined,
        estatus:          vista === 'finalizados' ? 'FINALIZADO' : (filtros.estatus || undefined),
        termino:          filtros.termino || undefined,
        desde:            filtros.desde || undefined,
        hasta:            filtros.hasta || undefined,
        siqroo_pendiente: filtros.siqroo_pendiente || undefined,
        pendiente_firma:  filtros.pendiente_firma || undefined,
        dirigido_a_id:    filtros.area ? Number(filtros.area) : undefined,
      });
      setOficios(res.data);
      setConteos(((res.meta as any).conteos ?? {}) as Record<string, number>);
      setMiPendientes(Number((res.meta as any).mi_bandeja ?? 0));
      setDeOtrasAreas(Number((res.meta as any).de_otras_areas ?? 0));
    } catch (err: any) { setListError(err.message); }
    finally { setLoading(false); }
  }, [filtros, vista]);

  useEffect(() => { fetchOficios(); }, [fetchOficios]);

  // Si el detalle está abierto, se mantiene al día cuando la lista se recarga:
  // así los cambios hechos desde las acciones se reflejan sin cerrarlo.
  useEffect(() => {
    setDetalleOficio((prev) => {
      if (!prev) return prev;
      const fresco = oficios.find((o) => o.id === prev.id);
      return fresco ? { ...prev, ...fresco } : prev;
    });
  }, [oficios]);

  // Abrir detalle. El argumento `tab` se conserva por compatibilidad con las
  // tarjetas del kanban; ahora el detalle es una sola vista por secciones.
  const openDetalle = (oficio: Oficio, _tab?: DetalleTab) => {
    setDetalleOficio(oficio);
    setDraftFile(null);
    setUploadError(null);
    setComentarios([]);

    // Si está en reconsideración, cargar los comentarios de correcciones.
    if (oficio.estatus === 'EN_RECONSIDERACION') {
      setLoadingComents(true);
      getComentarios(oficio.id)
        .then(({ data }) => setComentarios(data))
        .catch(() => {})
        .finally(() => setLoadingComents(false));
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
      const resp = await subirProyecto(detalleOficio.id, draftFile);
      const aviso = textoCompresion(resp.compresion);
      setSuccessMsg(
        `Proyecto subido para oficio ${detalleOficio.folio}` + (aviso ? ` · ${aviso}` : ''),
      );
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
    <div style={{ padding: isMobile ? '16px 12px' : '24px', height: 'calc(100vh - 58px)', overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: theme.font.family }}>

      {/* Sin encabezado: el nombre del usuario ya está en la barra superior y
          repetirlo aquí solo restaba alto a la tabla, que es lo que se viene a
          ver. El área tampoco hacía falta: se entra a ella desde el módulo. */}

      {/* Feedback */}
      {successMsg && (
        <div role="status" style={{ ...alertSuccess, marginBottom: '16px', cursor: 'pointer' }} onClick={() => setSuccessMsg(null)}>
          <Icono nombre="check" inline />{successMsg}
        </div>
      )}
      {listError && <div role="alert" style={{ ...alertError, marginBottom: '16px' }}>{listError}</div>}

      {/* Tarjeta de resumen (rectángulo pequeño) + filtros, en la misma fila */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'stretch', marginBottom: '16px' }}>
        <div style={{ flex: '1 1 100%', display: 'flex' }}>
          <FiltrosOficios onChange={setFiltros} />
        </div>
      </div>

      {/* Las pestañas se apoyan en el recuadro de abajo: la activa rompe la
          línea y se abre hacia él, así se lee como una sola pieza. */}
      <PestanasBandeja
        vista={vista}
        onCambiar={setVista}
        totalTodo={totalDeConteos(conteos)}
        totalMia={miPendientes}
        totalFinalizados={conteos.FINALIZADO ?? 0}
        /* Solo lo que la lista puede mostrar: el servidor ya cuenta dentro de
           «de otras áreas» los oficios con una solicitud pendiente para esta
           persona, así que el número y los renglones coinciden. */
        totalOtrasAreas={deOtrasAreas}
        fijada={vistaFijada}
        onFijar={(v) => setVistaFijada(alternarVistaFijada(user?.id, v, vistaFijada))}
      />

      {/* La bandeja suelta de solicitudes vivía aquí, encima de la lista. Se
          quitó: el oficio con una solicitud pendiente ahora baja como un renglón
          más de «Turnados» —el servidor ya lo deja ver a quien tiene la solicitud
          asignada—, y se contesta desde el detalle, en «Acciones», igual que en el
          tablero del encargado. Un panel flotante y una lista para lo mismo era
          justo lo que se acordó no volver a hacer. */}

      {/* Lista — único scroll vertical de la vista */}
      {loading ? (
        <p style={{ color: theme.colors.textSecondary }}>Cargando…</p>
      ) : (
        <div className="scroll-x" style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto', border: `1px solid ${theme.colors.border}`, borderTop: 'none', borderRadius: '0 0 14px 14px', backgroundColor: theme.colors.surface, boxShadow: theme.shadow.sm }}>
          <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ backgroundColor: theme.colors.surface }}>
                {/* «N° de origen» va junto al folio, como en los demás tableros: es
                    el número con el que la dependencia identifica su propio oficio, y
                    con el que la gente lo busca cuando llama a preguntar. Al analista
                    le faltaba, y era el único que trabaja el expediente a diario. */}
                {['Folio', 'N° de origen', 'Remitente', 'Dependencia', 'Ingreso', 'Término', 'Estatus'].map((h) => (
                  <th key={h} style={{ padding: '13px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', color: theme.colors.textSecondary, borderBottom: `2px solid ${theme.colors.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {oficios.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: theme.colors.textSecondary, padding: '24px' }}>Sin oficios</td></tr>
              ) : (
                oficios.map((o, i) => (
                    <tr
                      key={o.id}
                      onClick={() => openDetalle(o)}
                      style={{ borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: i % 2 === 0 ? '#fff' : '#F9FAFB', cursor: 'pointer' }}
                      title="Ver detalle de la solicitud"
                    >
                      <td style={{ padding: '10px 14px' }}><strong style={{ color: theme.colors.primary }}>{o.folio}</strong></td>
                      <td style={{ padding: '10px 14px', color: theme.colors.textSecondary, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{o.numero_oficio_origen ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: theme.colors.textSecondary }}>{o.remitente}</td>
                      <td style={{ padding: '10px 14px', color: theme.colors.textSecondary, fontSize: '0.78rem', textTransform: 'uppercase' }}>{o.dependencia_origen}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{new Date(o.fecha_registro).toLocaleDateString('es-MX')}</td>
                      <td style={{ padding: '10px 14px' }}><TerminoTimer tiene_termino={o.tiene_termino} fecha_vencimiento={o.fecha_vencimiento} termino_tipo={o.termino_tipo} vence_en={o.vence_en} horas_restantes={o.horas_restantes}  cerrado={o.estatus === 'FINALIZADO'} /></td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge estatus={o.estatus as EstatusOficio} turnado={!!o.turnos_recibidos} devuelto={!!o.llego_por_devolucion} deConocimiento={!!o.de_conocimiento} enPaseFirma={!!o.en_pase_firma} /></td>
                    </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Expediente ───────────────────────────────────────
          Usa el mismo panel que Gestión y Oficial. Antes era una ventana modal
          centrada, y el visor de documentos —que se coloca suponiendo el panel
          derecho— se le encimaba. */}
      {detalleOficio && (
        <PanelExpediente folio={detalleOficio.folio} onClose={closeDetalle}>
          <div>
            {/* ── Detalle por secciones (datos, documentos, identidad, usuarios) ── */}
            <OficioDetalle oficio={detalleOficio} onCambio={fetchOficios} />

            <AccionesOficio
              oficio={detalleOficio}
              conDelegatorios
              puedeDelegar={!!detalleOficio.puede_solicitar}
              onActualizar={(o) => { setDetalleOficio((prev) => prev ? { ...prev, ...o } : o); fetchOficios(); }}
              onSalio={() => { setDetalleOficio(null); fetchOficios(); }}
                  onRefrescar={() => fetchOficios()}
            />

            {/* El texto del OCR ya lo muestra el visor del documento, en su
                propio recuadro y siempre abierto. Tenerlo también aquí lo
                duplicaba en la misma pantalla: el mismo texto dos veces, uno al
                lado del otro. */}

            {/* ── Correcciones (EN_RECONSIDERACION) ── */}
            {detalleOficio.estatus === 'EN_RECONSIDERACION' && (
              <section style={{ marginTop: '22px' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: theme.colors.alert.red, borderBottom: `2px solid ${theme.colors.border}`, paddingBottom: '6px' }}>
                  Correcciones solicitadas
                </h3>
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#FEF2F2',
                  border: `1px solid #FECACA`,
                  borderLeft: `4px solid ${theme.colors.alert.red}`,
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#991B1B' }}>
                    <Icono nombre="alerta" inline />Este oficio requiere correcciones
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#B91C1C' }}>
                    El Director Jurídico ha solicitado cambios. Revisa los comentarios y sube una versión corregida en la sección de abajo.
                  </p>
                </div>

                {loadingComents ? (
                  <p style={{ color: theme.colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', padding: '24px' }}>
                    Cargando comentarios…
                  </p>
                ) : comentarios.length === 0 ? (
                  <p style={{ color: theme.colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', padding: '24px' }}>
                    Sin comentarios registrados.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
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
                            <Icono nombre="persona" size={16} />
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
                                <Icono nombre="check" inline />Resuelto
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
              </section>
            )}

            {/* ── Subir Proyecto / Corrección ── */}
            {puedeSubirProyecto && (
              <section style={{ marginTop: '22px' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: theme.colors.primary, borderBottom: `2px solid ${theme.colors.border}`, paddingBottom: '6px' }}>
                  {detalleOficio.estatus === 'EN_RECONSIDERACION' ? 'Subir corrección' : 'Subir proyecto de contestación'}
                </h3>
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
                    {detalleOficio.estatus === 'EN_RECONSIDERACION' ? 'Subir proyecto corregido' : 'Proyecto de Contestación'}
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
                  <Icono nombre={draftFile ? "editar" : "carpeta"} size={30} />
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
                    {uploading ? 'Subiendo…' : 'Subir Proyecto'}
                  </button>
                </div>
                </form>
              </section>
            )}
          </div>
        </PanelExpediente>
      )}
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
        <StatusBadge estatus={oficio.estatus as EstatusOficio} turnado={!!oficio.turnos_recibidos} devuelto={!!oficio.llego_por_devolucion} deConocimiento={!!oficio.de_conocimiento} enPaseFirma={!!oficio.en_pase_firma} />
      </div>

      <p style={{ margin: '0 0 4px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{oficio.remitente}</p>
      <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
        {new Date(oficio.fecha_registro).toLocaleDateString('es-MX')}
      </p>

      <TerminoTimer tiene_termino={oficio.tiene_termino} fecha_vencimiento={oficio.fecha_vencimiento} termino_tipo={oficio.termino_tipo} vence_en={oficio.vence_en} horas_restantes={oficio.horas_restantes}  cerrado={oficio.estatus === 'FINALIZADO'} />

      {/* Botones */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => onOpen('pdf')} style={btnSmall} title="Ver PDF original">
          <Icono nombre="documento" inline />Ver PDF
        </button>
        {textoOcr && (
          <button onClick={() => onOpen('texto')} style={{ ...btnSmall, borderColor: theme.colors.charcoal, color: theme.colors.charcoal }} title="Ver texto extraído por IA">
            <Icono nombre="engranaje" inline />Texto IA
          </button>
        )}
        {esRecon && (
          <button
            onClick={() => onOpen('comentarios')}
            style={{ ...btnSmall, backgroundColor: '#FEF2F2', color: theme.colors.alert.red, borderColor: theme.colors.alert.red, fontWeight: 700 }}
            title="Ver correcciones solicitadas"
          >
            <Icono nombre="comentario" inline />Ver Correcciones
          </button>
        )}
        {puedeSubir && (
          <button
            onClick={() => onOpen('proyecto')}
            style={{ ...btnSmall, backgroundColor: theme.colors.primary, color: '#fff', border: 'none' }}
            title={esRecon ? 'Subir proyecto corregido' : 'Subir proyecto de contestación'}
          >
            <Icono nombre="subir" inline />{esRecon ? 'Subir Corrección' : 'Subir Proyecto'}
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
