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
import { OficioDetalle } from '../components/OficioDetalle';
import { SearchableSelect } from '../components/SearchableSelect';
import { Modal }        from '../components/Modal';
import { useAuth }      from '../context/AuthContext';
import { useIsMobile }  from '../hooks/useIsMobile';
import { getOficios, createOficio, getUsuarios, finalizarOficio,
         getDependencias, crearDependencia, getRemitentes, crearRemitente,
         getUnidadesInternas, crearUnidadInterna, completarSiqroo } from '../api';
import type { CatalogoItem } from '../api';
import { textoCompresion } from '../utils/compresion';
import type { Oficio, EstatusOficio, Abogado } from '../types';
import { FiltrosOficios } from '../components/FiltrosOficios';
import { OficiosResumen } from '../components/OficiosResumen';
import {
  thStyle, tdStyle, inputStyle, selectStyle, emptyCell,
  btnPrimary, btnSecondary, alertStyle, labelStyle,
  tableHeaderStyle, detailPanelHeaderStyle, sectionTitleStyle,
} from '../styles';

const LIMIT = 100;   // tope del backend; la lista se recorre con scroll (sin paginación)

/** Documentos categorizados que se pueden adjuntar al ingreso de oficio */
const DOCUMENTOS_OFICIO = [
  { key: 'oficio',         label: 'Oficio'                },
  { key: 'anexos',         label: 'Anexos'                },
  { key: 'identificacion', label: 'Identificación oficial'},
  { key: 'recibos',        label: 'Recibos de pago'       },
] as const;

/**
 * Normaliza un nombre para DETECTAR duplicados al agregar al catálogo:
 * mayúsculas, sin acentos y espacios colapsados. Así "Poder Judicial",
 * "PODER  JUDICIAL" y "PODER JUDICÍAL" se consideran el mismo registro.
 */
