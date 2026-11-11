/**
 * Component: VisorPdfViewer
 * File: src/frontend/components/visor/VisorPdfViewer.tsx
 *
 * Visor de PDF con toolbar propio — el equivalente en React de lo que SID
 * tenía con `ngx-extended-pdf-viewer` (Angular): ambos son una envoltura
 * sobre PDF.js que le da a la app control total del toolbar, en vez del
 * visor nativo (opaco) del navegador que se usaba antes en un `<iframe>`.
 *
 * A propósito NO se usa `defaultLayoutPlugin` de @react-pdf-viewer — ese
 * trae de fábrica un panel de miniaturas/outline que es justo lo que SID
 * no muestra y lo que quitaba espacio útil al documento. Con los plugins
 * sueltos (zoom/rotate/get-file/print) ese panel nunca existe.
 */
import React, { useEffect, useRef } from 'react';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { zoomPlugin } from '@react-pdf-viewer/zoom';
import { rotatePlugin } from '@react-pdf-viewer/rotate';
import { getFilePlugin } from '@react-pdf-viewer/get-file';
import { printPlugin } from '@react-pdf-viewer/print';
// @ts-ignore — Vite resuelve `?url` a la ruta del asset servido; sin tipos propios.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { Icono } from '../Icono';
import { theme } from '../../theme';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/zoom/lib/styles/index.css';
import '@react-pdf-viewer/print/lib/styles/index.css';

interface Props {
  pdfUrl:        string | null;
  cargando:      boolean;
  error:         string | null;
  puedeDescargar: boolean;
  nombreArchivo: string;
}

