/**
 * Component: VisorModal
 * File: src/frontend/components/visor/VisorModal.tsx
 *
 * Port fiel de visor.component.html/scss (SID): overlay + modal 95%×90vh,
 * header con nombre/badge N-de-total y navegación anterior/siguiente,
 * cuerpo con listado lateral numerado (340px) + área de documento. El
 * documento se sirve como PDF real (no una imagen rasterizada) y se
 * muestra con `VisorPdfViewer` — un visor de PDF.js con toolbar propio
 * (zoom, ajustar ancho, rotar, descargar solo si el rol lo permite),
 * igual que `ngx-extended-pdf-viewer` le daba a SID. Un `<iframe>` al
 * visor nativo del navegador no sirve para esto: es una superficie opaca,
 * sin panel de miniaturas ocultable ni botones condicionables por rol.
 *
 * Lo nuevo de VISAR (curaduría, transcripción, versión) vive en un cajón
 * lateral adicional ("Detalles"), aditivo sobre el layout de SID — no lo
 * reemplaza.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getFoja, getImagenFojaBlob } from '../../services/visorApi';
import { SelectorVersion } from './SelectorVersion';
import { PanelCuraduria } from './PanelCuraduria';
import { PanelTranscripcion } from './PanelTranscripcion';
import { VisorPdfViewer } from './VisorPdfViewer';
import * as s from './estilosSid';
import type { VersionDigitalizacion, VisorFojaDetalle } from '../../types';

export interface VisorModalItem {
  key:     number;
  fojaId:  number;
  titulo:  string;
  detalle?: string;
}

interface Props {
  abierto:      boolean;
  onCerrar:     () => void;
  items:        VisorModalItem[];
  indiceActual: number;
  onCambiarIndice: (i: number) => void;
  /** Cambia cuando el listado es de otro libro/búsqueda: limpia el cache de blobs. */
  cacheKey: string | number | null;
}

type TabDetalle = 'curaduria' | 'transcripcion';

function puedeCurarCliente(rol?: string): boolean {
  return rol === 'SUPERADMIN' || rol === 'DIRECTOR' || rol === 'JURIDICO' || rol === 'ENCARGADO';
}

