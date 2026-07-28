/**
 * Componente compartido: detalle de un oficio en formato de secciones.
 * Inspirado en la ficha del sistema registral: bloques claros en lugar de pestañas.
 *
 *   · Datos generales
 *   · Documentos requisitos (tabla con el catálogo completo ✓/faltante + Ver/Descargar)
 *   · Vista previa del documento seleccionado
 *   · Identidad de la solicitud (control interno SIQROO, ingreso, estatus, delegación)
 *   · Usuarios del oficio (ingresado, asignado, visto bueno, en bandeja)
 *
 * Se usa en las vistas de Oficial, Gestión y Jurídico. Cada vista puede inyectar
 * sus propias acciones (VoBo, subir proyecto, completar SIQROO…) por la prop `acciones`,
 * y contenido extra al final (línea de tiempo) por `children`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { StatusBadge } from './StatusBadge';
import { TerminoTimer } from './TerminoTimer';
import { PDFPreviewer } from './PDFPreviewer';
import { HistorialModal } from './HistorialModal';
import { getOficioDocumentos } from '../api';
import type { OficioDocumento } from '../api';
import type { Oficio, EstatusOficio } from '../types';

// Catálogo fijo de documentos que se pueden recepcionar (orden de la ficha).
const CATALOGO_DOCS: { tipo: string; nombre: string }[] = [
  { tipo: 'oficio',         nombre: 'Oficio'                        },
  { tipo: 'anexos',         nombre: 'Anexos'                        },
  { tipo: 'identificacion', nombre: 'Identificación oficial'        },
  { tipo: 'recibos',        nombre: 'Recibos de pago de derechos'   },
  { tipo: 'solicitud',      nombre: 'Solicitud de servicio'         },
];

const esImagenUrl = (url: string) => /\.(jpe?g|png|gif|webp)$/i.test(url);

interface PreviewSel {
  url:       string;
  title:     string;
  esImagen:  boolean;
  /** Si es Word, ocultar el volcado de texto y ofrecer solo la descarga (p.ej. el proyecto). */
  ocultarTexto?: boolean;
  /** Mostrar el texto extraído por OCR (solo para el documento "Oficio" ingresado). */
  mostrarOcr?: boolean;
}

interface Props {
  oficio:    Oficio;
  /** Acciones específicas de la vista (VoBo, subir proyecto, completar SIQROO…). */
  acciones?: React.ReactNode;
  /** Contenido extra al final (p.ej. línea de tiempo). */
  children?: React.ReactNode;
}

// ── Sub-componentes de presentación ─────────────────────────────
const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section style={{ marginTop: '22px' }}>
    <h3 style={{
      margin:        '0 0 10px',
      fontSize:      '0.78rem',
      fontWeight:    700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      color:         theme.colors.primary,
      borderBottom:  `2px solid ${theme.colors.border}`,
      paddingBottom: '6px',
      fontFamily:    theme.font.family,
    }}>
      {titulo}
    </h3>
    {children}
  </section>
);

const Campo: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
    <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: theme.colors.textSecondary }}>
      {label}
    </span>
    <span style={{ fontSize: '0.86rem', color: theme.colors.textPrimary, wordBreak: 'break-word' as const }}>
      {value || <span style={{ color: theme.colors.textSecondary }}>—</span>}
    </span>
  </div>
);

const gridCampos: React.CSSProperties = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap:                 '14px 20px',
};

