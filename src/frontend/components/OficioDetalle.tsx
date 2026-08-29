/**
 * Componente compartido: detalle de un oficio en formato de secciones.
 * Inspirado en la ficha del sistema registral: bloques claros en lugar de pestañas.
 *
 *   · Datos generales
 *   · Documentos requisitos (tabla con el catálogo completo entregado/faltante + Ver/Descargar)
 *   · Vista previa del documento seleccionado
 *   · Identidad de la solicitud (control interno SIQROO, ingreso, estatus, delegación)
 *   · Usuarios del oficio (ingresado, asignado, visto bueno, en bandeja)
 *
 * Se usa en las vistas de Oficial, Gestión y Jurídico. Cada vista puede inyectar
 * sus propias acciones (VoBo, subir proyecto, completar SIQROO…) por la prop `acciones`,
 * y contenido extra al final (línea de tiempo) por `children`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Icono } from './Icono';
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
  /** Se atendió una solicitud desde aquí: la vista recarga su lista. */
  onCambio?: () => void;
  /**
   * Las mismas acciones de la columna de la lista, al final del expediente.
   * Van aquí abajo y no arriba: se toman después de haber leído el oficio, los
   * documentos y quién lo tiene, que es lo que la persona necesita para decidir.
   */
  accionesFinales?: React.ReactNode;
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

/**
 * Íconos de línea para Ver / Descargar, del mismo trazo que la campana.
 * En dorado (Pantone 125C): destaca la acción sin repetir el guinda del texto,
 * y sustituye a los emoticones, que cada sistema operativo dibujaba distinto.
 */
const IcoVer = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.colors.gold}
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IcoDescargar = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.colors.gold}
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <polyline points="7 11 12 16 17 11" />
    <path d="M4 20h16" />
  </svg>
);

