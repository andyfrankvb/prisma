/**
 * View: Dashboard_Oficial
 * File: src/frontend/views/Dashboard_Oficial.tsx
 *
 * Layout master-detail:
 *  - Izquierda: tabla de oficios con filtro por estatus
 *  - Derecha:   panel de detalle con todos los campos + visor de PDF
 *  - Modal:     registro de nuevo oficio
 */

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { theme }        from '../theme';
import { StatusBadge }  from '../components/StatusBadge';
import { TerminoTimer } from '../components/TerminoTimer';
import { PDFPreviewer } from '../components/PDFPreviewer';
import { Modal }        from '../components/Modal';
import { useAuth }      from '../context/AuthContext';
import { useIsMobile }  from '../hooks/useIsMobile';
import { getOficios, createOficio, getUsuarios, analizarPdf } from '../api';
import type { Oficio, EstatusOficio, Abogado } from '../types';
import {
  thStyle, tdStyle, inputStyle, selectStyle, emptyCell,
  btnPrimary, btnSecondary, alertStyle, labelStyle,
  tableHeaderStyle, detailPanelHeaderStyle, sectionTitleStyle,
} from '../styles';

const ESTATUS_OPTIONS = [
  { value: '',              label: 'Todos los estatus' },
  { value: 'RECIBIDO',      label: 'Recibido'          },
  { value: 'ASIGNADO',      label: 'Asignado'          },
  { value: 'EN_REVISION',   label: 'En Revisión'       },
  { value: 'VOBO_APROBADO', label: 'VoBo Aprobado'     },
  { value: 'FINALIZADO',    label: 'Finalizado'        },
];

const LIMIT = 15;