export const OficioDetalle: React.FC<Props> = ({ oficio, acciones, children }) => {
  const isMobile = useIsMobile();
  const [documentos, setDocumentos] = useState<OficioDocumento[]>([]);
  const [preview,    setPreview]    = useState<PreviewSel | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);

  // Mantener la altura del visor acorde al viewport
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Cerrar el visor con Escape
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview]);

  const tieneProyecto = ['EN_REVISION', 'VOBO_APROBADO', 'FINALIZADO'].includes(oficio.estatus);
  const tieneFirmado  = oficio.estatus === 'FINALIZADO';

  useEffect(() => {
    setPreview(null);
    getOficioDocumentos(oficio.id)
      .then((r) => setDocumentos(r.data))
      .catch(() => setDocumentos([]));
  }, [oficio.id]);

  const docPorTipo = useMemo(() => {
    const m: Record<string, OficioDocumento> = {};
    documentos.forEach((d) => { if (!m[d.tipo]) m[d.tipo] = d; });
    return m;
  }, [documentos]);

  // El visor NO se abre solo: solo aparece cuando el usuario da clic en 👁️ Ver.

  const verDocEstatico = (d: OficioDocumento, nombre: string) =>
    setPreview({ url: `/files${d.archivo_url}`, title: nombre, esImagen: esImagenUrl(d.archivo_url), mostrarOcr: d.tipo === 'oficio' });

  const verEndpoint = (endpoint: string, nombre: string, ocultarTexto = false) =>
    setPreview({ url: `/api/v1/files/${oficio.id}/${endpoint}`, title: nombre, esImagen: false, ocultarTexto });

  const fmtFecha = (iso: string) => new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const siqrooTexto =
    oficio.siqroo_aplica === false ? 'No aplica'
      : oficio.siqroo_control_interno ? `✓ Completo`
      : oficio.siqroo_aplica ? '🚩 Pendiente por completar'
      : '—';

  // Filas extra (proyecto / firmado) que no viven en oficio_documentos.
  const filasExtra: { entregado: boolean; nombre: string; archivo: string | null; onVer?: () => void }[] = [];
  if (tieneProyecto) filasExtra.push({
    entregado: true, nombre: 'Proyecto de contestación (PDF o Word)', archivo: 'proyecto',
    onVer: () => verEndpoint('proyecto', 'Proyecto de contestación', true),
  });
  if (tieneFirmado) filasExtra.push({
    entregado: true, nombre: 'Documento firmado', archivo: 'firmado',
    onVer: () => verEndpoint('firmado', 'Contestación firmada'),
  });

  const linkStyle: React.CSSProperties = { color: theme.colors.primary, fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none', whiteSpace: 'nowrap' };
  const tdStyle:   React.CSSProperties = { padding: '8px 10px', borderBottom: `1px solid ${theme.colors.border}`, fontSize: '0.82rem', verticalAlign: 'middle' };
  const thStyle:   React.CSSProperties = { padding: '8px 10px', textAlign: 'left' as const, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: theme.colors.textSecondary, borderBottom: `2px solid ${theme.colors.border}` };

  return (
    <div>
      {/* ── Barra de acciones ───────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
        <button
          type="button"
          onClick={() => setHistorialOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '0.8rem', fontWeight: 600,
            color: theme.colors.primary, backgroundColor: '#fff',
            border: `1px solid ${theme.colors.primary}`, borderRadius: '7px',
            cursor: 'pointer', fontFamily: theme.font.family,
          }}
        >
          🕑 Ver historial
        </button>
      </div>

      <HistorialModal oficio={oficio} open={historialOpen} onClose={() => setHistorialOpen(false)} />

      {/* ── Datos generales ─────────────────────────── */}
      <Seccion titulo="Datos del oficio">
        <div style={gridCampos}>
          <Campo label="Folio"        value={oficio.folio} />
          <Campo label="Nº de oficio de origen" value={oficio.numero_oficio_origen || '—'} />
          <Campo label="Remitente"    value={oficio.remitente} />
          <Campo label="Dependencia"  value={oficio.dependencia_origen?.toUpperCase()} />
          <Campo label="Unidad interna" value={oficio.unidad_interna || '—'} />
          <Campo label="Dirigido a"   value={oficio.dirigido_a_nombre?.toUpperCase()} />
          <Campo label="Estatus"      value={<StatusBadge estatus={oficio.estatus as EstatusOficio} />} />
          <Campo label="Término"      value={<TerminoTimer tiene_termino={oficio.tiene_termino} fecha_vencimiento={oficio.fecha_vencimiento} />} />
        </div>
      </Seccion>

      {/* ── Asunto ──────────────────────────────────── */}
      {oficio.descripcion_solicitud && (
        <Seccion titulo="Asunto">
          <p style={{ margin: 0, fontSize: '0.86rem', color: theme.colors.textPrimary, lineHeight: 1.55 }}>
            {oficio.descripcion_solicitud}
          </p>
        </Seccion>
      )}

      {/* ── Documentos requisitos (los que se recepcionan) ── */}
      <Seccion titulo="Documentos requisitos">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '90px' }}>Entregado</th>
                <th style={thStyle}>Nombre del documento</th>
                <th style={thStyle}>Archivo</th>
                <th style={{ ...thStyle, width: '150px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {CATALOGO_DOCS.map(({ tipo, nombre }) => {
                const d = docPorTipo[tipo];
                const entregado = !!d;
                return (
                  <tr key={tipo} style={{ opacity: entregado ? 1 : 0.55 }}>
                    <td style={{ ...tdStyle, textAlign: 'center' as const, fontWeight: 700 }}>
                      {entregado
                        ? <span style={{ color: theme.colors.alert.green }}>✓</span>
                        : <span style={{ color: theme.colors.textSecondary }}>—</span>}
                    </td>
                    <td style={tdStyle}>{nombre}</td>
                    <td style={{ ...tdStyle, color: theme.colors.textSecondary }}>
                      {d?.nombre_original ?? <em style={{ fontSize: '0.78rem' }}>Sin entregar</em>}
                    </td>
                    <td style={tdStyle}>
                      {entregado && (
                        <span style={{ display: 'flex', gap: '12px' }}>
                          <button onClick={() => verDocEstatico(d, nombre)} style={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>👁️ Ver</button>
                          <a href={`/files${d.archivo_url}`} download={d.nombre_original ?? undefined} style={linkStyle}>⬇️ Descargar</a>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Seccion>

      {/* ── Documentos del flujo (generados: proyecto y firmado) ── */}
      {filasExtra.length > 0 && (
        <Seccion titulo="Documentos del flujo">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Documento</th>
                  <th style={{ ...thStyle, width: '120px' }}>Estado</th>
                  <th style={{ ...thStyle, width: '120px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filasExtra.map((f) => (
                  <tr key={f.archivo}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{f.nombre}</td>
                    <td style={{ ...tdStyle, color: theme.colors.alert.green, fontWeight: 700 }}>✓ Disponible</td>
                    <td style={tdStyle}>
                      <button onClick={f.onVer} style={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>👁️ Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      {/* ── Visor del documento (panel del lado opuesto / pantalla completa en móvil) ── */}
      {preview && (
        <div style={{
          position:        'fixed',
          top:             0,
          bottom:          0,
          left:            0,
          width:           isMobile ? '100%' : '46vw',
          maxWidth:        isMobile ? '100%' : '760px',
          zIndex:          1100,
          backgroundColor: theme.colors.surface,
          boxShadow:       '4px 0 28px rgba(0,0,0,0.22)',
          display:         'flex',
          flexDirection:   'column',
        }}>
          {/* Encabezado del visor */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', backgroundColor: theme.colors.primary, color: '#fff',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              👁️ {preview.title}
            </span>
            <button
              onClick={() => setPreview(null)}
              aria-label="Cerrar visor"
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
            >
              ×
            </button>
          </div>

          {/* Contenido */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px', backgroundColor: '#F0F0EC' }}>
            {preview.esImagen ? (
              <img src={preview.url} alt={preview.title} style={{ maxWidth: '100%', borderRadius: '8px', border: `1.5px solid ${theme.colors.border}` }} />
            ) : (
              <PDFPreviewer url={preview.url} title={preview.title} height={preview.mostrarOcr ? Math.round(vh * 0.5) : vh - 120} hideExtractedText={preview.ocultarTexto} />
            )}

            {/* Información extraída por OCR (solo al abrir el documento "Oficio") */}
            {preview.mostrarOcr && (oficio as any).texto_ocr && (
              <div style={{ marginTop: '12px', border: `1.5px solid ${theme.colors.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: theme.colors.charcoal, color: '#fff' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    🤖 Información extraída del oficio
                  </span>
                  {(oficio as any).ocr_metodo && (
                    <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                      {String((oficio as any).ocr_metodo).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ padding: '14px 16px', backgroundColor: '#FAFAF8', maxHeight: '260px', overflowY: 'auto', fontSize: '0.82rem', lineHeight: 1.8, color: theme.colors.textPrimary, whiteSpace: 'pre-wrap', fontFamily: 'monospace', userSelect: 'text' }}>
                  {(oficio as any).texto_ocr}
                </div>
                <div style={{ padding: '7px 14px', backgroundColor: '#F0F0EC', borderTop: `1px solid ${theme.colors.border}`, fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                  💡 Texto reconocido automáticamente del documento escaneado
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Acciones específicas de la vista ─────────── */}
      {acciones && <div style={{ marginTop: '18px' }}>{acciones}</div>}

      {/* ── Identidad de la solicitud ───────────────── */}
      <Seccion titulo="Detalle de la solicitud">
        <div style={gridCampos}>
          <Campo label="Fecha y hora de ingreso"   value={fmtFecha(oficio.fecha_registro)} />
          <Campo label="Estatus de la solicitud"   value={<StatusBadge estatus={oficio.estatus as EstatusOficio} />} />
          <Campo label="Delegación de gestión"     value={oficio.delegacion_nombre} />
          <Campo label="SIQROO"                     value={siqrooTexto} />
        </div>
      </Seccion>

      {/* ── Usuarios del oficio ─────────────────────── */}
      <Seccion titulo="Usuarios del oficio">
        <div style={gridCampos}>
          <Campo label="Ingresado por"  value={oficio.ingresado_por_nombre} />
          <Campo label="Encargado"      value={oficio.encargado_nombre} />
          <Campo label="Visto bueno por" value={oficio.vobo_por_nombre} />
          <Campo
            label="Documento firmado"
            value={tieneFirmado
              ? `✓ Cargado${oficio.fecha_firmado ? ` — ${fmtFecha(oficio.fecha_firmado)}` : ''}`
              : 'Pendiente'}
          />
          <Campo label="En bandeja de"  value={oficio.en_bandeja_de} />
        </div>
      </Seccion>

      {/* ── Contenido extra (línea de tiempo) ───────── */}
      {children}
    </div>
  );
};