export const OficioDetalle: React.FC<Props> = ({ oficio, acciones, children, onCambio, accionesFinales }) => {
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

  // Un oficio «de conocimiento» queda FINALIZADO sin haber pasado por el flujo:
  // no tiene proyecto ni documento firmado, así que no se listan.
  // Se pregunta por el archivo y no por el estatus: un oficio turnado vuelve a
  // RECIBIDO y aun así puede traer el borrador que redactó la otra área, que
  // antes quedaba escondido. Al firmar el proyecto se borra y esto pasa a falso
  // solo, sin tener que enumerar estatus.
  const tieneProyecto = !oficio.de_conocimiento && !!oficio.tiene_proyecto;
  const tieneFirmado  = !oficio.de_conocimiento && oficio.estatus === 'FINALIZADO';

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

  // El visor NO se abre solo: solo aparece cuando el usuario da clic en «Ver».

  const verDocEstatico = (d: OficioDocumento, nombre: string) =>
    setPreview({ url: `/files${d.archivo_url}`, title: nombre, esImagen: esImagenUrl(d.archivo_url), mostrarOcr: d.tipo === 'oficio' });

  const verEndpoint = (endpoint: string, nombre: string, ocultarTexto = false) =>
    setPreview({ url: `/api/v1/files/${oficio.id}/${endpoint}`, title: nombre, esImagen: false, ocultarTexto });

  const fmtFecha = (iso: string) => new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  // Fecha "sólo día" (columna DATE) sin desfase por zona horaria: se formatea del texto.
  const fmtSoloFecha = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : s;
  };

  // Resumen de los dos sistemas para el bloque de datos generales.
  const sistemaTexto = (aplica?: boolean, nci?: string | null) =>
    !aplica ? 'No aplica' : nci ? `${nci}` : 'Pendiente por completar';

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

  const linkStyle: React.CSSProperties = {
    color: theme.colors.primary, fontWeight: 600, fontSize: '0.78rem',
    textDecoration: 'none', whiteSpace: 'nowrap',
    // Los íconos van alineados con el texto en lugar de pegados a él.
    display: 'inline-flex', alignItems: 'center', gap: '5px',
  };
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
          <Icono nombre="historial" inline />Ver historial
        </button>
      </div>

      <HistorialModal oficio={oficio} open={historialOpen} onClose={() => setHistorialOpen(false)} />

      {/* ── Datos generales ─────────────────────────── */}
      <Seccion titulo="Datos del oficio">
        <div style={gridCampos}>
          <Campo label="Folio"        value={oficio.folio} />
          <Campo label="Nº de oficio de origen" value={oficio.numero_oficio_origen || '—'} />
          <Campo label="Fecha del oficio" value={oficio.fecha_oficio ? fmtSoloFecha(oficio.fecha_oficio) : '—'} />
          <Campo label="Remitente"    value={oficio.remitente} />
          <Campo label="Dependencia"  value={oficio.dependencia_origen?.toUpperCase()} />
          <Campo label="Unidad interna" value={oficio.unidad_interna || '—'} />
          {/* A quién va dirigido el oficio según el documento. No cambia aunque
              después se turne: el turno mueve el trabajo, no reescribe el acuse. */}
          <Campo label="Dirigido a"   value={(oficio.dirigido_a_original_nombre ?? oficio.dirigido_a_nombre)?.toUpperCase()} />
          <Campo label="Recepción"    value={oficio.via_recepcion === 'CORREO_ELECTRONICO' ? 'Correo electrónico' : 'Ventanilla'} />
          {oficio.via_recepcion === 'CORREO_ELECTRONICO' && (
            <>
              <Campo label="Correo de quien envía" value={oficio.correo_origen  || '—'} />
              <Campo label="Correo que recibió"    value={oficio.correo_destino || '—'} />
            </>
          )}
          <Campo label="Estatus"      value={<StatusBadge estatus={oficio.estatus as EstatusOficio} turnado={!!oficio.turnos_recibidos} devuelto={!!oficio.llego_por_devolucion} deConocimiento={!!oficio.de_conocimiento} enPaseFirma={!!oficio.en_pase_firma} />} />
          <Campo label="Término"      value={<TerminoTimer tiene_termino={oficio.tiene_termino} fecha_vencimiento={oficio.fecha_vencimiento} termino_tipo={oficio.termino_tipo} vence_en={oficio.vence_en} horas_restantes={oficio.horas_restantes} />} />
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
                        ? <Icono nombre="check" size={15} color={theme.colors.alert.green} />
                        : <span style={{ color: theme.colors.textSecondary }}>—</span>}
                    </td>
                    <td style={tdStyle}>{nombre}</td>
                    <td style={{ ...tdStyle, color: theme.colors.textSecondary }}>
                      {d?.nombre_original ?? <em style={{ fontSize: '0.78rem' }}>Sin entregar</em>}
                    </td>
                    <td style={tdStyle}>
                      {entregado && (
                        <span style={{ display: 'flex', gap: '12px' }}>
                          <button onClick={() => verDocEstatico(d, nombre)} style={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{IcoVer} Ver</button>
                          <a href={`/files${d.archivo_url}`} download={d.nombre_original ?? undefined} style={linkStyle}>{IcoDescargar} Descargar</a>
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
                    <td style={{ ...tdStyle, color: theme.colors.alert.green, fontWeight: 700 }}><Icono nombre="check" inline />Disponible</td>
                    <td style={tdStyle}>
                      <button onClick={f.onVer} style={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{IcoVer} Ver</button>
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
          // En escritorio el panel se separa del borde para leerse como una
          // tarjeta flotante; en móvil va a sangre, donde el margen solo restaría
          // espacio de lectura.
          //
          // El 70 = 58 px del encabezado de la aplicación + los 12 de margen que
          // usa el panel del expediente. Sin ese desplazamiento el visor se monta
          // sobre la barra superior y tapa el logo, y además arranca más arriba
          // que el expediente, así que los dos paneles se ven desalineados.
          top:             isMobile ? 0 : 70,
          bottom:          isMobile ? 0 : 12,
          left:            isMobile ? 0 : 12,
          // El visor toma todo el espacio libre hasta el panel del expediente en
          // vez de un ancho fijo: leer un oficio escaneado en una franja angosta
          // obligaba a ampliar cada vez. El cálculo es el ancho del expediente
          // —min(45vw, 760px), su propio tope— más sus 12 px de margen derecho y
          // otros 12 de canal entre las dos ventanas.
          right:           isMobile ? 0 : 'calc(min(45vw, 760px) + 24px)',
          width:           isMobile ? '100%' : 'auto',
          zIndex:          1100,
          backgroundColor: theme.colors.surface,
          borderRadius:    isMobile ? 0 : '12px',
          overflow:        'hidden',
          boxShadow:       '0 2px 8px rgba(61,57,53,0.10), 0 16px 44px rgba(61,57,53,0.24)',
          display:         'flex',
          flexDirection:   'column',
        }}>
          {/* Encabezado del visor — Pantone 125C */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 18px',
            background: `linear-gradient(135deg, ${theme.colors.goldLight} 0%, ${theme.colors.gold} 100%)`,
            color: '#fff',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize:      '0.9rem',
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              whiteSpace:    'nowrap',
            }}>
              {preview.title}
            </span>
            <button
              onClick={() => setPreview(null)}
              aria-label="Cerrar visor"
              style={{
                background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff',
                fontSize: '1.05rem', cursor: 'pointer', lineHeight: 1, flexShrink: 0,
                width: '24px', height: '24px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.32)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
            >
              ×
            </button>
          </div>

          {/* Contenido — columna: el documento arriba con alto fijo, y la
              transcripción abajo tomando lo que sobre. Así ninguna de las dos
              empuja a la otra fuera del panel y no hace falta desplazar el
              conjunto: cada una se desplaza por dentro. */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', backgroundColor: '#F0F0EC' }}>
            {preview.esImagen ? (
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <img src={preview.url} alt={preview.title} style={{ maxWidth: '100%', borderRadius: '8px', border: `1.5px solid ${theme.colors.border}` }} />
              </div>
            ) : (
              <div style={{ flexShrink: 0 }}>
                <PDFPreviewer
                  url={preview.url}
                  title={preview.title}
                  height={
                    // El panel arranca 70 px abajo y termina 12 antes del borde
                    // (82), más su encabezado (42) y el relleno del contenido (24).
                    // Con transcripción, el documento se queda con el 55 % del alto
                    // y le cede el resto; sin ella, ocupa todo.
                    preview.mostrarOcr && (oficio as any).texto_ocr
                      ? Math.round((vh - 148) * 0.55)
                      : vh - 148
                  }
                  hideExtractedText={preview.ocultarTexto}
                />
              </div>
            )}

            {/* Información extraída por OCR (solo al abrir el documento "Oficio") */}
            {preview.mostrarOcr && (oficio as any).texto_ocr && (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: `1.5px solid ${theme.colors.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', backgroundColor: theme.colors.charcoal, color: '#fff',
                }}>
                  <span style={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    Transcripción automática del documento
                  </span>
                  {(oficio as any).ocr_metodo && (
                    <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                      {String((oficio as any).ocr_metodo).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minHeight: 0, padding: '14px 16px', backgroundColor: '#FAFAF8', overflowY: 'auto', fontSize: '0.82rem', lineHeight: 1.8, color: theme.colors.textPrimary, whiteSpace: 'pre-wrap', fontFamily: 'monospace', userSelect: 'text' }}>
                  {(oficio as any).texto_ocr}
                </div>
                <div style={{ flexShrink: 0, padding: '7px 14px', backgroundColor: '#F0F0EC', borderTop: `1px solid ${theme.colors.border}`, fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                  Lectura automática del escaneo: puede contener errores de reconocimiento
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
          <Campo label="Estatus de la solicitud"   value={<StatusBadge estatus={oficio.estatus as EstatusOficio} turnado={!!oficio.turnos_recibidos} devuelto={!!oficio.llego_por_devolucion} deConocimiento={!!oficio.de_conocimiento} enPaseFirma={!!oficio.en_pase_firma} />} />
          <Campo label="Delegación de gestión"     value={oficio.delegacion_nombre} />
          <Campo label="SIQROO" value={sistemaTexto(oficio.siqroo_aplica, oficio.siqroo_control_interno)} />
          <Campo label="SIGER"  value={oficio.siger_aplica ? 'Ingresada' : 'No aplica'} />
          <Campo label="Incorporar FRE" value={oficio.fre_incorporado ? 'Incorporado' : 'No aplica'} />
          {oficio.de_conocimiento && (
            <Campo label="Cierre" value={
              <span style={{ fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#E0F2FE', color: '#075985', padding: '2px 9px', borderRadius: '10px' }}>
                De conocimiento
              </span>
            } />
          )}
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
              ? `Cargado${oficio.fecha_firmado ? ` — ${fmtFecha(oficio.fecha_firmado)}` : ''}`
              : oficio.de_conocimiento ? 'No aplica' : 'Pendiente'}
          />
          <Campo label="En bandeja de"  value={oficio.en_bandeja_de} />
        </div>
      </Seccion>

      {/* Trae sus propios encabezados —marcas, estado y acciones—, así que va sin
          envolver: una sección dentro de otra duplicaría el título. */}
      {accionesFinales && <div style={{ marginTop: '22px' }}>{accionesFinales}</div>}

      {/* ── Contenido extra (línea de tiempo) ───────── */}
      {children}
    </div>
  );
};