export const Dashboard_Oficial: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // ── List state ────────────────────────────────────────────
  const [oficios,   setOficios]   = useState<Oficio[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [estatus,   setEstatus]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Detail panel ──────────────────────────────────────────
  const [selected, setSelected] = useState<Oficio | null>(null);

  // ── Create modal — paso 1: subir PDF, paso 2: corroborar campos ─
  const [showCreate,   setShowCreate]   = useState(false);
  const [paso,         setPaso]         = useState<1 | 2>(1);
  const [analizando,   setAnalizando]   = useState(false);
  const [confianza,    setConfianza]    = useState<'alta'|'media'|'baja'|null>(null);
  const [textoOcr,     setTextoOcr]     = useState<string>('');
  const [submitting,   setSubmitting]   = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);
  const [remitente,    setRemitente]    = useState('');
  const [dependencia,  setDependencia]  = useState('');
  const [dirigidoA,    setDirigidoA]    = useState('');
  const [descripcion,  setDescripcion]  = useState('');
  const [tieneTermino, setTieneTermino] = useState(false);
  const [fechaVence,   setFechaVence]   = useState('');
  const [pdfFile,      setPdfFile]      = useState<File | null>(null);

  // ── Destinatarios ─────────────────────────────────────────
  const [destinatarios, setDestinatarios] = useState<Abogado[]>([]);
  useEffect(() => {
    Promise.all([getUsuarios({ rol: 'DIRECTOR' }), getUsuarios({ rol: 'ENCARGADO' })])
      .then(([dirs, encs]) => setDestinatarios([...dirs, ...encs]))
      .catch(() => {});
  }, []);

  // ── Fetch ─────────────────────────────────────────────────
  const fetchOficios = useCallback(async () => {
    setLoading(true); setListError(null);
    try {
      const res = await getOficios({ page, limit: LIMIT, estatus: estatus || undefined });
      setOficios(res.data); setTotal(res.meta.total);
    } catch (err: any) { setListError(err.message); }
    finally { setLoading(false); }
  }, [page, estatus]);
  useEffect(() => { fetchOficios(); }, [fetchOficios]);

  // ── Paso 1: analizar PDF con IA ───────────────────────────
  const handleAnalizarPdf = async (file: File) => {
    setPdfFile(file);
    setAnalizando(true);
    setCreateError(null);
    try {
      const { data } = await analizarPdf(file);
      if (data.remitente)          setRemitente(data.remitente);
      if (data.dependencia_origen) setDependencia(data.dependencia_origen);
      if (data.descripcion)        setDescripcion(data.descripcion);
      if (data.tiene_termino)      setTieneTermino(data.tiene_termino);
      if (data.fecha_vencimiento)  setFechaVence(data.fecha_vencimiento);
      setTextoOcr(data.texto_completo ?? '');
      setConfianza(data.confianza);
      setPaso(2);    } catch (err: any) {
      // Si falla la IA, igual avanzar al paso 2 con campos vacíos
      setConfianza('baja');
      setPaso(2);
    } finally {
      setAnalizando(false);
    }
  };

  // ── Paso 2: guardar oficio ────────────────────────────────
  const resetForm = () => {
    setPaso(1); setConfianza(null); setTextoOcr('');
    setRemitente(''); setDependencia(''); setDirigidoA('');
    setDescripcion(''); setTieneTermino(false); setFechaVence('');
    setPdfFile(null); setCreateError(null);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!pdfFile)                    { setCreateError('El PDF es obligatorio'); return; }
    if (tieneTermino && !fechaVence) { setCreateError('Ingresa la fecha de vencimiento'); return; }
    setSubmitting(true); setCreateError(null);
    try {
      const fd = new FormData();
      fd.append('remitente',             remitente);
      fd.append('dependencia_origen',    dependencia);
      fd.append('dirigido_a_id',         dirigidoA);
      fd.append('descripcion_solicitud', descripcion);
      fd.append('tiene_termino',         String(tieneTermino));
      if (tieneTermino) fd.append('fecha_vencimiento', fechaVence);
      fd.append('pdf', pdfFile);
      await createOficio(fd);
      setShowCreate(false); resetForm(); fetchOficios();
    } catch (err: any) { setCreateError(err.message); }
    finally { setSubmitting(false); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', backgroundColor: theme.colors.background, overflow: 'hidden' }}>

      {/* ── Master panel ──────────────────────────────────── */}
      <div style={{ flex: selected ? '0 0 55%' : '1', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'flex 0.2s' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', backgroundColor: theme.colors.surface, borderBottom: `1px solid ${theme.colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h1 style={{ ...sectionTitleStyle, marginBottom: '4px' }}>
                Mis Oficios
              </h1>
              <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
                {total} registro{total !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={() => setShowCreate(true)} style={btnPrimary}>
              + Registrar Oficio
            </button>
          </div>

          {/* Filter */}
          <div style={{ paddingBottom: '14px' }}>
            <select
              value={estatus}
              onChange={(e) => { setEstatus(e.target.value); setPage(1); }}
              style={selectStyle}
              aria-label="Filtrar por estatus"
            >
              {ESTATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {listError && <div role="alert" style={{ ...alertStyle, margin: '12px 24px' }}>{listError}</div>}

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={tableHeaderStyle}>
                {['Folio', 'Remitente', 'Dependencia', 'Fecha Ingreso', 'Término', 'Estatus'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={emptyCell}>Cargando…</td></tr>
              ) : oficios.length === 0 ? (
                <tr><td colSpan={6} style={emptyCell}>Sin registros</td></tr>
              ) : (
                oficios.map((o, i) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(selected?.id === o.id ? null : o)}
                    style={{
                      backgroundColor: selected?.id === o.id
                        ? '#EFF6FF'
                        : i % 2 === 0 ? '#fff' : '#F9FAFB',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                  >
                    <td style={tdStyle}>
                      <strong style={{ color: theme.colors.primary }}>{o.folio}</strong>
                    </td>
                    <td style={tdStyle}>{o.remitente}</td>
                    <td style={{ ...tdStyle, color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
                      {o.dependencia_origen}
                    </td>
                    <td style={tdStyle}>{new Date(o.fecha_registro).toLocaleDateString('es-MX')}</td>
                    <td style={tdStyle}>
                      <TerminoTimer tiene_termino={o.tiene_termino} fecha_vencimiento={o.fecha_vencimiento} />
                    </td>
                    <td style={tdStyle}><StatusBadge estatus={o.estatus as EstatusOficio} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '12px', borderTop: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.surface }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>
              ← Anterior
            </button>
            <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary }}>
              Pág. {page} / {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnSecondary}>
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* ── Detail panel ──────────────────────────────────── */}
      {selected && (
        <div style={{
          flex: '0 0 45%',
          borderLeft: `1px solid ${theme.colors.border}`,
          backgroundColor: theme.colors.surface,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Detail header */}
          <div style={detailPanelHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
                {selected.folio}
              </h2>
              <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>
                Detalle del oficio
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Cerrar detalle"
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Detail body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

            {/* Metadata grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: '12px',
              marginBottom: '20px',
            }}>
              <InfoCard label="Folio"           value={selected.folio} />
              <InfoCard label="Estatus"         value={<StatusBadge estatus={selected.estatus as EstatusOficio} />} />
              <InfoCard label="Remitente"       value={selected.remitente} />
              <InfoCard label="Dependencia"     value={selected.dependencia_origen} />
              <InfoCard label="Fecha de Ingreso" value={new Date(selected.fecha_registro).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })} />
              <InfoCard label="Término"         value={<TerminoTimer tiene_termino={selected.tiene_termino} fecha_vencimiento={selected.fecha_vencimiento} />} />
            </div>

            {/* Descripción */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '20px',
            }}>
              <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Descripción de la Solicitud
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', color: theme.colors.textPrimary, lineHeight: 1.6 }}>
                {selected.descripcion_solicitud}
              </p>
            </div>

            {/* Texto OCR extraído */}
            {(selected as any).texto_ocr && (
              <div style={{
                backgroundColor: '#FFFBF0',
                border: `1px solid #F59E0B44`,
                borderLeft: `3px solid ${theme.colors.gold}`,
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1rem' }}>🔍</span>
                  <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: theme.colors.gold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Texto extraído por OCR
                  </p>
                  <span style={{ marginLeft: 'auto', fontSize: '0.65rem', backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                    {(selected as any).ocr_metodo?.toUpperCase()}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textPrimary, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto', fontFamily: 'monospace' }}>
                  {(selected as any).texto_ocr}
                </p>
              </div>
            )}

            {(selected as any).ocr_procesado === false && (
              <div style={{ backgroundColor: '#F0F9FF', border: `1px solid #BAE6FD`, borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '0.8rem', color: '#0369A1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏳</span> Procesando OCR en segundo plano…
              </div>
            )}

            {/* PDF Viewer */}
            <PDFPreviewer
              url={`/api/v1/files/${selected.id}/original`}
              title={`Oficio ${selected.folio}`}
              height={420}
            />
          </div>
        </div>
      )}

      {/* ── Create Modal — 2 pasos ────────────────────────── */}
      <Modal
        open={showCreate}
        title={paso === 1 ? 'Paso 1 — Subir Oficio' : 'Paso 2 — Verificar Datos Extraídos'}
        onClose={() => { setShowCreate(false); resetForm(); }}
        width={680}
      >
        {/* ── PASO 1: subir PDF ──────────────────────────── */}
        {paso === 1 && (
          <div>
            {/* Instrucción */}
            <div style={{ padding: '14px 16px', backgroundColor: '#FDE8EF', borderLeft: `3px solid ${theme.colors.primary}`, borderRadius: '8px', marginBottom: '24px' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: theme.colors.primaryDark }}>
                🤖 Análisis automático con IA
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: theme.colors.textSecondary }}>
                Sube el PDF del oficio y la IA extraerá automáticamente el remitente, dependencia y descripción para que solo tengas que verificar.
              </p>
            </div>

            {/* Drop zone */}
            <label
              htmlFor="pdf-upload"
              style={{
                display:         'flex',
                flexDirection:   'column',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             '12px',
                padding:         '40px 24px',
                border:          `2px dashed ${pdfFile ? theme.colors.primary : theme.colors.border}`,
                borderRadius:    '12px',
                backgroundColor: pdfFile ? '#FDE8EF22' : theme.colors.background,
                cursor:          'pointer',
                transition:      'all 0.2s',
                marginBottom:    '20px',
              }}
            >
              <span style={{ fontSize: '2.5rem' }}>{pdfFile ? '📄' : '📂'}</span>
              {pdfFile ? (
                <>
                  <p style={{ margin: 0, fontWeight: 700, color: theme.colors.primary, fontSize: '0.9rem' }}>
                    {pdfFile.name}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                    {(pdfFile.size / 1024).toFixed(0)} KB · Clic para cambiar
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontWeight: 700, color: theme.colors.textPrimary, fontSize: '0.9rem' }}>
                    Arrastra el PDF aquí o haz clic para seleccionar
                  </p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                    Solo archivos PDF · Máximo 20 MB
                  </p>
                </>
              )}
              <input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPdfFile(f);
                }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => { setShowCreate(false); resetForm(); }} style={btnSecondary}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={!pdfFile || analizando}
                onClick={() => pdfFile && handleAnalizarPdf(pdfFile)}
                style={{
                  ...btnPrimary,
                  opacity: (!pdfFile || analizando) ? 0.6 : 1,
                  cursor:  (!pdfFile || analizando) ? 'not-allowed' : 'pointer',
                  minWidth: '160px',
                }}
              >
                {analizando ? '🤖 Analizando…' : '🤖 Analizar con IA →'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 2: verificar y guardar ────────────────── */}
        {paso === 2 && (
          <form onSubmit={handleCreate} noValidate>

            {/* Banner de confianza */}
            <div style={{
              display:         'flex',
              alignItems:      'flex-start',
              gap:             '10px',
              padding:         '12px 14px',
              borderRadius:    '8px',
              marginBottom:    '16px',
              backgroundColor: confianza === 'alta' ? '#D1FAE5' : confianza === 'media' ? '#FEF3C7' : '#FFF7ED',
              borderLeft:      `3px solid ${confianza === 'alta' ? theme.colors.alert.green : confianza === 'media' ? theme.colors.alert.yellow : theme.colors.gold}`,
            }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                {confianza === 'alta' ? '✅' : confianza === 'media' ? '⚠️' : '📋'}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem', color: theme.colors.charcoal }}>
                  {confianza === 'alta' ? 'Extracción exitosa — verifica los datos' :
                   confianza === 'media' ? 'Extracción parcial — revisa y completa los campos' :
                   'PDF escaneado — llena los campos manualmente'}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                  {confianza === 'baja'
                    ? '📌 El PDF parece ser una imagen escaneada. Los campos marcados con ✨ fueron llenados por IA; los demás debes completarlos.'
                    : `📄 ${pdfFile?.name} · Los campos marcados con ✨ fueron llenados por IA`
                  }
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaso(1)}
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: '0.75rem', color: theme.colors.primary, cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', flexShrink: 0 }}
              >
                ← Cambiar PDF
              </button>
            </div>

            {/* ── Texto completo extraído por IA ─────────── */}
            <div style={{
              marginBottom:    '20px',
              border:          `1.5px solid ${theme.colors.border}`,
              borderRadius:    '10px',
              overflow:        'hidden',
            }}>
              {/* Header del panel */}
              <div style={{
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'space-between',
                padding:         '10px 14px',
                backgroundColor: theme.colors.charcoal,
                color:           '#fff',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1rem' }}>📄</span>
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    Texto extraído del documento
                  </span>
                </div>
                <span style={{
                  fontSize:        '0.65rem',
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  padding:         '2px 8px',
                  borderRadius:    '10px',
                  fontWeight:      700,
                }}>
                  {textoOcr ? `${textoOcr.length} caracteres` : 'Sin texto'}
                </span>
              </div>

              {/* Cuerpo del texto */}
              {textoOcr ? (
                <div style={{
                  padding:         '14px',
                  backgroundColor: '#FAFAF8',
                  maxHeight:       '220px',
                  overflowY:       'auto',
                  fontSize:        '0.82rem',
                  lineHeight:      1.7,
                  color:           theme.colors.textPrimary,
                  whiteSpace:      'pre-wrap',
                  fontFamily:      'monospace',
                  userSelect:      'text',
                }}>
                  {textoOcr}
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: theme.colors.textSecondary, fontSize: '0.82rem', backgroundColor: '#FAFAF8' }}>
                  No se pudo extraer texto del documento. Llena los campos manualmente.
                </div>
              )}

              {/* Instrucción */}
              <div style={{
                padding:         '8px 14px',
                backgroundColor: '#F0F0EC',
                borderTop:       `1px solid ${theme.colors.border}`,
                fontSize:        '0.72rem',
                color:           theme.colors.textSecondary,
              }}>
                💡 Selecciona y copia el texto que necesites para llenar los campos de abajo
              </div>
            </div>

            {/* Folio automático */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', backgroundColor: '#EFF6FF', border: `1px solid #BFDBFE`, borderRadius: '8px', marginBottom: '16px' }}>
              <span>🔢</span>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#1D4ED8' }}>
                <strong>Folio automático</strong> — se asignará al guardar: <strong>OF-{'{oficina}'}-{new Date().getFullYear()}-{'{seq}'}</strong>
              </p>
            </div>

            <Field label={`Remitente ${remitente ? '✨' : ''}`} required>
              <input style={inputStyle} value={remitente} onChange={(e) => setRemitente(e.target.value)} required placeholder="Nombre del remitente" />
            </Field>
            <Field label={`Dependencia de Origen ${dependencia ? '✨' : ''}`} required>
              <input style={inputStyle} value={dependencia} onChange={(e) => setDependencia(e.target.value)} required />
            </Field>
            <Field label="Dirigido a" required>
              <select style={inputStyle} value={dirigidoA} onChange={(e) => setDirigidoA(e.target.value)} required>
                <option value="">— Selecciona el destinatario —</option>
                {destinatarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label={`Descripción de la Solicitud ${descripcion ? '✨' : ''}`} required>
              <textarea style={{ ...inputStyle, height: '90px', resize: 'vertical' }} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
            </Field>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <input id="tiene_termino" type="checkbox" checked={tieneTermino} onChange={(e) => setTieneTermino(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <label htmlFor="tiene_termino" style={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
                Tiene término / fecha límite {tieneTermino && fechaVence ? '✨' : ''}
              </label>
            </div>

            {tieneTermino && (
              <Field label="Fecha de Vencimiento" required>
                <input style={inputStyle} type="date" value={fechaVence} onChange={(e) => setFechaVence(e.target.value)} required />
              </Field>
            )}

            {createError && <div role="alert" style={alertStyle}>{createError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button type="button" onClick={() => { setShowCreate(false); resetForm(); }} style={btnSecondary}>
                Cancelar
              </button>
              <button type="submit" disabled={submitting} style={btnPrimary}>
                {submitting ? 'Guardando…' : '✓ Registrar Oficio'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div style={{ marginBottom: '16px' }}>
    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.875rem' }}>
      {label}{required && <span style={{ color: theme.colors.alert.red }}> *</span>}
    </label>
    {children}
  </div>
);

const InfoCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{
    backgroundColor: '#F8FAFC',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: '8px',
    padding: '10px 14px',
  }}>
    <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </p>
    <div style={{ fontSize: '0.875rem', color: theme.colors.textPrimary, fontWeight: 500 }}>
      {value}
    </div>
  </div>
);

// ── Styles ────────────────────────────────────────────────────────────────────
// (imported from ../styles — see thStyle, tdStyle, etc.)
