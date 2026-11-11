/**
 * GuiaPaqueteImpresa — la guía de un paquete tal como sale en papel.
 *
 * Es una pieza aparte de la que se ve en pantalla, a propósito: el papel tiene
 * otras reglas. Va en media carta horizontal (la mitad superior de una hoja
 * carta, con línea de corte), centrada, en una sola página y sin el encabezado
 * que el navegador agrega al imprimir.
 *
 * Se monta directamente en <body> (portal) y solo se muestra al imprimir: así la
 * pantalla de fondo no ocupa espacio en el papel —antes empujaba la guía a una
 * segunda hoja— y el diseño de pantalla no se deforma para caber en el papel.
 * Las reglas viven en frontend/src/global.css (`#guia-impresion`).
 *
 * El código de recepción NO aparece aquí nunca: impreso en el sobre, cualquiera
 * que lo cargue podría darse por destinatario.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../theme';
import type { OficioEnPaquete } from '../api';

interface Props {
  folio:         string;
  fecha:         string;
  qr:            string;
  url:           string;
  remitente:     string;
  unidadOrigen:  string;
  destinatario:  string;
  unidadDestino: string;
  observaciones: string | null;
  contenido:     OficioEnPaquete[];
}

/** Cuántos documentos caben en la lista antes de resumir el resto. */
const MAX_RENGLONES = 6;

export const GuiaPaqueteImpresa: React.FC<Props> = (p) => {
  const visibles = p.contenido.slice(0, MAX_RENGLONES);
  const resto    = p.contenido.length - visibles.length;

  return createPortal(
    <div id="guia-impresion">
      <div style={hoja}>
        {/* ── Encabezado ── */}
        <div style={encabezado}>
          <img src="/LOGO.PRISMA.png" alt="PRISMA" style={{ height: '11mm', width: 'auto' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={rotulo}>Control de Correspondencia · Guía de envío</div>
            <div style={{ fontSize: '17pt', fontWeight: 800, color: theme.colors.primaryDark, lineHeight: 1.1 }}>
              {p.folio}
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: '34mm' }}>
            <div style={rotulo}>Fecha de envío</div>
            <div style={{ fontSize: '9.5pt', fontWeight: 700 }}>{p.fecha}</div>
          </div>
        </div>

        <div style={cuerpo}>
          {/* ── Columna de datos ── */}
          <div style={{ display: 'grid', gap: '3mm', alignContent: 'start' }}>
            <div style={caja}>
              <div style={rotulo}>De</div>
              <div style={{ fontSize: '10.5pt', fontWeight: 700 }}>{p.remitente}</div>
              <div style={{ fontSize: '8.5pt', color: theme.colors.textSecondary }}>{p.unidadOrigen}</div>
            </div>

            <div style={{ ...caja, borderWidth: '0.6mm', borderColor: theme.colors.charcoal }}>
              <div style={rotulo}>Para</div>
              <div style={{ fontSize: '13pt', fontWeight: 800 }}>{p.destinatario}</div>
              <div style={{ fontSize: '9.5pt', fontWeight: 600 }}>{p.unidadDestino}</div>
            </div>

            <div style={caja}>
              <div style={rotulo}>
                Contenido · {p.contenido.length} {p.contenido.length === 1 ? 'documento' : 'documentos'}
              </div>
              <div style={{ display: 'grid', gap: '0.8mm', marginTop: '1mm' }}>
                {visibles.map((o) => (
                  <div key={o.contenido_id} style={{ fontSize: '8.5pt', lineHeight: 1.25 }}>
                    {o.folio ? (
                      <>
                        <strong>{o.folio}</strong>
                        {o.remitente && <span style={{ color: theme.colors.textSecondary }}> · {o.remitente}</span>}
                      </>
                    ) : (
                      <span>{o.descripcion}</span>
                    )}
                  </div>
                ))}
                {resto > 0 && (
                  <div style={{ fontSize: '8.5pt', color: theme.colors.textSecondary }}>
                    … y {resto} {resto === 1 ? 'documento más' : 'documentos más'}
                  </div>
                )}
              </div>
              {p.observaciones && (
                <div style={{ marginTop: '1.5mm', fontSize: '8.5pt' }}>
                  <strong>Observaciones:</strong> {p.observaciones}
                </div>
              )}
            </div>
          </div>

          {/* ── Columna del QR ── */}
          <div style={columnaQR}>
            <img src={p.qr} alt={`Código del paquete ${p.folio}`} style={{ width: '44mm', height: '44mm' }} />
            <div style={{ fontSize: '7pt', color: theme.colors.textSecondary, wordBreak: 'break-all',
                          textAlign: 'center', marginTop: '1mm' }}>
              {p.url}
            </div>
            <div style={instrucciones}>
              <div style={{ ...rotulo, marginBottom: '1mm' }}>Instrucciones</div>
              <ol style={{ margin: 0, paddingLeft: '4mm', display: 'grid', gap: '0.8mm' }}>
                <li>Escanee el código con la cámara del teléfono.</li>
                <li>Para trasladarlo, quien lo tiene debe entregarlo desde su teléfono y usted confirmar.</li>
                <li>El destinatario confirma la recepción con el código que ve en su pantalla.</li>
              </ol>
            </div>
          </div>
        </div>

        <div style={pie}>
          Documento de control interno de PRISMA. No desprender del sobre hasta su entrega.
        </div>
      </div>

      {/* Línea de corte: la guía ocupa la mitad superior de la hoja carta. */}
      <div style={lineaCorte}>✂ Recortar por esta línea</div>
    </div>,
    document.body,
  );
};

// ── Estilos (en milímetros: es papel, no pantalla) ─────────────────────────

// 180 mm: la hoja carta mide 216 mm y el navegador deja márgenes de ~12 mm por
// lado (los reportes fijan los suyos en global.css). Con 196 mm el borde derecho
// se salía del área imprimible y se cortaba.
const hoja: React.CSSProperties = {
  boxSizing: 'border-box', width: '180mm', maxWidth: '100%', margin: '4mm auto 0',
  padding: '5mm 6mm', border: `0.5mm solid ${theme.colors.charcoal}`, borderRadius: '3mm',
  fontFamily: 'inherit', color: theme.colors.textPrimary, backgroundColor: theme.colors.white,
};
const encabezado: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4mm',
  paddingBottom: '3mm', borderBottom: `0.3mm solid ${theme.colors.border}`,
};
const cuerpo: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 54mm', gap: '5mm', marginTop: '3.5mm',
};
const caja: React.CSSProperties = {
  padding: '2mm 3mm', borderRadius: '2mm', border: `0.3mm solid ${theme.colors.border}`,
};
const rotulo: React.CSSProperties = {
  fontSize: '6.5pt', fontWeight: 700, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: theme.colors.gold,
};
const columnaQR: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
};
const instrucciones: React.CSSProperties = {
  marginTop: '3mm', padding: '2mm 3mm', borderRadius: '2mm', width: '100%', boxSizing: 'border-box',
  backgroundColor: theme.colors.background, fontSize: '7.5pt', lineHeight: 1.3,
};
const pie: React.CSSProperties = {
  marginTop: '3mm', paddingTop: '2mm', borderTop: `0.3mm solid ${theme.colors.border}`,
  fontSize: '7pt', color: theme.colors.textSecondary, textAlign: 'center',
};
const lineaCorte: React.CSSProperties = {
  width: '180mm', maxWidth: '100%', margin: '6mm auto 0', paddingTop: '1mm',
  borderTop: `0.3mm dashed ${theme.colors.grayMid}`,
  fontSize: '7pt', color: theme.colors.grayMid, textAlign: 'center',
};
