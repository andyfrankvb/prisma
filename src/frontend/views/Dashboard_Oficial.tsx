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
import { SistemasPanel, SistemasChips } from '../components/SistemasPanel';
import { DeConocimientoPanel } from '../components/DeConocimientoPanel';
import { TurnarPanel } from '../components/TurnarPanel';
import { SeccionCatalogos } from './SeccionCatalogos';
import { Modal }        from '../components/Modal';
import { useAuth }      from '../context/AuthContext';
import { useIsMobile }  from '../hooks/useIsMobile';
import { getOficios, createOficio, getUsuarios, finalizarOficio,
         getDependencias, crearDependencia, getRemitentes, crearRemitente,
         getUnidadesInternas, crearUnidadInterna,
         getCorreos, crearCorreo, verificarDuplicado, getPermisosCatalogos } from '../api';
import type { CatalogoItem, TipoCorreo, PosibleDuplicado } from '../api';
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
    getCorreos('origen').then((r) => setCorreosOri(r.data)).catch(() => {});
    getCorreos('destino').then((r) => setCorreosDes(r.data)).catch(() => {});
  }, [showCreate]);

  // Sub-unidades al cambiar la dependencia (cascada)
  useEffect(() => {
    if (!depSel) { setUnidadesList([]); return; }
    getUnidadesInternas(Number(depSel)).then((r) => setUnidadesList(r.data)).catch(() => setUnidadesList([]));
  }, [depSel]);

  // Por dónde entró el oficio. Por correo, se piden las dos cuentas.
  const [viaRecepcion,  setViaRecepcion]  = useState<'VENTANILLA' | 'CORREO_ELECTRONICO'>('VENTANILLA');
  const [correoOrigen,  setCorreoOrigen]  = useState('');
  const [correoDestino, setCorreoDestino] = useState('');
  // Dos catálogos independientes de correos, cada uno con su alta al vuelo.
  const [correosOri,    setCorreosOri]    = useState<CatalogoItem[]>([]);
  const [correosDes,    setCorreosDes]    = useState<CatalogoItem[]>([]);
  const [addCorMode,    setAddCorMode]    = useState<TipoCorreo | null>(null);
  const [nuevoCorreo,   setNuevoCorreo]   = useState('');
  // Oficios ya capturados que se parecen al que se está registrando.
  const [duplicados,   setDuplicados]   = useState<PosibleDuplicado[]>([]);
  const [dupConfirmado, setDupConfirmado] = useState(false);

  // Depuración de catálogos: solo para quien tenga el permiso, sin pasar por el
  // panel del SuperAdmin.
  const [puedeCatalogos, setPuedeCatalogos] = useState(false);
  const [verCatalogos,   setVerCatalogos]   = useState(false);
  useEffect(() => {
    getPermisosCatalogos()
      .then((r) => setPuedeCatalogos(r.data.puede_gestionar))
      .catch(() => setPuedeCatalogos(false));
  }, []);

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

  /**
   * Busca oficios parecidos mientras se captura, para avisar antes de que el
   * oficial llene el resto del formulario. El alta vuelve a verificar por su
   * cuenta: esto solo es una ayuda.
   */
  const revisarDuplicados = async () => {
    if (!dependencia.trim() || !numOficioOrigen.trim()) { setDuplicados([]); return; }
    try {
      const { data } = await verificarDuplicado({
        dependencia_origen:   dependencia,
        numero_oficio_origen: numOficioOrigen,
        remitente:            remitente,
        fecha_oficio:         fechaOficio,
      });
      setDuplicados([...data.bloqueantes, ...data.advertencias]);
      setDupConfirmado(false);
    } catch { /* la verificación es opcional: si falla, el alta igual valida */ }
  };

  /** Da de alta un correo en su catálogo y lo deja seleccionado. */
  const agregarCorreo = async (tipo: TipoCorreo) => {
    const correo = nuevoCorreo.trim().toLowerCase();
    if (!correo) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setCreateError('El correo no tiene un formato válido'); return;
    }
    const lista    = tipo === 'origen' ? correosOri : correosDes;
    const setLista = tipo === 'origen' ? setCorreosOri : setCorreosDes;
    const usar     = tipo === 'origen' ? setCorreoOrigen : setCorreoDestino;

    const existente = lista.find((c) => c.nombre === correo);
    if (existente) {
      usar(existente.nombre); setAddCorMode(null); setNuevoCorreo(''); setCreateError(null);
      window.alert(`El correo «${existente.nombre}» ya está en el catálogo. Se seleccionó el registro existente.`);
      return;
    }
    try {
      const { data } = await crearCorreo(tipo, correo);
      setLista((prev) => [...prev.filter((c) => c.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      usar(data.nombre); setAddCorMode(null); setNuevoCorreo(''); setCreateError(null);
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
    setViaRecepcion('VENTANILLA'); setCorreoOrigen(''); setCorreoDestino('');
    setAddCorMode(null); setNuevoCorreo('');
    setDuplicados([]); setDupConfirmado(false);
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
    // Si llegó por correo, los dos correos son la constancia de cómo entró.
    if (viaRecepcion === 'CORREO_ELECTRONICO') {
      const formato = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!correoOrigen.trim() || !correoDestino.trim()) {
        setCreateError('Captura el correo de quien envía y el correo que lo recibió'); return;
      }
      if (!formato.test(correoOrigen.trim()) || !formato.test(correoDestino.trim())) {
        setCreateError('Alguno de los correos no tiene un formato válido'); return;
      }
    }
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
      // El oficial ya vio los oficios parecidos y decidió continuar.
      if (dupConfirmado) fd.append('confirmar_duplicado', 'true');
      // Vía de recepción
      fd.append('via_recepcion', viaRecepcion);
      if (viaRecepcion === 'CORREO_ELECTRONICO') {
        fd.append('correo_origen',  correoOrigen.trim().toLowerCase());
        fd.append('correo_destino', correoDestino.trim().toLowerCase());
      }
      const resp = await createOficio(fd);
      const aviso = textoCompresion(resp.compresion);
      setShowCreate(false); resetForm(); fetchOficios();
      if (aviso) {
        setAvisoCompresion(aviso);
        setTimeout(() => setAvisoCompresion(null), 6000);
      }
    } catch (err: any) {
      setCreateError(err.message);
      // El servidor devuelve los oficios parecidos para que el oficial los revise.
      if (err.detalles?.advertencias?.length) {
        setDuplicados(err.detalles.advertencias);
        setDupConfirmado(false);
      }
    }
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {puedeCatalogos && (
                <button onClick={() => setVerCatalogos(true)} style={btnSecondary}>
                  Catálogos
                </button>
              )}
              <button onClick={() => setShowCreate(true)} style={btnPrimary}>
                + Registrar Oficio
              </button>
            </div>
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
                {['Folio', 'Remitente', 'Dependencia', 'Fecha Ingreso', 'Término', 'Estatus', 'En bandeja de', 'Sistemas'].map((h) => (
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
                      <SistemasChips oficio={o} />
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

                  {/* Registro en SIQROO / SIGER: se marca aquí, no al ingresar */}
                  <SistemasPanel
                    oficio={selected}
                    onDone={(o) => { setSelected((prev) => prev ? { ...prev, ...o } : o); fetchOficios(); }}
                  />
                  <DeConocimientoPanel
                    oficio={selected}
                    onDone={(o) => { setSelected((prev) => prev ? { ...prev, ...o } : o); fetchOficios(); }}
                  />
                  <TurnarPanel oficio={selected} onDone={() => { setSelected(null); fetchOficios(); }} />

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
      {/* Catálogos: buscar dónde está ya capturado algo y depurar duplicados */}
      <Modal
        open={verCatalogos}
        title="Catálogos de ingreso"
        onClose={() => setVerCatalogos(false)}
        width={1100}
      >
        <SeccionCatalogos />
      </Modal>

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
                    onBlur={revisarDuplicados}
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
            {/* Oficios parecidos ya capturados: se muestran para que el oficial decida */}
            {duplicados.length > 0 && (
              <div style={{
                marginBottom: '16px', padding: '12px 14px', borderRadius: '8px',
                backgroundColor: '#FFFBEB', border: '1px solid #F59E0B',
              }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 700, color: '#92400E' }}>
                  {duplicados.length === 1
                    ? 'Ya hay un oficio parecido capturado'
                    : `Ya hay ${duplicados.length} oficios parecidos capturados`}
                </p>
                <div style={{ display: 'grid', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                  {duplicados.map((d) => (
                    <div key={d.id} style={{ fontSize: '0.78rem', color: theme.colors.textPrimary }}>
                      <strong>{d.folio}</strong>
                      {d.numero_oficio_origen && <> · {d.numero_oficio_origen}</>}
                      {d.remitente && <> · {d.remitente}</>}
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#92400E' }}>
                        {d.explicacion}
                      </span>
                    </div>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dupConfirmado}
                    onChange={(e) => setDupConfirmado(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  Ya los revisé: este oficio es distinto y quiero registrarlo
                </label>
              </div>
            )}

            {/* Vía de recepción: por ventanilla o por correo electrónico */}
            <div style={{ marginBottom: '16px', padding: '12px 14px', backgroundColor: theme.colors.background, border: `1px solid ${theme.colors.border}`, borderRadius: '8px' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: theme.colors.charcoal, marginBottom: '8px' }}>
                ¿Cómo se recibió el oficio? <span style={{ color: theme.colors.alert.red }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="radio" name="via_recepcion" checked={viaRecepcion === 'VENTANILLA'}
                    onChange={() => setViaRecepcion('VENTANILLA')} /> Ventanilla
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="radio" name="via_recepcion" checked={viaRecepcion === 'CORREO_ELECTRONICO'}
                    onChange={() => setViaRecepcion('CORREO_ELECTRONICO')} /> Correo electrónico
                </label>
              </div>

              {viaRecepcion === 'CORREO_ELECTRONICO' && (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '12px' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                      Correo de quien envía <span style={{ color: theme.colors.alert.red }}>*</span>
                    </label>
                    {addCorMode === 'origen' ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input style={{ ...inputStyle, fontSize: '0.82rem' }} type="email" value={nuevoCorreo} autoFocus
                          onChange={(e) => setNuevoCorreo(e.target.value.toLowerCase())}
                          placeholder="correo@dependencia.gob.mx" />
                        <button type="button" onClick={() => agregarCorreo('origen')} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>Agregar</button>
                        <button type="button" onClick={() => { setAddCorMode(null); setNuevoCorreo(''); }} style={btnSecondary}>✕</button>
                      </div>
                    ) : (
                      <SearchableSelect
                        value={correoOrigen}
                        options={correosOri.map((c) => ({ value: c.nombre, label: c.nombre }))}
                        onChange={(v) => setCorreoOrigen(v)}
                        placeholder="— Selecciona el correo —"
                        addLabel="➕ Agregar nuevo correo…"
                        onAdd={() => { setNuevoCorreo(''); setAddCorMode('origen'); }}
                      />
                    )}
                  </div>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                      Correo que lo recibió <span style={{ color: theme.colors.alert.red }}>*</span>
                    </label>
                    {addCorMode === 'destino' ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input style={{ ...inputStyle, fontSize: '0.82rem' }} type="email" value={nuevoCorreo} autoFocus
                          onChange={(e) => setNuevoCorreo(e.target.value.toLowerCase())}
                          placeholder="cuenta@rppc.qroo.gob.mx" />
                        <button type="button" onClick={() => agregarCorreo('destino')} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>Agregar</button>
                        <button type="button" onClick={() => { setAddCorMode(null); setNuevoCorreo(''); }} style={btnSecondary}>✕</button>
                      </div>
                    ) : (
                      <SearchableSelect
                        value={correoDestino}
                        options={correosDes.map((c) => ({ value: c.nombre, label: c.nombre }))}
                        onChange={(v) => setCorreoDestino(v)}
                        placeholder="— Selecciona el correo —"
                        addLabel="➕ Agregar nuevo correo…"
                        onAdd={() => { setNuevoCorreo(''); setAddCorMode('destino'); }}
                      />
                    )}
                  </div>
                </div>
              )}
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
