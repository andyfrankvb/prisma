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
import React from 'react';
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
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#525659' }}>
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

const BotonToolbar: React.FC<{ titulo: string; onClick: () => void; children: React.ReactNode }> = ({ titulo, onClick, children }) => (
  <button
    onClick={onClick} title={titulo}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
      borderRadius: theme.radius.sm, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

export default VisorPdfViewer;