const normDup = (s: string) =>
  (s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

export const Dashboard_Oficial: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // ── List state ────────────────────────────────────────────
  const [oficios,   setOficios]   = useState<Oficio[]>([]);
  const [total,     setTotal]     = useState(0);
  const [conteos,   setConteos]   = useState<Record<string, number>>({});
  const [page,      setPage]      = useState(1);
  const [estatus,   setEstatus]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Filtros de búsqueda (los captura el componente compartido FiltrosOficios) ──
  const [searchDeb,  setSearchDeb]  = useState('');
  const [desde,      setDesde]      = useState('');
  const [hasta,      setHasta]      = useState('');
  const [siqrooPend, setSiqrooPend] = useState(false);
  const [firmaPend,  setFirmaPend]  = useState(false);
  const [termino,    setTermino]    = useState('');
  const [dirigidoAId, setDirigidoAId] = useState('');

  // ── Detail panel ──────────────────────────────────────────
  const [selected, setSelected] = useState<Oficio | null>(null);

  // SIQROO: completar el NCI pendiente desde el detalle
  const [siqControl, setSiqControl] = useState('');
  const [siqSaving,  setSiqSaving]  = useState(false);
  useEffect(() => { setSiqControl(''); }, [selected?.id]);

  const siqrooPendiente = (o: Oficio) =>
    !!o.siqroo_aplica && !o.siqroo_control_interno;

  const handleCompletarSiqroo = async () => {
    if (!selected || !siqControl.trim()) return;
    setSiqSaving(true);
    try {
      const { data } = await completarSiqroo(selected.id, siqControl);
      setSelected(data);
      fetchOficios();
    } catch { /* noop */ }
    finally { setSiqSaving(false); }
  };

  // Aviso sutil de optimización del PDF tras registrar
  const [avisoCompresion, setAvisoCompresion] = useState<string | null>(null);

  // ── Create modal — paso 1: subir PDF, paso 2: corroborar campos ─
  const [showCreate,   setShowCreate]   = useState(false);
  const [paso,         setPaso]         = useState<1 | 2>(1);
  const [submitting,   setSubmitting]   = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);
  const [remitente,    setRemitente]    = useState('');
  const [dependencia,  setDependencia]  = useState('');
  const [unidadInterna, setUnidadInterna] = useState('');
  const [numOficioOrigen, setNumOficioOrigen] = useState('');
  const [fechaOficio,  setFechaOficio]  = useState('');
  const [dirigidoA,    setDirigidoA]    = useState('');
  const [descripcion,  setDescripcion]  = useState('');
  const [tieneTermino, setTieneTermino] = useState(false);
  const [fechaVence,   setFechaVence]   = useState('');
  const [pdfFile,      setPdfFile]      = useState<File | null>(null);
  // Documentos categorizados (opcionales): { anexos, identificacion, oficio, recibos, solicitud }
  const [docFiles,     setDocFiles]     = useState<Record<string, File | null>>({});

  // ── Subir documento firmado (para quien también es secretaría/finaliza) ──
  const [firmarOficio, setFirmarOficio] = useState<Oficio | null>(null);
  const [signedFile,   setSignedFile]   = useState<File | null>(null);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);

  // ── Catálogos: Dependencia → Sub-unidad (cascada) + Remitente (global, libre) ──
  const [dependencias,   setDependencias]   = useState<CatalogoItem[]>([]);
  const [unidadesList,   setUnidadesList]   = useState<CatalogoItem[]>([]);
  const [remitentesList, setRemitentesList] = useState<CatalogoItem[]>([]);
  const [depSel,         setDepSel]         = useState<number | ''>('');
  const [uniSel,         setUniSel]         = useState<number | ''>('');
  const [remSel,         setRemSel]         = useState<number | ''>('');
  const [addDepMode,     setAddDepMode]     = useState(false);
  const [addUniMode,     setAddUniMode]     = useState(false);
  const [addRemMode,     setAddRemMode]     = useState(false);
  const [nuevaDepNombre, setNuevaDepNombre] = useState('');
  const [nuevaUniNombre, setNuevaUniNombre] = useState('');
  const [nuevoRemNombre, setNuevoRemNombre] = useState('');

  // Dependencias (raíz) y remitentes (global) al abrir el modal
  useEffect(() => {
    if (!showCreate) return;
    getDependencias().then((r) => setDependencias(r.data)).catch(() => {});
    getRemitentes().then((r) => setRemitentesList(r.data)).catch(() => {});
  }, [showCreate]);

  // Sub-unidades al cambiar la dependencia (cascada)
  useEffect(() => {
    if (!depSel) { setUnidadesList([]); return; }
    getUnidadesInternas(Number(depSel)).then((r) => setUnidadesList(r.data)).catch(() => setUnidadesList([]));
  }, [depSel]);

  // ── SIQROO ────────────────────────────────────────────────
  const [siqrooAplica,  setSiqrooAplica]  = useState(false);
  const [siqrooControl, setSiqrooControl] = useState('');

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
      const res = await getOficios({
        page, limit: LIMIT,
        estatus:          estatus  || undefined,
        search:           searchDeb || undefined,
        desde:            desde    || undefined,
        hasta:            hasta    || undefined,
        siqroo_pendiente: siqrooPend || undefined,
        pendiente_firma:  firmaPend || undefined,
        termino:          termino  || undefined,
        dirigido_a_id:    dirigidoAId ? Number(dirigidoAId) : undefined,
      });
      setOficios(res.data); setTotal(res.meta.total);
      setConteos(((res.meta as any).conteos ?? {}) as Record<string, number>);
    } catch (err: any) { setListError(err.message); }
    finally { setLoading(false); }
  }, [page, estatus, searchDeb, desde, hasta, siqrooPend, firmaPend, termino, dirigidoAId]);
  useEffect(() => { fetchOficios(); }, [fetchOficios]);

  // Polling: mientras el OCR del oficio seleccionado no termine
  // (ocr_procesado === false), refresca cada 4s para que la leyenda
  // "Procesando OCR…" se actualice y desaparezca sola al completarse.
  useEffect(() => {
    if (!selected || (selected as any).ocr_procesado !== false) return;
    const t = setInterval(() => { fetchOficios(); }, 4000);
    return () => clearInterval(t);
  }, [selected, fetchOficios]);

  // Sincroniza el oficio seleccionado con la lista ya refrescada, para reflejar
  // el fin del OCR sin tener que reabrir el detalle.
  useEffect(() => {
    if (!selected) return;
    const fresh = oficios.find((o) => o.id === selected.id);
    if (fresh && (fresh as any).ocr_procesado !== (selected as any).ocr_procesado) {
      setSelected(fresh);
    }
  }, [oficios]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Subir el documento firmado y finalizar el oficio (VOBO_APROBADO → FINALIZADO).
  const handleUploadSigned = async (e: FormEvent) => {
    e.preventDefault();
    if (!firmarOficio || !signedFile) return;
    setUploading(true); setUploadError(null);
    try {
      await finalizarOficio(firmarOficio.id, signedFile);
      setFirmarOficio(null); setSignedFile(null);
      fetchOficios();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Analizar el "Oficio" con IA (OCR) ─────────────────────
  // ── Catálogos: selección y alta al vuelo (cascada) ──
  const seleccionarDependencia = (id: number | '', nombre?: string) => {
    setDepSel(id);
    setDependencia(id ? (nombre ?? dependencias.find((d) => d.id === id)?.nombre ?? '') : '');
    // Cambió la dependencia → limpiar sub-unidad (cuelga de ella). El remitente es libre, no se toca.
    setUniSel(''); setUnidadInterna(''); setAddUniMode(false);
  };
  const seleccionarUnidad = (id: number | '', nombre?: string) => {
    setUniSel(id);
    setUnidadInterna(id ? (nombre ?? unidadesList.find((u) => u.id === id)?.nombre ?? '') : '');
  };
  const seleccionarRemitente = (id: number | '', nombre?: string) => {
    setRemSel(id);
    setRemitente(id ? (nombre ?? remitentesList.find((r) => r.id === id)?.nombre ?? '') : '');
  };
  const agregarDependencia = async () => {
    const nombre = nuevaDepNombre.trim().toUpperCase();
    if (!nombre) return;
    // Evita duplicados: si ya existe (ignorando acentos/espacios), selecciónalo y avisa.
    const existente = dependencias.find((d) => normDup(d.nombre) === normDup(nombre));
    if (existente) {
      seleccionarDependencia(existente.id, existente.nombre);
      setAddDepMode(false); setNuevaDepNombre(''); setCreateError(null);
      window.alert(`La dependencia «${existente.nombre}» ya existe en el catálogo. Se seleccionó el registro existente.`);
      return;
    }
    try {
      const resp = await crearDependencia(nombre);
      const data = resp.data;
      setDependencias((prev) =>
        [...prev.filter((d) => d.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      seleccionarDependencia(data.id, data.nombre);
      setAddDepMode(false); setNuevaDepNombre('');
      if ((resp as any).yaExistia) window.alert(`La dependencia «${data.nombre}» ya existía. Se seleccionó el registro existente.`);
    } catch (err: any) { setCreateError(err.message); }
  };
  const agregarUnidad = async () => {
    const nombre = nuevaUniNombre.trim();
    if (!nombre || !depSel) return;
    const existente = unidadesList.find((u) => normDup(u.nombre) === normDup(nombre));
    if (existente) {
      seleccionarUnidad(existente.id, existente.nombre);
      setAddUniMode(false); setNuevaUniNombre(''); setCreateError(null);
      window.alert(`La sub-unidad «${existente.nombre}» ya existe en esta dependencia. Se seleccionó el registro existente.`);
      return;
    }
    try {
      const resp = await crearUnidadInterna(Number(depSel), nombre);
      const data = resp.data;
      setUnidadesList((prev) =>
        [...prev.filter((u) => u.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      seleccionarUnidad(data.id, data.nombre);
      setAddUniMode(false); setNuevaUniNombre('');
      if ((resp as any).yaExistia) window.alert(`La sub-unidad «${data.nombre}» ya existía. Se seleccionó el registro existente.`);
    } catch (err: any) { setCreateError(err.message); }
  };
  const agregarRemitente = async () => {
    const nombre = nuevoRemNombre.trim();
    if (!nombre) return;
    const existente = remitentesList.find((r) => normDup(r.nombre) === normDup(nombre));
    if (existente) {
      seleccionarRemitente(existente.id, existente.nombre);
      setAddRemMode(false); setNuevoRemNombre(''); setCreateError(null);
      window.alert(`El remitente «${existente.nombre}» ya existe en el catálogo. Se seleccionó el registro existente.`);
      return;
    }
    try {
      const resp = await crearRemitente(nombre);
      const data = resp.data;
      setRemitentesList((prev) =>
        [...prev.filter((r) => r.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      seleccionarRemitente(data.id, data.nombre);
      setAddRemMode(false); setNuevoRemNombre('');
      if ((resp as any).yaExistia) window.alert(`El remitente «${data.nombre}» ya existía. Se seleccionó el registro existente.`);
    } catch (err: any) { setCreateError(err.message); }
  };

  // ── Guardar oficio ────────────────────────────────────────
  const resetForm = () => {
    setPaso(1);
    setRemitente(''); setDependencia(''); setUnidadInterna(''); setDirigidoA('');
    setDescripcion(''); setTieneTermino(false); setFechaVence('');
    setPdfFile(null); setDocFiles({}); setCreateError(null);
    setDepSel(''); setUniSel(''); setRemSel('');
    setAddDepMode(false); setAddUniMode(false); setAddRemMode(false);
    setNuevaDepNombre(''); setNuevaUniNombre(''); setNuevoRemNombre(''); setNumOficioOrigen(''); setFechaOficio('');
    setSiqrooAplica(false); setSiqrooControl('');
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    // Campos obligatorios para ingresar un oficio (documento Oficio + los marcados con *).
    const faltanObligatorios =
      !docFiles['oficio'] || !dependencia.trim() || !unidadInterna.trim() || !remitente.trim() ||
      !numOficioOrigen.trim() || !fechaOficio || !dirigidoA || !descripcion.trim();
    if (faltanObligatorios) { setCreateError('Completa los campos obligatorios (marcados con *).'); return; }
    // Si marcó "tiene término", pedimos la fecha de vencimiento.
    if (tieneTermino && !fechaVence) { setCreateError('Ingresa la fecha de vencimiento'); return; }
    setSubmitting(true); setCreateError(null);
    try {
      const fd = new FormData();
      fd.append('remitente',             remitente);
      fd.append('dependencia_origen',    dependencia);
      fd.append('unidad_interna',        unidadInterna);
      fd.append('numero_oficio_origen',  numOficioOrigen.trim());
      fd.append('fecha_oficio',          fechaOficio);
      fd.append('dirigido_a_id',         dirigidoA);
      fd.append('descripcion_solicitud', descripcion);
      fd.append('tiene_termino',         String(tieneTermino));
      if (tieneTermino) fd.append('fecha_vencimiento', fechaVence);
      // Documentos categorizados opcionales (uno por tipo; "oficio" es el principal)
      DOCUMENTOS_OFICIO.forEach(({ key }) => {
        const f = docFiles[key];
        if (f) fd.append(key, f);
      });
      // SIQROO
      fd.append('siqroo_aplica', String(siqrooAplica));
      if (siqrooAplica && siqrooControl.trim()) {
        fd.append('siqroo_control_interno', siqrooControl.trim());
      }
      const resp = await createOficio(fd);
      const aviso = textoCompresion(resp.compresion);
      setShowCreate(false); resetForm(); fetchOficios();
      if (aviso) {
        setAvisoCompresion(aviso);
        setTimeout(() => setAvisoCompresion(null), 6000);
      }
    } catch (err: any) { setCreateError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)', backgroundColor: theme.colors.background, overflow: 'hidden' }}>

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

          {avisoCompresion && (
            <div style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              margin:       '0 0 12px',
              padding:      '6px 10px',
              borderRadius: theme.radius.sm,
              backgroundColor: '#EAF7EE',
              color:        '#1B7A3D',
              fontSize:     '0.72rem',
              fontWeight:   500,
              width:        'fit-content',
            }}>
              <span aria-hidden>📉</span>{avisoCompresion}
            </div>
          )}

          {/* Tarjeta de resumen (rectángulo pequeño) + filtros, en la misma fila */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'stretch', marginBottom: '16px' }}>
            <div style={{ flex: '1 1 220px', maxWidth: '300px', display: 'flex' }}>
              <OficiosResumen conteos={conteos} estatus={estatus} />
            </div>
            <div style={{ flex: '3 1 420px', display: 'flex' }}>
              <FiltrosOficios onChange={(f) => {
                setSearchDeb(f.search);
                setEstatus(f.estatus);
                setTermino(f.termino);
                setDesde(f.desde);
                setHasta(f.hasta);
                setSiqrooPend(f.siqroo_pendiente);
                setFirmaPend(f.pendiente_firma);
                setDirigidoAId(f.area);
                setPage(1);
              }} />
            </div>
          </div>
        </div>

        {listError && <div role="alert" style={{ ...alertStyle, margin: '12px 24px' }}>{listError}</div>}

        {/* Table */}
        <div className="scroll-x" style={{ flex: 1, overflowY: 'auto', margin: '4px 24px 24px', border: `1px solid ${theme.colors.border}`, borderRadius: '14px', backgroundColor: theme.colors.surface, boxShadow: theme.shadow.sm }}>
          <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={tableHeaderStyle}>
                {['Folio', 'Remitente', 'Dependencia', 'Fecha Ingreso', 'Término', 'Estatus', 'En bandeja de', 'SIQROO'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={emptyCell}>Cargando…</td></tr>
              ) : oficios.length === 0 ? (
                <tr><td colSpan={8} style={emptyCell}>Sin registros</td></tr>
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
                    <td style={{ ...tdStyle, color: theme.colors.textSecondary, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                      {o.dependencia_origen}
                    </td>
                    <td style={tdStyle}>{new Date(o.fecha_registro).toLocaleDateString('es-MX')}</td>
                    <td style={tdStyle}>
                      <TerminoTimer tiene_termino={o.tiene_termino} fecha_vencimiento={o.fecha_vencimiento} />
                    </td>
                    <td style={tdStyle}><StatusBadge estatus={o.estatus as EstatusOficio} /></td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem', color: o.en_bandeja_de ? theme.colors.textPrimary : theme.colors.textSecondary }}>
                      {o.en_bandeja_de ? `👤 ${o.en_bandeja_de}` : '—'}
                    </td>
                    <td style={{ ...tdStyle, width: '1%', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {!o.siqroo_aplica ? (
                        <span style={{ color: theme.colors.textSecondary, fontSize: '0.75rem' }}>—</span>
                      ) : siqrooPendiente(o) ? (
                        <span style={{ fontSize: '0.66rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap' }}>Pendiente</span>
                      ) : (
                        <span style={{ fontSize: '0.66rem', fontWeight: 700, backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap' }}>Completo</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* La lista se recorre con scroll. Aviso si hay más de los cargados. */}
        {total > oficios.length && (
          <div style={{ padding: '8px', textAlign: 'center', fontSize: '0.74rem', color: theme.colors.textSecondary, borderTop: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.surface }}>
            Mostrando {oficios.length} de {total} · acota con los filtros para ver el resto
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

            <OficioDetalle
              oficio={selected}
              acciones={
                <>
                  {/* Subir documento firmado (para quien también finaliza) */}
                  {selected.puede_finalizar && selected.estatus === 'VOBO_APROBADO' && (
                    <button
                      type="button"
                      onClick={() => { setFirmarOficio(selected); setSignedFile(null); setUploadError(null); }}
                      style={{ ...btnPrimary, width: '100%', marginBottom: '14px' }}
                    >
                      Subir documento firmado
                    </button>
                  )}
                  {selected.estatus === 'FINALIZADO' && (
                    <div style={{ marginBottom: '14px', fontSize: '0.8rem', fontWeight: 700, color: '#065F46' }}>✓ Documento firmado</div>
                  )}

                  {/* SIQROO — estado y completar datos pendientes */}
                  {selected.siqroo_aplica && (
                    <div style={{
                      border: `1px solid ${siqrooPendiente(selected) ? '#F59E0B' : theme.colors.border}`,
                      backgroundColor: siqrooPendiente(selected) ? '#FFFBEB' : theme.colors.background,
                      borderRadius: '8px', padding: '14px', marginBottom: '14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SIQROO</span>
                        {siqrooPendiente(selected)
                          ? <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px' }}>🚩 Pendiente por completar</span>
                          : <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '10px' }}>✓ Completo</span>}
                      </div>

                      <div style={{ fontSize: '0.8rem', color: theme.colors.textPrimary, marginBottom: siqrooPendiente(selected) ? '12px' : 0 }}>
                        <div>Nº de control interno: <strong>{selected.siqroo_control_interno || '—'}</strong></div>
                      </div>

                      {siqrooPendiente(selected) && (
                        <div style={{ display: 'grid', gap: '8px', borderTop: `1px dashed ${theme.colors.border}`, paddingTop: '10px' }}>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.textSecondary }}>Completa el número de control interno:</p>
                          <input style={{ ...inputStyle, fontSize: '0.82rem' }} value={siqControl} onChange={(e) => setSiqControl(e.target.value)} placeholder="Número de control interno" />
                          <button
                            type="button"
                            onClick={handleCompletarSiqroo}
                            disabled={siqSaving || !siqControl.trim()}
                            style={{ ...btnPrimary, alignSelf: 'flex-start', opacity: (siqSaving || !siqControl.trim()) ? 0.6 : 1 }}
                          >
                            {siqSaving ? 'Guardando…' : 'Guardar NCI'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* El texto extraído por OCR se muestra al abrir el documento "Oficio"
                      desde la tabla de documentos requisitos (visor). */}

                  {(selected as any).ocr_procesado === false && (
                    <div style={{ backgroundColor: '#F0F9FF', border: `1px solid #BAE6FD`, borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem', color: '#0369A1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>⏳</span> Procesando OCR en segundo plano…
                    </div>
                  )}
                </>
              }
            />
          </div>
        </div>
      )}

      {/* ── Create Modal — un solo formulario ─────────────── */}
      <Modal
        open={showCreate}
        title="Registrar Oficio"
        onClose={() => { setShowCreate(false); resetForm(); }}
        width={680}
        closeOnBackdrop={false}
        confirmClose
      >
          <form onSubmit={handleCreate} noValidate>
            {/* Instrucción */}
            <div style={{ padding: '10px 12px', backgroundColor: '#FDE8EF', borderLeft: `3px solid ${theme.colors.primary}`, borderRadius: '8px', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.76rem', color: theme.colors.textSecondary, lineHeight: 1.4 }}>
                Adjunta los documentos requisito. Al cargar el <strong>Oficio</strong>, el OCR realizará la extracción del texto contenido en el documento, a efecto de facilitar la identificación y captura de la información necesaria para su procesamiento.
              </p>
            </div>

            {/* Documentos requisito — arriba, como casillas con palomita de agregado */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: theme.colors.charcoal, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Documentos requisito:
                <span style={{ display: 'block', marginTop: '3px', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: theme.colors.textSecondary }}>El Oficio es de carácter obligatorio; los demás documentos podrán incorporarse de manera opcional como soporte documental.</span>
              </label>
              <div style={{ display: 'grid', gap: '8px' }}>
                {DOCUMENTOS_OFICIO.map(({ key, label }) => {
                  const file  = docFiles[key];
                  const added = !!file;
                  return (
                    <label
                      key={key}
                      htmlFor={`doc-${key}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: `1.5px solid ${added ? theme.colors.alert.green : theme.colors.border}`,
                        backgroundColor: added ? '#ECFDF5' : theme.colors.background,
                        transition: 'all 0.15s',
                      }}
                    >
                      {/* Casilla / palomita */}
                      <span style={{
                        width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${added ? theme.colors.alert.green : theme.colors.border}`,
                        backgroundColor: added ? theme.colors.alert.green : '#fff',
                        color: '#fff', fontSize: '0.8rem', fontWeight: 800,
                      }}>{added ? '✓' : ''}</span>

                      <span style={{ fontWeight: 600, fontSize: '0.82rem', color: theme.colors.textPrimary, flexShrink: 0 }}>
                        {label}{key === 'oficio' && <span style={{ color: theme.colors.alert.red }}> *</span>}
                      </span>

                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.72rem', textAlign: 'right', color: added ? '#065F46' : theme.colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {added ? file!.name : 'Adjuntar…'}
                      </span>

                      {added && (
                        <button
                          type="button"
                          title="Ver documento cargado"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const url = URL.createObjectURL(file!);
                            window.open(url, '_blank', 'noopener');
                            setTimeout(() => URL.revokeObjectURL(url), 30000);
                          }}
                          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', lineHeight: 1 }}
                        >
                          👁️
                        </button>
                      )}

                      <input
                        id={`doc-${key}`}
                        type="file"
                        accept=".pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setDocFiles((prev) => ({ ...prev, [key]: f }));
                          // El "Oficio" solo se adjunta; la IA NO prellena los campos.
                          // El texto se extrae en segundo plano al guardar (para búsquedas).
                          if (key === 'oficio') setPdfFile(f);
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                Los documentos que integren el expediente electrónico deberán adjuntarse en formato <strong>PDF</strong>.
              </p>
            </div>

            {/* Folio automático */}
            <div style={{ padding: '8px 12px', backgroundColor: '#EFF6FF', border: `1px solid #BFDBFE`, borderRadius: '8px', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#1D4ED8' }}>
                <strong>Folio de seguimiento:</strong> Será generado automáticamente por el sistema al momento de guardar el registro, conforme a la siguiente estructura: <strong>OF-(FECHA)-(ÁREA)-(CONSECUTIVO)</strong>.
              </p>
            </div>

            {/* Dependencia solicitante — catálogo independiente */}
            <Field label="Dependencia Solicitante" required>
              {addDepMode ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...inputStyle, textTransform: 'uppercase' }} value={nuevaDepNombre} onChange={(e) => setNuevaDepNombre(e.target.value.toUpperCase())} placeholder="NOMBRE DE LA NUEVA DEPENDENCIA" autoFocus />
                  <button type="button" onClick={agregarDependencia} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>Agregar</button>
                  <button type="button" onClick={() => { setAddDepMode(false); setNuevaDepNombre(''); }} style={btnSecondary}>✕</button>
                </div>
              ) : (
                <SearchableSelect
                  value={depSel === '' ? '' : String(depSel)}
                  options={dependencias.map((d) => ({ value: String(d.id), label: d.nombre }))}
                  onChange={(v) => seleccionarDependencia(v ? Number(v) : '')}
                  placeholder="— Selecciona la dependencia —"
                  addLabel="➕ Agregar nueva dependencia…"
                  onAdd={() => setAddDepMode(true)}
                />
              )}
            </Field>

            {/* Unidad administrativa — cuelga de la dependencia (obligatoria) */}
            <Field label="Unidad administrativa / Dirección / Departamento" required>
              {!depSel ? (
                <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
                  Selecciona primero la dependencia.
                </p>
              ) : addUniMode ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...inputStyle, textTransform: 'uppercase' }} value={nuevaUniNombre} onChange={(e) => setNuevaUniNombre(e.target.value.toUpperCase())} placeholder="NOMBRE DE LA UNIDAD ADMINISTRATIVA" autoFocus />
                  <button type="button" onClick={agregarUnidad} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>Agregar</button>
                  <button type="button" onClick={() => { setAddUniMode(false); setNuevaUniNombre(''); }} style={btnSecondary}>✕</button>
                </div>
              ) : (
                <SearchableSelect
                  value={uniSel === '' ? '' : String(uniSel)}
                  options={unidadesList.map((u) => ({ value: String(u.id), label: u.nombre }))}
                  onChange={(v) => seleccionarUnidad(v ? Number(v) : '')}
                  placeholder="— Selecciona la unidad administrativa —"
                  addLabel="➕ Agregar nueva unidad administrativa…"
                  onAdd={() => setAddUniMode(true)}
                />
              )}
            </Field>

            {/* Remitente (persona) — catálogo GLOBAL, independiente de dependencia/sub-unidad */}
            <Field label="Remitente" required>
              {addRemMode ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...inputStyle, textTransform: 'uppercase' }} value={nuevoRemNombre} onChange={(e) => setNuevoRemNombre(e.target.value.toUpperCase())} placeholder="NOMBRE COMPLETO DEL REMITENTE" autoFocus />
                  <button type="button" onClick={agregarRemitente} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>Agregar</button>
                  <button type="button" onClick={() => { setAddRemMode(false); setNuevoRemNombre(''); }} style={btnSecondary}>✕</button>
                </div>
              ) : (
                <SearchableSelect
                  value={remSel === '' ? '' : String(remSel)}
                  options={remitentesList.map((r) => ({ value: String(r.id), label: r.nombre }))}
                  onChange={(v) => seleccionarRemitente(v ? Number(v) : '')}
                  placeholder="— Selecciona el remitente —"
                  addLabel="➕ Agregar nuevo remitente…"
                  onAdd={() => setAddRemMode(true)}
                />
              )}
            </Field>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <Field label="Número de oficio" required>
                  <input
                    style={{ ...inputStyle, textTransform: 'uppercase' }}
                    value={numOficioOrigen}
                    onChange={(e) => setNumOficioOrigen(e.target.value.toUpperCase())}
                    placeholder=""
                  />
                </Field>
              </div>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <Field label="Fecha del oficio" required>
                  <input
                    style={inputStyle}
                    type="date"
                    value={fechaOficio}
                    onChange={(e) => setFechaOficio(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <Field label="Dirigido a" required>
              <SearchableSelect
                value={dirigidoA}
                options={destinatarios.map((u) => ({ value: String(u.id), label: `${u.nombre}${u.cargo ? ` — ${u.cargo}` : ''}`.toUpperCase() }))}
                onChange={(v) => setDirigidoA(v)}
                placeholder="— Selecciona el destinatario —"
              />
            </Field>
            <Field label="Asunto" required>
              <textarea style={{ ...inputStyle, height: '90px', resize: 'vertical' }} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
            </Field>


            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Término / fecha límite */}
              <div style={{ flex: '1 1 240px', minWidth: 0, marginBottom: '16px', padding: '12px 14px', backgroundColor: theme.colors.background, border: `1px solid ${theme.colors.border}`, borderRadius: '8px' }}>
                <label htmlFor="tiene_termino" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input id="tiene_termino" type="checkbox" checked={tieneTermino} onChange={(e) => setTieneTermino(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Tiene término / fecha límite
                  </span>
                </label>

                {tieneTermino && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                      Fecha de vencimiento <span style={{ color: theme.colors.alert.red }}>*</span>
                    </label>
                    <input style={inputStyle} type="date" value={fechaVence} onChange={(e) => setFechaVence(e.target.value)} required />
                  </div>
                )}
              </div>

              {/* SIQROO */}
              <div style={{ flex: '1 1 240px', minWidth: 0, marginBottom: '16px', padding: '12px 14px', backgroundColor: theme.colors.background, border: `1px solid ${theme.colors.border}`, borderRadius: '8px' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: theme.colors.charcoal, marginBottom: '8px' }}>
                  ¿Solicitud ingresada a SIQROO?
                </label>
                <div style={{ display: 'flex', gap: '18px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="radio" name="siqroo" checked={siqrooAplica} onChange={() => setSiqrooAplica(true)} /> Aplica
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="radio" name="siqroo" checked={!siqrooAplica} onChange={() => setSiqrooAplica(false)} /> No aplica
                  </label>
                </div>
                {siqrooAplica && (
                  <input style={{ ...inputStyle, fontSize: '0.82rem', marginTop: '10px' }} value={siqrooControl} onChange={(e) => setSiqrooControl(e.target.value)} placeholder="NCI SIQROO (opcional)" />
                )}
              </div>
            </div>

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
      </Modal>

      {/* Modal: subir documento firmado y finalizar (para quien también finaliza) */}
      <Modal open={!!firmarOficio} title={`Subir Documento Firmado — ${firmarOficio?.folio ?? ''}`} onClose={() => { setFirmarOficio(null); setSignedFile(null); setUploadError(null); }}>
        <form onSubmit={handleUploadSigned} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Documento escaneado y firmado (PDF) <span style={{ color: theme.colors.alert.red }}> *</span></label>
            <input type="file" accept=".pdf,application/pdf" onChange={(e) => setSignedFile(e.target.files?.[0] ?? null)} />
            {signedFile && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: theme.colors.alert.green }}>✓ {signedFile.name}</p>}
          </div>
          {uploadError && <div role="alert" style={alertStyle}>{uploadError}</div>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" onClick={() => { setFirmarOficio(null); setSignedFile(null); setUploadError(null); }} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={uploading || !signedFile} style={btnPrimary}>{uploading ? 'Subiendo…' : 'Finalizar Oficio'}</button>
          </div>
        </form>
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

// ── Styles ────────────────────────────────────────────────────────────────────
// (imported from ../styles — see thStyle, tdStyle, etc.)