export const VisorPdfViewer: React.FC<Props> = ({ pdfUrl, cargando, error, puedeDescargar, nombreArchivo }) => {
  // Los factories de @react-pdf-viewer usan Hooks por dentro (useState/useMemo
  // propios) para mantenerse estables entre renders — por eso se llaman
  // directo aquí, nunca envueltos en un useMemo/useEffect nuestro (rompería
  // las reglas de Hooks: sería un Hook llamado dentro de otro Hook).
  const zoomPluginInstance = zoomPlugin();
  const rotatePluginInstance = rotatePlugin();
  const getFilePluginInstance = getFilePlugin({ fileNameGenerator: () => nombreArchivo });
  const printPluginInstance = printPlugin();

  const { ZoomInButton, ZoomOutButton, CurrentScale, zoomTo } = zoomPluginInstance;
  const { RotateBackwardButton, RotateForwardButton } = rotatePluginInstance;
  const { Download } = getFilePluginInstance;
  const { Print } = printPluginInstance;

  // Contenedor del documento: de aquí sale el elemento con scroll que usa el
  // ciclo de abajo. `.rpv-core__inner-pages` es el que desplaza @react-pdf-viewer,
  // equivalente al `#viewerContainer` que buscaba SID por id.
  const contenedorRef = useRef<HTMLDivElement>(null);

  /**
   * Port de `ajusteYScroll()` (visor.component.ts, SID): un solo botón que
   * recorre la foja en tres pasos — ajusta al ancho, baja al final, vuelve
   * arriba — y se queda alternando entre los dos últimos. Es como leen una
   * foja de corrido sin soltar el mouse.
   *
   * El estado va en un ref y no en useState a propósito: solo lo lee el
   * manejador del clic, así que guardarlo en estado provocaría un re-render
   * del visor —y con él recargar el PDF— en cada paso del ciclo.
   */
  const pasoCicloRef = useRef(0);

  // Cada documento nuevo empieza el ciclo desde cero, igual que SID al abrir
  // otra foja (`estadoAccion = 0`).
  useEffect(() => { pasoCicloRef.current = 0; }, [pdfUrl]);

  const scrollDelDocumento = (): HTMLElement | null =>
    contenedorRef.current?.querySelector<HTMLElement>('.rpv-core__inner-pages') ?? null;

  const ajusteYScroll = (): void => {
    const contenedor = scrollDelDocumento();
    if (!contenedor) return;

    switch (pasoCicloRef.current) {
      case 0:
        zoomTo(SpecialZoomLevel.PageWidth);
        pasoCicloRef.current = 1;
        break;
      case 1:
        contenedor.scrollTo({ top: contenedor.scrollHeight, behavior: 'smooth' });
        pasoCicloRef.current = 2;
        break;
      default:
        contenedor.scrollTo({ top: 0, behavior: 'smooth' });
        pasoCicloRef.current = 1;
        break;
    }
  };

  /** Página completa reinicia el ciclo, como hacía `onZoomChange` en SID. */
  const ajustarPaginaCompleta = (): void => {
    zoomTo(SpecialZoomLevel.PageFit);
    pasoCicloRef.current = 0;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar propio — mismos botones que SID (zoom, ajustar ancho, rotar), más descarga solo si el rol lo permite. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
        background: '#3a3d40', borderBottom: '1px solid #222',
      }}>
        <ZoomOutButton />
        <span style={{ color: '#fff', fontSize: '0.78rem', minWidth: '42px', textAlign: 'center' }}>
          <CurrentScale>{(props) => <>{Math.round(props.scale * 100)}%</>}</CurrentScale>
        </span>
        <ZoomInButton />

        <BotonToolbar titulo="Ajustar ancho" onClick={() => zoomTo(SpecialZoomLevel.PageWidth)}>
          <Icono nombre="ampliar" size={14} color="#fff" />
        </BotonToolbar>

        <BotonToolbar titulo="Ajustar página completa" onClick={ajustarPaginaCompleta} anchoAuto>
          Pág.
        </BotonToolbar>

        <BotonToolbar titulo="Tamaño real (100%)" onClick={() => zoomTo(1)} anchoAuto>
          100%
        </BotonToolbar>

        <BotonToolbar titulo="Ajustar al ancho y recorrer la foja" onClick={ajusteYScroll}>
          <Icono nombre="flechaAbajo" size={14} color="#fff" />
        </BotonToolbar>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

        <RotateBackwardButton />
        <RotateForwardButton />

        <div style={{ flex: 1 }} />

        <Print>{(props) => (
          <BotonToolbar titulo="Imprimir" onClick={props.onClick}>
            <Icono nombre="documento" size={14} color="#fff" />
          </BotonToolbar>
        )}</Print>

        {puedeDescargar && (
          <Download>{(props) => (
            <BotonToolbar titulo="Descargar" onClick={props.onClick}>
              <Icono nombre="descargar" size={14} color="#fff" />
            </BotonToolbar>
          )}</Download>
        )}
      </div>

      {/* Documento */}
      <div ref={contenedorRef} style={{ flex: 1, minHeight: 0, position: 'relative', background: '#525659' }}>
        {cargando && <Centrado><span style={{ color: '#fff' }}>Cargando documento…</span></Centrado>}
        {!cargando && error && (
          <Centrado>
            <strong style={{ color: theme.colors.alert.red }}>Documento no disponible</strong>
            <span style={{ color: '#fff', fontSize: '0.8rem' }}>{error}</span>
          </Centrado>
        )}
        {!cargando && !error && pdfUrl && (
          <Worker workerUrl={pdfWorkerUrl}>
            <Viewer
              fileUrl={pdfUrl}
              defaultScale={SpecialZoomLevel.PageWidth}
              plugins={[zoomPluginInstance, rotatePluginInstance, getFilePluginInstance, printPluginInstance]}
            />
          </Worker>
        )}
      </div>
    </div>
  );
};

const Centrado: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
    {children}
  </div>
);

const BotonToolbar: React.FC<{ titulo: string; onClick: () => void; anchoAuto?: boolean; children: React.ReactNode }> = ({
  titulo, onClick, anchoAuto, children,
}) => (
  <button
    onClick={onClick} title={titulo}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: anchoAuto ? 'auto' : 30, minWidth: 30, height: 30, padding: anchoAuto ? '0 8px' : 0,
      borderRadius: theme.radius.sm, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
      color: '#fff', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, lineHeight: 1,
    }}
  >
    {children}
  </button>
);

export default VisorPdfViewer;
