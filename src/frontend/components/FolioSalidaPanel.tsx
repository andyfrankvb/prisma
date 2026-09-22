/**
 * FolioSalidaPanel — el folio del oficio de RESPUESTA, dentro del expediente.
 *
 * Sucesor del módulo de Folios de SID. No es el folio de ENTRADA que ya se ve
 * arriba en «Datos del oficio» (ese lo asigna la Oficialía al capturar) — este
 * es el consecutivo legal de la CONTESTACIÓN, y puede originarse en dos
 * momentos distintos:
 *
 *   · El Analista Jurídico lo reserva al tener listo su proyecto (queda
 *     RESERVADO, con el formato de Analista).
 *   · El Director Jurídico lo formaliza al dar el visto bueno — si el
 *     Analista ya reservó uno, solo lo deja ASIGNADO; si no había ninguno, lo
 *     genera ahí mismo con su propio formato (…/DJ/…).
 *
 * El servidor decide qué botones mostrar (`permisos`): la pantalla no supone
 * quién es Analista o Director, solo obedece lo que el backend autorizó — el
 * mismo criterio que ya usa el resto de Oficialía de Partes (`puede_*`).
 */
import React, { useEffect, useState } from 'react';
import { theme }        from '../theme';
import { useAuth }      from '../context/AuthContext';
import { useDialogo }   from '../context/DialogoContext';
import { HistorialFoliosSalidaModal } from './HistorialFoliosSalidaModal';
import {
  getFolioSalida, reservarFolioSalida, formalizarFolioSalida, cancelarFolioSalida,
} from '../api';
import type { FolioSalida, PermisosFolioSalida } from '../types';

const ESTATUS_LABEL: Record<string, { texto: string; bg: string; color: string }> = {
  RESERVADO: { texto: 'Reservado', bg: '#FEF3C7', color: '#92400E' },
  ASIGNADO:  { texto: 'Asignado',  bg: '#DCFCE7', color: '#166534' },
  CANCELADO: { texto: 'Cancelado', bg: '#FEE2E2', color: '#991B1B' },
};

const fFecha = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';

export const FolioSalidaPanel: React.FC<{ oficioId: number }> = ({ oficioId }) => {
  const [folio,    setFolio]    = useState<FolioSalida | null>(null);
  const [permisos, setPermisos] = useState<PermisosFolioSalida | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const dialogo = useDialogo();
  const { user } = useAuth();
  // Quién de verdad decide es el servidor (ver HistorialFoliosSalidaModal); esto
  // solo evita ofrecer el enlace a quien no podrá usarlo.
  const puedeVerHistorial = user?.rol === 'DIRECTOR' || user?.rol === 'SUPERADMIN';

  const cargar = () => {
    setLoading(true); setError(null);
    getFolioSalida(oficioId)
      .then((r) => { setFolio(r.data); setPermisos(r.permisos); })
      .catch((e) => setError(e?.message ?? 'No se pudo cargar el folio de salida'))
      .finally(() => setLoading(false));
  };

  useEffect(cargar, [oficioId]);

  // Sin folio y sin nada que ofrecer —ni siquiera el historial—, el panel no
  // aporta nada: se calla. El historial no depende del folio de ESTE oficio,
  // así que se cuenta aparte.
  if (!loading && !folio && !permisos?.puede_reservar && !puedeVerHistorial) return null;

  const reservar = async () => {
    setSaving(true); setError(null);
    try {
      await reservarFolioSalida(oficioId, 'JURIDICO');
      cargar();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo reservar el folio');
    } finally {
      setSaving(false);
    }
  };

  const formalizar = async () => {
    const sigue = await dialogo.confirmar({
      titulo:  'Formalizar folio de salida',
      mensaje: folio
        ? `Se asignará en definitiva el folio ${folio.folio_formateado}.`
        : 'No hay folio reservado: se generará uno nuevo con el formato de la Dirección Jurídica.',
      confirmar: 'Formalizar',
    });
    if (!sigue) return;

    setSaving(true); setError(null);
    try {
      await formalizarFolioSalida(oficioId);
      cargar();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo formalizar el folio');
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async () => {
    const motivo = await dialogo.pedirTexto({
      titulo:      'Cancelar folio de salida',
      mensaje:     `El folio ${folio?.folio_formateado} quedará cancelado y no se reutilizará. Indica el motivo.`,
      etiqueta:    'Motivo',
      placeholder: 'Por qué se cancela este folio',
      confirmar:   'Cancelar folio',
      peligro:     true,
    });
    if (!motivo) return;

    setSaving(true); setError(null);
    try {
      await cancelarFolioSalida(oficioId, motivo);
      cargar();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cancelar el folio');
    } finally {
      setSaving(false);
    }
  };

  const badge = folio ? ESTATUS_LABEL[folio.estatus] : null;

  return (
    <div style={{
      border: `1px solid ${folio?.estatus === 'ASIGNADO' ? theme.colors.alert.green : theme.colors.border}`,
      backgroundColor: theme.colors.surface,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Folio de salida
      </span>

      {loading ? (
        <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: theme.colors.textSecondary }}>Cargando…</p>
      ) : folio ? (
        <div style={{ marginTop: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: theme.colors.textPrimary, fontFamily: 'monospace' }}>
              {folio.folio_formateado}
            </span>
            {badge && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: '10px', backgroundColor: badge.bg, color: badge.color }}>
                {badge.texto}
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: theme.colors.textSecondary }}>
            {folio.estatus === 'ASIGNADO'
              ? `Asignado por ${folio.asignado_por_nombre ?? '—'} el ${fFecha(folio.asignado_en)}`
              : `Reservado por ${folio.reservado_por_nombre ?? '—'} el ${fFecha(folio.reservado_en)}`}
          </p>
        </div>
      ) : (
        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          Este oficio todavía no tiene folio de salida.
        </p>
      )}

      {error && <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>}

      {permisos && (permisos.puede_reservar || permisos.puede_formalizar || permisos.puede_cancelar) && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          {permisos.puede_reservar && !folio && (
            <BotonAccion onClick={reservar} disabled={saving} label="Reservar folio" />
          )}
          {permisos.puede_formalizar && (
            <BotonAccion onClick={formalizar} disabled={saving} label="Formalizar folio" primario />
          )}
          {permisos.puede_cancelar && (
            <BotonAccion onClick={cancelar} disabled={saving} label="Cancelar folio" peligro />
          )}
        </div>
      )}

      {puedeVerHistorial && (
        <button
          type="button"
          onClick={() => setHistorialOpen(true)}
          style={{
            display: 'block', marginTop: '10px', padding: 0, background: 'none', border: 'none',
            fontSize: '0.74rem', fontWeight: 700, color: theme.colors.primary, cursor: 'pointer',
            fontFamily: theme.font.family, textDecoration: 'underline',
          }}
        >
          Ver historial de folios de salida
        </button>
      )}
      <HistorialFoliosSalidaModal open={historialOpen} onClose={() => setHistorialOpen(false)} />
    </div>
  );
};

const BotonAccion: React.FC<{
  onClick: () => void; disabled?: boolean; label: string; primario?: boolean; peligro?: boolean;
}> = ({ onClick, disabled, label, primario, peligro }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700,
      borderRadius: theme.radius.sm, cursor: disabled ? 'wait' : 'pointer',
      fontFamily: theme.font.family,
      border: `1px solid ${peligro ? theme.colors.alert.red : theme.colors.primary}`,
      backgroundColor: primario ? theme.colors.primary : '#fff',
      color: primario ? '#fff' : peligro ? theme.colors.alert.red : theme.colors.primary,
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {label}
  </button>
);