export const VisorModal: React.FC<Props> = ({ abierto, onCerrar, items, indiceActual, onCambiarIndice, cacheKey }) => {
  const { user } = useAuth();
  const item = items[indiceActual] ?? null;

  const [fojaDetalle, setFojaDetalle] = useState<VisorFojaDetalle | null>(null);
  const [version, setVersion] = useState<VersionDigitalizacion | undefined>(undefined);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [tabDrawer, setTabDrawer] = useState<TabDetalle>('curaduria');

  const cacheRef = useRef<Map<string, Blob>>(new Map());
  const cacheKeyRef = useRef<string | number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (cacheKeyRef.current !== cacheKey) {
      cacheRef.current.clear();
      cacheKeyRef.current = cacheKey;
    }
  }, [cacheKey]);

  // Carga metadatos (imágenes disponibles) al cambiar de foja.
  useEffect(() => {
    if (!abierto || !item) { setFojaDetalle(null); return; }
    setVersion(undefined);
    getFoja(item.fojaId).then(setFojaDetalle).catch(() => setFojaDetalle(null));
  }, [abierto, item?.fojaId]);

  // Carga el PDF (con cache) al cambiar de foja o versión.
  useEffect(() => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setPdfUrl(null);

    if (!abierto || !item) return;

    setCargando(true);
    setError(null);
    let cancelado = false;

    const cacheKeyBlob = `${item.fojaId}:${version ?? 'auto'}`;
    (async () => {
      try {
        let blob = cacheRef.current.get(cacheKeyBlob);
        if (!blob) {
          blob = await getImagenFojaBlob(item.fojaId, version);
          cacheRef.current.set(cacheKeyBlob, blob);
        }
        if (cancelado) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setPdfUrl(url);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el documento.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, item?.fojaId, version]);

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  // Navegación por teclado.
  useEffect(() => {
    if (!abierto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCerrar(); return; }
      if (e.key === 'ArrowRight' && indiceActual < items.length - 1) { e.preventDefault(); onCambiarIndice(indiceActual + 1); }
      if (e.key === 'ArrowLeft' && indiceActual > 0) { e.preventDefault(); onCambiarIndice(indiceActual - 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abierto, indiceActual, items.length, onCambiarIndice, onCerrar]);

  if (!abierto || !item) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050,
    }}>
      <div style={{
        width: '95%', height: '90%', background: theme.colors.surface, borderRadius: theme.radius.lg,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: theme.shadow.lg,
      }}>
        {/* Header */}
        <div style={{
          minHeight: '64px', padding: '10px 16px', background: theme.colors.background,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px',
          borderBottom: `1px solid ${theme.colors.border}`, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <strong style={{ maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.colors.textPrimary }}>
              {item.titulo}
            </strong>
            <span style={s.badge(theme.colors.background, theme.colors.textSecondary)} title="Posición en el listado">
              {indiceActual + 1} / {items.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {fojaDetalle && fojaDetalle.imagenes.length > 1 && (
              <SelectorVersion imagenesDisponibles={fojaDetalle.imagenes} dictamen={null} versionSeleccionada={version} onCambiar={setVersion} />
            )}

            <BotonHeader titulo="Anterior" disabled={indiceActual === 0} onClick={() => onCambiarIndice(indiceActual - 1)}>
              <Icono nombre="flechaIzq" size={14} />
            </BotonHeader>
            <BotonHeader titulo="Siguiente" disabled={indiceActual === items.length - 1} onClick={() => onCambiarIndice(indiceActual + 1)}>
              <Icono nombre="flechaDer" size={14} />
            </BotonHeader>
            <BotonHeader titulo={drawerAbierto ? 'Ocultar detalles' : 'Detalles'} activo={drawerAbierto} onClick={() => setDrawerAbierto((v) => !v)}>
              <Icono nombre="lista" size={14} />
            </BotonHeader>
            <BotonHeader titulo="Cerrar (Esc)" onClick={onCerrar} destaque>
              <Icono nombre="cerrar" size={14} />
            </BotonHeader>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Listado lateral */}
          <div style={{ width: '340px', minWidth: '340px', background: theme.colors.background, borderRight: `1px solid ${theme.colors.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.colors.textSecondary, borderBottom: `1px solid ${theme.colors.border}` }}>
              Archivos
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {items.map((it, i) => (
                <div key={it.key} style={s.itemLista(i === indiceActual)} onClick={() => onCambiarIndice(i)}>
                  <span style={s.itemListaNumero(i === indiceActual)}>{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: theme.colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.titulo}
                    </div>
                    {it.detalle && (
                      <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.detalle}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Documento */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <VisorPdfViewer
              pdfUrl={pdfUrl}
              cargando={cargando}
              error={error}
              puedeDescargar={puedeCurarCliente(user?.rol)}
              nombreArchivo={`${item.titulo}.pdf`}
            />
          </div>

          {/* Cajón de detalles: lo nuevo de VISAR */}
          {drawerAbierto && (
            <div style={{ width: '320px', minWidth: '320px', background: theme.colors.surface, borderLeft: `1px solid ${theme.colors.border}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', borderBottom: `1px solid ${theme.colors.border}` }}>
                {(['curaduria', 'transcripcion'] as TabDetalle[]).map((tab) => (
                  <button key={tab} onClick={() => setTabDrawer(tab)} style={{
                    flex: 1, padding: '10px 6px', border: 'none', background: 'none', cursor: 'pointer',
                    fontFamily: theme.font.family, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                    color: tabDrawer === tab ? theme.colors.primary : theme.colors.textSecondary,
                    borderBottom: tabDrawer === tab ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
                  }}>
                    {tab === 'curaduria' ? 'Curaduría' : 'Transcripción'}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
                {tabDrawer === 'curaduria' && (
                  <PanelCuraduria fojaId={item.fojaId} imagenesDisponibles={fojaDetalle?.imagenes ?? []} puedeCurar={puedeCurarCliente(user?.rol)} />
                )}
                {tabDrawer === 'transcripcion' && (
                  <PanelTranscripcion fojaId={item.fojaId} puedeEditar={puedeCurarCliente(user?.rol)} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BotonHeader: React.FC<{ titulo: string; onClick: () => void; disabled?: boolean; activo?: boolean; destaque?: boolean; children: React.ReactNode }> = ({
  titulo, onClick, disabled, activo, destaque, children,
}) => (
  <button
    onClick={onClick} disabled={disabled} title={titulo}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
      borderRadius: theme.radius.sm, cursor: disabled ? 'not-allowed' : 'pointer',
      border: `1px solid ${destaque ? theme.colors.alert.red + '55' : activo ? theme.colors.primary : theme.colors.border}`,
      background: activo ? `${theme.colors.primary}18` : theme.colors.surface,
      color: destaque ? theme.colors.alert.red : activo ? theme.colors.primary : theme.colors.textSecondary,
      opacity: disabled ? 0.4 : 1,
    }}
  >
    {children}
  </button>
);

export default VisorModal;
