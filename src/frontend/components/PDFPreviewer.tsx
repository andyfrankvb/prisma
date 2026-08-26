/**
 * Component: PDFPreviewer
 * - Si el archivo es PDF: lo descarga con JWT y lo muestra en iframe.
 * - Si el archivo es Word: muestra el texto extraído y botón de descarga.
 *
 * El visor se puede agrandar de dos formas, porque leer un oficio en un recuadro
 * chico es incómodo: estirándolo desde su borde inferior, o abriéndolo a pantalla
 * completa. El zoom del documento lo pone el visor del navegador, que ya trae su
 * propia barra dentro del marco.
 */

import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';

interface Props {
  url:            string;
  title?:         string;
  height?:        string | number;
  /** Si se pasa, se usa para detectar Word sin llamar al endpoint /info */
  textoProyecto?: string | null;
  /** Para Word: no volcar el texto extraído, solo ofrecer la descarga. */
  hideExtractedText?: boolean;
}

export const PDFPreviewer: React.FC<Props> = ({
  url,
  title  = 'Documento',
  height = '72vh',
  textoProyecto,
  hideExtractedText = false,
}) => {
  const [blobUrl,   setBlobUrl]   = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [isWord,    setIsWord]    = useState(false);
  const [textoWord, setTextoWord] = useState<string | null>(textoProyecto ?? null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const marcoRef = useRef<HTMLDivElement>(null);

  // Salir con Escape: es lo que la gente intenta primero.
  useEffect(() => {
    if (!pantallaCompleta) return;
    const salir = (e: KeyboardEvent) => { if (e.key === 'Escape') setPantallaCompleta(false); };
    window.addEventListener('keydown', salir);
    return () => window.removeEventListener('keydown', salir);
  }, [pantallaCompleta]);

  useEffect(() => {
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setBlobUrl(null);
      setIsWord(false);

      try {
        const token   = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // ── Detectar si es Word consultando /info (solo para /proyecto) ──
        const isProyectoUrl = url.includes('/proyecto') && !url.includes('/info');
        if (isProyectoUrl) {
          const infoRes = await fetch(url + '/info', { headers });
          if (infoRes.ok) {
            const { data } = await infoRes.json();
            if (data.es_word) {
              setIsWord(true);
              setTextoWord(data.texto_proyecto ?? textoProyecto ?? null);
              // Obtener blob para descarga
              const fileRes = await fetch(url, { headers });
              if (fileRes.ok) {
                const blob = await fileRes.blob();
                objectUrl  = URL.createObjectURL(blob);
                setDownloadUrl(objectUrl);
              }
              setLoading(false);
              return;
            }
          }
        }

        // ── Es PDF: cargar y mostrar en iframe ───────────────────────────
        const res = await fetch(url, { headers });

        if (!res.ok) {
          if (res.status === 404) setError('El archivo no está disponible en el servidor.');
          else if (res.status === 401) setError('Sin autorización para ver este documento.');
          else setError(`Error al cargar el archivo (${res.status}).`);
          return;
        }

        const blob = await res.blob();
        objectUrl  = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        setError('No se pudo conectar con el servidor.');
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <div
      ref={marcoRef}
      style={pantallaCompleta ? {
        // A pantalla completa dentro de la aplicación: no usa la pantalla completa
        // del navegador porque el visor suele abrirse dentro de una ventana modal,
        // y ahí esa función se comporta distinto según el navegador.
        // Por encima del panel del visor (1100) y de las ventanas modales (1000),
        // que son los contenedores donde este componente se abre.
        position: 'fixed', inset: 0, zIndex: 1200,
        border: 'none', borderRadius: 0, background: theme.colors.surface,
        display: 'flex', flexDirection: 'column',
      } : {
        border:       `1px solid ${theme.colors.border}`,
        borderRadius: '8px',
        overflow:     'hidden',
        background:   theme.colors.surface,
      }}
    >
      {/* Header */}
      <div style={{
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'space-between',
        padding:         '8px 16px',
        backgroundColor: theme.colors.primary,
        color:           theme.colors.white,
        fontSize:        '0.85rem',
        fontWeight:      600,
      }}>
        <span>{isWord ? '📝' : '📄'} {title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {blobUrl && !isWord && (
            <button
              type="button"
              onClick={() => setPantallaCompleta((v) => !v)}
              title={pantallaCompleta ? 'Volver al tamaño normal (Esc)' : 'Ver a pantalla completa'}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                color: theme.colors.white, fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              {pantallaCompleta ? '⤡ Reducir' : '⤢ Ampliar'}
            </button>
          )}
          {(blobUrl || downloadUrl) && (
            <a
              href={blobUrl ?? downloadUrl ?? '#'}
              download={title}
              style={{ color: theme.colors.white, fontSize: '0.8rem', textDecoration: 'underline' }}
            >
              ⬇ Descargar
            </a>
          )}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
          Cargando documento…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ padding: '32px', textAlign: 'center' }}>
          <p style={{ color: theme.colors.alert.yellow, fontSize: '0.875rem', margin: '0 0 8px', fontWeight: 600 }}>
            📂 Documento no disponible
          </p>
          <p style={{ color: theme.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* ── Vista Word ─────────────────────────────────────── */}
      {!loading && isWord && (
        <div>
          {/* Banner informativo */}
          <div style={{
            display:         'flex',
            alignItems:      'center',
            gap:             '10px',
            padding:         '10px 16px',
            backgroundColor: '#EFF6FF',
            borderBottom:    `1px solid #BFDBFE`,
            fontSize:        '0.78rem',
            color:           '#1E40AF',
          }}>
            <span style={{ fontSize: '1.1rem' }}>📝</span>
            <div>
              <strong>Archivo Word</strong> — no se puede previsualizar directamente.
              {downloadUrl && (
                <> Usa el botón <strong>⬇ Descargar</strong> para abrirlo en tu equipo.</>
              )}
            </div>
          </div>

          {/* Texto extraído (se oculta cuando hideExtractedText, p.ej. en el proyecto) */}
          {textoWord && !hideExtractedText ? (
            <div>
              <div style={{
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'space-between',
                padding:         '8px 16px',
                backgroundColor: theme.colors.charcoal,
                color:           '#fff',
                fontSize:        '0.75rem',
                fontWeight:      700,
                letterSpacing:   '0.05em',
                textTransform:   'uppercase',
              }}>
                <span>📄 Texto extraído del documento</span>
                <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 400 }}>
                  {textoWord.length} caracteres
                </span>
              </div>
              <div style={{
                padding:         '16px',
                backgroundColor: '#FAFAF8',
                maxHeight:       typeof height === 'number' ? `${height - 80}px` : height,
                overflowY:       'auto',
                fontSize:        '0.85rem',
                lineHeight:      1.8,
                color:           theme.colors.textPrimary,
                whiteSpace:      'pre-wrap',
                fontFamily:      'monospace',
                userSelect:      'text',
              }}>
                {textoWord}
              </div>
              <div style={{
                padding:         '6px 16px',
                backgroundColor: '#F0F0EC',
                borderTop:       `1px solid ${theme.colors.border}`,
                fontSize:        '0.7rem',
                color:           theme.colors.textSecondary,
              }}>
                💡 Texto seleccionable extraído automáticamente del archivo Word
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#FAFAF8' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: theme.colors.textSecondary }}>
                {hideExtractedText
                  ? 'Descarga el archivo para abrirlo en tu equipo.'
                  : 'No se pudo extraer texto de este archivo Word.'}
              </p>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={title}
                  style={{
                    display:         'inline-block',
                    marginTop:       '16px',
                    padding:         '9px 20px',
                    backgroundColor: theme.colors.primary,
                    color:           '#fff',
                    borderRadius:    '7px',
                    textDecoration:  'none',
                    fontWeight:      700,
                    fontSize:        '0.875rem',
                  }}
                >
                  ⬇ Descargar archivo Word
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Vista PDF ──────────────────────────────────────── */}
      {!loading && blobUrl && !isWord && (
        <div
          style={pantallaCompleta ? { flex: 1, minHeight: 0 } : {
            // `resize` no funciona sobre un iframe, sí sobre quien lo envuelve.
            // El agarradero queda en la esquina inferior derecha del marco.
            height, minHeight: '240px', resize: 'vertical', overflow: 'auto',
          }}
        >
          <iframe
            src={blobUrl}
            title={title}
            style={{ border: 'none', display: 'block', width: '100%', height: '100%' }}
            aria-label={title}
          />
        </div>
      )}

      {!loading && blobUrl && !isWord && !pantallaCompleta && (
        <div style={{
          padding: '4px 12px', borderTop: `1px solid ${theme.colors.border}`,
          fontSize: '0.68rem', color: theme.colors.textSecondary, textAlign: 'right',
        }}>
          Arrastra la esquina inferior derecha para estirarlo
        </div>
      )}
    </div>
  );
};
