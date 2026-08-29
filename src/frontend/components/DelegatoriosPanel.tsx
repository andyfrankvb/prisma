/**
 * Component: DelegatoriosPanel
 *
 * La sección «Solicitudes a otras áreas» del expediente: a qué áreas se les pidió
 * información, cuáles ya contestaron —con su documento y observación—, cuáles
 * siguen pendientes y cuánto llevan.
 *
 * Aquí solo se ven y se resuelven. Pedir se hace desde «Turnar a otra área»,
 * que es la única puerta: antes cada función tenía su propio botón y su propio
 * formulario, y ninguno decía en qué se diferenciaba de los otros.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Icono } from './Icono';
import { theme } from '../theme';
import {
  getDelegatorios, devolverDelegatorio, cancelarSolicitud, crearDelegatorios,
} from '../api';
import type { Delegatorio } from '../api';
import { useDialogo }       from '../context/DialogoContext';

const ETIQUETA: Record<string, { texto: string; color: string; fondo: string }> = {
  PENDIENTE:   { texto: 'Pendiente',      color: '#92400E', fondo: '#FEF3C7' },
  ASIGNADO:    { texto: 'En proceso',     color: '#92400E', fondo: '#FEF3C7' },
  EN_REVISION: { texto: 'En revisión',    color: '#3D3935', fondo: '#EFEDEA' },
  CONTESTADO:  { texto: 'Contestado',   color: '#065F46', fondo: '#D1FAE5' },
  RECHAZADO:   { texto: 'No le compete',  color: '#B45309', fondo: '#FEF3C7' },
  CANCELADO:   { texto: 'Cancelada',      color: theme.colors.textSecondary, fondo: '#F3F4F6' },
};

/** Las dos formas de cerrarse sin dejar respuesta. Ya no frenan el oficio. */
const CERRADAS_SIN_RESPUESTA = ['RECHAZADO', 'CANCELADO'];

