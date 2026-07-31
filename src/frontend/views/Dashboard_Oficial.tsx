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
import { getOficios, createOficio, getUsuarios, analizarPdf,
         getDependencias, crearDependencia, getRemitentes, crearRemitente,
         getUnidadesInternas, crearUnidadInterna, completarSiqroo } from '../api';
import type { CatalogoItem } from '../api';
import { textoCompresion } from '../utils/compresion';
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

/** Documentos categorizados que se pueden adjuntar al ingreso de oficio */
const DOCUMENTOS_OFICIO = [
  { key: 'oficio',         label: 'Oficio'                },
  { key: 'anexos',         label: 'Anexos'                },
  { key: 'identificacion', label: 'Identificación oficial'},
  { key: 'recibos',        label: 'Recibos de pago'       },
  { key: 'solicitud',      label: 'Solicitud de servicio' },
] as const;

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

  // ── Filtros de búsqueda ───────────────────────────────────
  const [search,     setSearch]     = useState('');
  const [searchDeb,  setSearchDeb]  = useState('');   // buscador con debounce
  const [desde,      setDesde]      = useState('');
  const [hasta,      setHasta]      = useState('');
  const [siqrooPend, setSiqrooPend] = useState(false);
  const [firmaPend,  setFirmaPend]  = useState(false);
  const [termino,    setTermino]    = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearchDeb(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

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
  const [analizando,   setAnalizando]   = useState(false);
  const [confianza,    setConfianza]    = useState<'alta'|'media'|'baja'|null>(null);
  const [textoOcr,     setTextoOcr]     = useState<string>('');
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
      });
      setOficios(res.data); setTotal(res.meta.total);
    } catch (err: any) { setListError(err.message); }
    finally { setLoading(false); }
  }, [page, estatus, searchDeb, desde, hasta, siqrooPend, firmaPend, termino]);
  useEffect(() => { fetchOficios(); }, [fetchOficios]);

  // ── Analizar el "Oficio" con IA (OCR) ─────────────────────
  // Autocompleta descripción y trata de emparejar dependencia + remitente con el
  // catálogo. Si no encuentra coincidencia, propone el texto detectado (editable).
  const handleAnalizarPdf = async (file: File) => {
    setPdfFile(file);
    setAnalizando(true);
    setCreateError(null);
    try {
      const d: any = (await analizarPdf(file)).data;
      if (d.descripcion)            setDescripcion(d.descripcion);
      if (d.tiene_termino)          setTieneTermino(d.tiene_termino);
      if (d.fecha_vencimiento)      setFechaVence(d.fecha_vencimiento);
      if (d.numero_oficio_origen)   setNumOficioOrigen(String(d.numero_oficio_origen).toUpperCase());
      if (d.fecha_oficio)           setFechaOficio(d.fecha_oficio);
      setTextoOcr(d.texto_completo ?? '');
      setConfianza(d.confianza);
      await autocompletarCatalogo(d);
      autoseleccionarDirigidoA(d.dirigido_a);
    } catch (err: any) {
      setConfianza('baja');
    } finally {
      setAnalizando(false);
    }
  };

  // Empareja el texto del OCR con los catálogos: dependencia → sub-unidad → remitente.
  // Si no encuentra coincidencia, propone el texto detectado para que el oficial lo
  // agregue/corrija. Todo queda editable.
  const autocompletarCatalogo = async (d: any) => {
    const norm = (s: string) => (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const contiene = (a: string, b: string) =>
      a === b || (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a)));

    // Dependencia
    const dep = (d.dependencia_origen ?? '').trim();
    let depId: number | '' = '';
    if (dep) {
      const nd = norm(dep);
      const m = dependencias.find((x) => norm(x.nombre) === nd) ?? dependencias.find((x) => contiene(norm(x.nombre), nd));
      if (m) { seleccionarDependencia(m.id); depId = m.id; }
      else { setAddDepMode(true); setNuevaDepNombre(dep.toUpperCase()); }
    }

    // Sub-unidad (dentro de la dependencia encontrada)
    const sub = (d.sub_unidad ?? '').trim();
    if (depId && sub) {
      try {
        const subs = (await getUnidadesInternas(Number(depId))).data;
        setUnidadesList(subs);
        const ns = norm(sub);
        const sm = subs.find((u) => norm(u.nombre) === ns) ?? subs.find((u) => contiene(norm(u.nombre), ns));
        if (sm) { setUniSel(sm.id); setUnidadInterna(sm.nombre); }
      } catch { /* noop */ }
    }

    // Remitente (catálogo global)
    const rem = (d.remitente ?? '').trim();
    if (rem) {
      const nr = norm(rem);
      const m = remitentesList.find((r) => norm(r.nombre) === nr) ?? remitentesList.find((r) => contiene(norm(r.nombre), nr));
      if (m) seleccionarRemitente(m.id);
      else { setAddRemMode(true); setNuevoRemNombre(rem.toUpperCase()); }
    }
  };

  // "Dirigido a": empareja el nombre detectado con la lista de usuarios internos.
  // Si coincide, lo autoselecciona; si no, lo deja para elección manual (debe ser
  // una persona real del sistema, por eso no admite texto libre).
  const autoseleccionarDirigidoA = (detectado?: string) => {
    const det = (detectado ?? '').trim();
    if (!det) return;
    // Acento/mayúscula-insensible (igual que el emparejamiento de catálogos).
    const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const nd = norm(det);
    // Usuarios cuyo nombre completo aparece dentro del bloque detectado (antes de "PRESENTE").
    const candidatos = destinatarios.filter((u) => {
      const nu = norm(u.nombre);
      return nu.length >= 6 && (nd === nu || nd.includes(nu) || nu.includes(nd));
    });
    // Gana el nombre más largo (más específico).
    const match = candidatos.sort((a, b) => b.nombre.length - a.nombre.length)[0];
    if (match) setDirigidoA(String(match.id));
  };

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
    try {
      const { data } = await crearDependencia(nombre);
      setDependencias((prev) =>
        [...prev.filter((d) => d.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      seleccionarDependencia(data.id, data.nombre);
      setAddDepMode(false); setNuevaDepNombre('');
    } catch (err: any) { setCreateError(err.message); }
  };
  const agregarUnidad = async () => {
    const nombre = nuevaUniNombre.trim();
    if (!nombre || !depSel) return;
    try {
      const { data } = await crearUnidadInterna(Number(depSel), nombre);
      setUnidadesList((prev) =>
        [...prev.filter((u) => u.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      seleccionarUnidad(data.id, data.nombre);
      setAddUniMode(false); setNuevaUniNombre('');
    } catch (err: any) { setCreateError(err.message); }
  };
  const agregarRemitente = async () => {
    const nombre = nuevoRemNombre.trim();
    if (!nombre) return;
    try {
      const { data } = await crearRemitente(nombre);
      setRemitentesList((prev) =>
        [...prev.filter((r) => r.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      seleccionarRemitente(data.id, data.nombre);
      setAddRemMode(false); setNuevoRemNombre('');
    } catch (err: any) { setCreateError(err.message); }
  };

  // ── Guardar oficio ────────────────────────────────────────
  const resetForm = () => {
    setPaso(1); setConfianza(null); setTextoOcr('');
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
    // Durante las pruebas ningún campo es obligatorio. Única validación de
    // consistencia: si marcó "tiene término", pedimos la fecha.
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

          {/* Filtros */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', paddingBottom: '14px' }}>
            {/* Buscador de texto */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Buscar folio, remitente, dependencia…"
              style={{ ...inputStyle, flex: '1 1 240px', minWidth: '180px' }}
              aria-label="Buscar"
            />

            {/* Estatus */}
            <select value={estatus} onChange={(e) => { setEstatus(e.target.value); setPage(1); }} style={selectStyle} aria-label="Filtrar por estatus">
              {ESTATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Término / vencimiento */}
            <select value={termino} onChange={(e) => { setTermino(e.target.value); setPage(1); }} style={selectStyle} aria-label="Filtrar por término">
              <option value="">Término: todos</option>
              <option value="con_termino">Con término</option>
              <option value="por_vencer">Por vencer (3 días)</option>
              <option value="vencidos">Vencidos</option>
            </select>

            {/* Rango de fechas */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
              Desde
              <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} style={{ ...inputStyle, padding: '6px 8px' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
              Hasta
              <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} style={{ ...inputStyle, padding: '6px 8px' }} />
            </label>

            {/* SIQROO pendiente */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
              <input type="checkbox" checked={siqrooPend} onChange={(e) => { setSiqrooPend(e.target.checked); setPage(1); }} />
              🚩 SIQROO pendiente
            </label>

            {/* Pendiente de firma (aprobados sin firmado subido) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
              <input type="checkbox" checked={firmaPend} onChange={(e) => { setFirmaPend(e.target.checked); setPage(1); }} />
              🖊️ Pendiente de firma
            </label>

            {/* Limpiar */}
            {(search || estatus || desde || hasta || siqrooPend || firmaPend || termino) && (
              <button
                type="button"
                onClick={() => { setSearch(''); setSearchDeb(''); setEstatus(''); setDesde(''); setHasta(''); setSiqrooPend(false); setFirmaPend(false); setTermino(''); setPage(1); }}
                style={{ ...btnSecondary, padding: '7px 12px', fontSize: '0.78rem' }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {listError && <div role="alert" style={{ ...alertStyle, margin: '12px 24px' }}>{listError}</div>}

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={tableHeaderStyle}>
                {['Folio', 'Remitente', 'Dependencia', 'Fecha Ingreso', 'Término', 'Estatus', 'SIQROO', 'En bandeja de'].map((h) => (
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
                    <td style={tdStyle}>
                      {!o.siqroo_aplica ? (
                        <span style={{ color: theme.colors.textSecondary, fontSize: '0.75rem' }}>—</span>
                      ) : siqrooPendiente(o) ? (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>🚩 Pendiente</span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>✓ Completo</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem', color: o.en_bandeja_de ? theme.colors.textPrimary : theme.colors.textSecondary }}>
                      {o.en_bandeja_de ? `👤 ${o.en_bandeja_de}` : '—'}
                    </td>
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

            <OficioDetalle
              oficio={selected}
              acciones={
                <>
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
      >
          <form onSubmit={handleCreate} noValidate>
            {/* Instrucción */}
            <div style={{ padding: '12px 14px', backgroundColor: '#FDE8EF', borderLeft: `3px solid ${theme.colors.primary}`, borderRadius: '8px', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: theme.colors.primaryDark }}>
                🤖 Ingreso de oficio
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                Adjunta los documentos requisito. Al subir el <strong>Oficio</strong>, la IA extrae la descripción y sugiere la dependencia y el remitente del catálogo.
              </p>
            </div>

            {/* Documentos requisito — arriba, como casillas con palomita de agregado */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: theme.colors.charcoal, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Documentos requisito <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: theme.colors.textSecondary }}>(opcionales)</span>
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
                        {label}
                        {key === 'oficio' && <span style={{ color: theme.colors.primary, fontSize: '0.66rem', fontWeight: 700 }}> · IA 🤖</span>}
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
                        accept={key === 'oficio' ? '.pdf' : '.pdf,.doc,.docx,.jpg,.jpeg,.png'}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setDocFiles((prev) => ({ ...prev, [key]: f }));
                          if (key === 'oficio' && f) handleAnalizarPdf(f);   // dispara OCR
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                El <strong>Oficio</strong> se analiza con IA (solo PDF). Identificación y recibos también aceptan imágenes.
              </p>
            </div>

            {/* El documento "Oficio" (uno de los 5) es el que dispara el OCR — ver más abajo */}
            {analizando && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', color: '#0369A1' }}>
                <span>🤖</span> Analizando el documento con IA…
              </div>
            )}

            {/* Aviso de extracción (solo tras analizar el PDF) */}
            {confianza && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                backgroundColor: confianza === 'alta' ? '#D1FAE5' : confianza === 'media' ? '#FEF3C7' : '#FFF7ED',
                borderLeft: `3px solid ${confianza === 'alta' ? theme.colors.alert.green : confianza === 'media' ? theme.colors.alert.yellow : theme.colors.gold}`,
              }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                  {confianza === 'alta' ? '✅' : confianza === 'media' ? '⚠️' : '📋'}
                </span>
                <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                  {confianza === 'baja'
                    ? 'El PDF parece escaneado. Revisa/completa la descripción manualmente.'
                    : 'La IA extrajo la descripción (marcada con ✨) — verifícala.'}
                </p>
              </div>
            )}

            {/* ── Texto completo extraído por IA (solo si hay texto) ─── */}
            {textoOcr && (
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
            )}

            {/* Folio automático */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', backgroundColor: '#EFF6FF', border: `1px solid #BFDBFE`, borderRadius: '8px', marginBottom: '16px' }}>
              <span>🔢</span>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#1D4ED8' }}>
                <strong>Folio automático</strong> — se asignará al guardar: <strong>OF-{'{oficina}'}-{new Date().getFullYear()}-{'{seq}'}</strong>
              </p>
            </div>

            {/* Dependencia de origen — catálogo independiente */}
            <Field label="Dependencia de Origen" required>
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

            {/* Sub-unidad — cuelga de la dependencia (opcional) */}
            <Field label="Sub-unidad (área/subdirección)">
              {!depSel ? (
                <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
                  Selecciona primero la dependencia.
                </p>
              ) : addUniMode ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...inputStyle, textTransform: 'uppercase' }} value={nuevaUniNombre} onChange={(e) => setNuevaUniNombre(e.target.value.toUpperCase())} placeholder="NOMBRE DE LA SUB-UNIDAD" autoFocus />
                  <button type="button" onClick={agregarUnidad} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>Agregar</button>
                  <button type="button" onClick={() => { setAddUniMode(false); setNuevaUniNombre(''); }} style={btnSecondary}>✕</button>
                </div>
              ) : (
                <SearchableSelect
                  value={uniSel === '' ? '' : String(uniSel)}
                  options={unidadesList.map((u) => ({ value: String(u.id), label: u.nombre }))}
                  onChange={(v) => seleccionarUnidad(v ? Number(v) : '')}
                  placeholder="— Selecciona la sub-unidad —"
                  addLabel="➕ Agregar nueva sub-unidad…"
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
            <Field label="Número de oficio de la dependencia">
              <input
                style={{ ...inputStyle, textTransform: 'uppercase' }}
                value={numOficioOrigen}
                onChange={(e) => setNumOficioOrigen(e.target.value.toUpperCase())}
                placeholder="EJ. SEGOB/DGV/123/2026 — EL NÚMERO QUE TRAE EL OFICIO DE ORIGEN"
              />
            </Field>
            <Field label="Fecha del oficio">
              <input
                style={inputStyle}
                type="date"
                value={fechaOficio}
                onChange={(e) => setFechaOficio(e.target.value)}
              />
            </Field>
            <Field label="Dirigido a" required>
              <SearchableSelect
                value={dirigidoA}
                options={destinatarios.map((u) => ({ value: String(u.id), label: `${u.nombre}${u.cargo ? ` — ${u.cargo}` : ''}`.toUpperCase() }))}
                onChange={(v) => setDirigidoA(v)}
                placeholder="— Selecciona el destinatario —"
              />
            </Field>
            <Field label={`Asunto ${descripcion ? '✨' : ''}`} required>
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

            {/* SIQROO */}
            <div style={{ marginBottom: '16px', padding: '12px 14px', backgroundColor: theme.colors.background, border: `1px solid ${theme.colors.border}`, borderRadius: '8px' }}>
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
                <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                    Si aún no tienes estos datos, registra el oficio y complétalos después desde el detalle. Quedará marcado como pendiente.
                  </p>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>Número de control interno</label>
                    <input style={inputStyle} value={siqrooControl} onChange={(e) => setSiqrooControl(e.target.value)} placeholder="Opcional — se puede completar después" />
                  </div>
                </div>
              )}
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