export const DelegatoriosPanel: React.FC<{
  oficioId: number;
  /** Solo quien detonó o puede detonar ve el alta y la devolución. */
  puedeDelegar?: boolean;
  onCambio?: () => void;
}> = ({ oficioId, puedeDelegar = false, onCambio }) => {
  const [items,   setItems]   = useState<Delegatorio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const dialogo = useDialogo();

  const cargar = useCallback(() => {
    setCargando(true);
    getDelegatorios(oficioId)
      .then((r) => setItems(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [oficioId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Rechazada o cancelada, la solicitud se cierra y deja de contar como pendiente.
  const pendientes = items.filter(
    (i) => !['CONTESTADO', ...CERRADAS_SIN_RESPUESTA].includes(i.estado),
  ).length;

  /**
   * Cerrar la propia solicitud. Mientras siga abierta, este oficio no puede
   * recibir visto bueno ni firma, y sin esto destrabarlo dependería de que el
   * área destino se acordara de contestar.
   */
  const cancelar = async (id: number, area: string) => {
    const razon = await dialogo.pedirTexto({
      titulo:      'Cancelar la solicitud',
      mensaje:     `${area} dejará de trabajarla y el oficio quedará libre para continuar.`,
      etiqueta:    '¿Por qué la cancelas?',
      placeholder: 'ESCRIBE EL MOTIVO…',
      confirmar:   'Cancelar solicitud',
      peligro:     true,
    });
    if (!razon) return;
    try {
      await cancelarSolicitud(id, razon);
      cargar(); onCambio?.();
    } catch (e: any) { setError(e.message); }
  };

  /**
   * Volver a pedírsela a la misma área.
   *
   * Que un área diga «no me compete» no siempre significa que no le tocaba: a
   * veces se rechaza por error, o se aclara el asunto y ya sí corresponde. El
   * servidor siempre permitió reabrir el mismo renglón, pero había que volver al
   * formulario y capturarlo todo de nuevo; desde aquí es un clic.
   *
   * Se propone la descripción anterior por si sirve tal cual, y se puede corregir
   * antes de mandarla —normalmente hace falta explicar por qué se insiste—.
   */
  const solicitarDeNuevo = async (d: Delegatorio) => {
    const texto = await dialogo.pedirTexto({
      titulo:      'Solicitar nuevamente',
      mensaje:     `Se le volverá a pedir a ${d.area}. El contador de días arranca de cero.`,
      etiqueta:    '¿Qué información se solicita?',
      placeholder: 'DESCRIBE LO QUE NECESITAS DEL ÁREA…',
      valor:       d.descripcion ?? '',
      mayusculas:  true,
      confirmar:   'Solicitar',
    });
    if (!texto) return;
    try {
      await crearDelegatorios(oficioId, texto.trim(), [d.unidad_destino_id]);
      cargar(); onCambio?.();
    } catch (e: any) { setError(e.message); }
  };

  const devolver = async (id: number) => {
    const c = await dialogo.pedirTexto({
      titulo:      'Devolver a corregir',
      mensaje:     'El área recibirá tus comentarios y podrá volver a responder.',
      etiqueta:    '¿Qué debe corregir el área?',
      placeholder: 'ESCRIBE LO QUE HAY QUE CORREGIR…',
      confirmar:   'Devolver',
    });
    if (!c) return;
    try {
      await devolverDelegatorio(id, c);
      cargar(); onCambio?.();
    } catch (e: any) { setError(e.message); }
  };

  // Si no hay nada y no puede delegar, la sección no estorba.
  if (cargando) return null;
  if (items.length === 0 && !puedeDelegar) return null;

  return (
    <div style={caja}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <span style={titulo}>Solicitudes a otras áreas</span>
          {pendientes > 0 && (
            <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 700, color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '10px' }}>
              {pendientes} sin contestar
            </span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" onClick={() => setError(null)}
          style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.78rem', cursor: 'pointer' }}>
          <Icono nombre="alerta" inline />{error}
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          Sin solicitudes. Si necesitas información de otra área, pídela desde «Turnar a otra área».
        </p>
      ) : items.map((d) => {
        const e = ETIQUETA[d.estado] ?? ETIQUETA.PENDIENTE;
        return (
          <div key={d.id} style={fila}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.82rem', color: theme.colors.textPrimary }}>{d.area}</strong>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* Cuánto lleva el área. Con plazo —hoy solo los testamentos—
                    cuenta hacia atrás; sin plazo cuenta hacia arriba y sin techo,
                    porque si no nada delata a la que lleva semanas parada. Los
                    días los cuenta la base: restarlos aquí daba de más o de menos
                    según la zona horaria del navegador. */}
                {!CERRADAS_SIN_RESPUESTA.includes(d.estado) && (
                  <span
                    title={d.fecha_vencimiento
                      ? `Vence el ${new Date(`${String(d.fecha_vencimiento).slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX')}`
                      : 'Días hábiles desde que se solicitó'}
                    style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap',
                      backgroundColor: d.vencido ? '#FEE2E2' : '#F3F4F6',
                      color:           d.vencido ? '#991B1B' : theme.colors.textSecondary,
                    }}
                  >
                    {d.fecha_vencimiento
                      ? (d.vencido
                          ? `Vencido · ${d.dias_transcurridos} d`
                          : `${d.dias_transcurridos} de ${(d.dias_transcurridos ?? 0) + (d.dias_restantes ?? 0)} d`)
                      : (d.estado === 'CONTESTADO'
                          ? `Contestada en ${d.dias_transcurridos} d`
                          : `${d.dias_transcurridos} ${d.dias_transcurridos === 1 ? 'día' : 'días'}`)}
                  </span>
                )}
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: e.color, backgroundColor: e.fondo, padding: '2px 9px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                  {e.texto}
                </span>
              </span>
            </div>

            {d.estado === 'CONTESTADO' ? (
              <div style={{ marginTop: '6px' }}>
                {d.observacion && (
                  <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: theme.colors.textSecondary, whiteSpace: 'pre-wrap' }}>
                    {d.observacion}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {d.documento_url && (
                    <a href={`/files${d.documento_url}`} target="_blank" rel="noopener noreferrer" style={btnSecundario}>
                      Ver documento
                    </a>
                  )}
                  {puedeDelegar && (
                    <button onClick={() => devolver(d.id)} style={{ ...btnSecundario, color: '#B45309', borderColor: '#B45309' }}>
                      Devolver a corregir
                    </button>
                  )}
                  {d.respondido_por && (
                    <span style={{ fontSize: '0.7rem', color: theme.colors.grayMid }}>por {d.respondido_por}</span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                  {d.estado === 'RECHAZADO'
                    ? 'El área la regresó por no ser de su competencia. Puedes pedírsela a otra.'
                    : d.estado === 'CANCELADO'
                      ? 'La cancelaste. Puedes volver a pedírsela a esta misma área.'
                      : d.asignado_a ? `Trabajándola: ${d.asignado_a}` : 'Esperando que el área la asigne'}
                </span>
                {/* Cerrada sin respuesta: se puede volver a intentar con la misma
                    área, que es lo que el servidor ya permitía. */}
                {puedeDelegar && CERRADAS_SIN_RESPUESTA.includes(d.estado) && (
                  <button
                    onClick={() => solicitarDeNuevo(d)}
                    title="Volver a pedírsela a esta misma área"
                    style={{ ...btnSecundario, color: theme.colors.primary, borderColor: theme.colors.primary }}
                  >
                    Solicitar nuevamente
                  </button>
                )}
                {/* Solo mientras siga abierta: lo cerrado ya no frena el oficio. */}
                {puedeDelegar && !CERRADAS_SIN_RESPUESTA.includes(d.estado) && (
                  <button
                    onClick={() => cancelar(d.id, d.area)}
                    title="Cerrarla para que el oficio pueda continuar"
                    style={{ ...btnSecundario, color: '#B45309', borderColor: '#B45309' }}
                  >
                    Cancelar solicitud
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '10px',
  padding: '14px 16px', marginBottom: '14px', backgroundColor: theme.colors.surface,
};
const titulo: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: theme.colors.textSecondary,
};
const fila: React.CSSProperties = {
  padding: '10px 0', borderTop: `1px solid ${theme.colors.border}`,
};
const etiqueta: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: theme.colors.charcoal,
};
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${theme.colors.border}`,
  borderRadius: '6px', fontSize: '0.82rem', fontFamily: theme.font.family, boxSizing: 'border-box',
};
const btnPrimario: React.CSSProperties = {
  padding: '7px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none',
  borderRadius: '7px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', fontFamily: theme.font.family,
};
const btnSecundario: React.CSSProperties = {
  padding: '6px 12px', backgroundColor: '#fff', color: theme.colors.primary,
  border: `1px solid ${theme.colors.primary}`, borderRadius: '6px', fontWeight: 700,
  fontSize: '0.74rem', cursor: 'pointer', fontFamily: theme.font.family, textDecoration: 'none',
};
