/**
 * Component: PanelCuraduria
 * File: src/frontend/components/visor/PanelCuraduria.tsx
 *
 * Dictamen jurídico de qué versión de digitalización es la válida — port de
 * CuraduriaPanel.tsx (VISAR), reconstruido con theme.ts de PRISMA.
 */
import React, { useEffect, useState } from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import { getDictamen, guardarDictamen } from '../../services/visorApi';
import type { VersionDigitalizacion, VisorDictamenVersion, VisorImagenFoja } from '../../types';

const VERSIONES: { value: VersionDigitalizacion; label: string }[] = [
  { value: 'V3_VALIDADA',    label: 'V3 — Validada' },
  { value: 'V2022_FALTANTE', label: 'V2022 — Faltante' },
  { value: 'V2009',          label: 'V2009 — Original' },
];

interface Props {
  fojaId:              number | null;
  imagenesDisponibles: VisorImagenFoja[];
  puedeCurar:          boolean;
}

export const PanelCuraduria: React.FC<Props> = ({ fojaId, imagenesDisponibles, puedeCurar }) => {
  const [dictamen, setDictamen] = useState<VisorDictamenVersion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [version, setVersion] = useState<VersionDigitalizacion>('V3_VALIDADA');
  const [justificacion, setJustificacion] = useState('');

  useEffect(() => {
    if (!fojaId) { setDictamen(null); return; }
    setCargando(true); setError(null); setExito(false);
    getDictamen(fojaId)
      .then((d) => {
        setDictamen(d);
        setVersion(d?.version_seleccionada ?? 'V3_VALIDADA');
        setJustificacion(d?.justificacion_juridica ?? '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setCargando(false));
  }, [fojaId]);

  const guardar = async () => {
    if (!fojaId || !justificacion.trim()) { setError('La justificación jurídica es obligatoria.'); return; }
    setGuardando(true); setError(null); setExito(false);
    try {
      const data = await guardarDictamen(fojaId, { version_seleccionada: version, justificacion_juridica: justificacion.trim() });
      setDictamen(data);
      setExito(true);
      setTimeout(() => setExito(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar el dictamen.');
    } finally { setGuardando(false); }
  };

  if (!fojaId) {
    return <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Selecciona una foja para gestionar el dictamen.</p>;
  }
  if (cargando) {
    return <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Cargando…</p>;
  }

  const versionesConImagen = VERSIONES.filter((v) => imagenesDisponibles.some((img) => img.version === v.value));

  if (!puedeCurar) {
    return dictamen ? (
      <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Fila etiqueta="Versión dictaminada" valor={VERSIONES.find((v) => v.value === dictamen.version_seleccionada)?.label ?? dictamen.version_seleccionada} />
        <Fila etiqueta="Fecha" valor={new Date(dictamen.fecha_dictamen).toLocaleDateString('es-MX')} />
        <Fila etiqueta="Justificación" valor={dictamen.justificacion_juridica} />
      </div>
    ) : (
      <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Esta foja todavía no tiene dictamen de curaduría.</p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {dictamen && (
        <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginBottom: '4px' }}>
          Dictaminada actualmente: <strong style={{ color: theme.colors.primary }}>{VERSIONES.find((v) => v.value === dictamen.version_seleccionada)?.label}</strong>
          {' · '}{new Date(dictamen.fecha_dictamen).toLocaleDateString('es-MX')}
        </div>
      )}

      <select
        value={version}
        onChange={(e) => setVersion(e.target.value as VersionDigitalizacion)}
        style={selectStyle}
      >
        {versionesConImagen.length ? versionesConImagen.map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        )) : VERSIONES.map((v) => <option key={v.value} value={v.value}>{v.label} (sin imagen cargada)</option>)}
      </select>

      <textarea
        value={justificacion}
        onChange={(e) => setJustificacion(e.target.value)}
        rows={4}
        placeholder="Justificación jurídica de por qué esta versión es la válida…"
        style={{ ...selectStyle, resize: 'vertical', fontFamily: theme.font.family }}
      />

      {error && <p style={{ fontSize: '0.72rem', color: theme.colors.alert.red, margin: 0 }}>{error}</p>}
      {exito && <p style={{ fontSize: '0.72rem', color: theme.colors.alert.green, margin: 0 }}>Dictamen guardado.</p>}

      <button
        onClick={guardar}
        disabled={guardando || !justificacion.trim()}
        style={{
          padding: '8px 14px', borderRadius: theme.radius.sm, border: 'none',
          background: theme.colors.primary, color: '#fff', fontWeight: 700, fontSize: '0.8rem',
          fontFamily: theme.font.family, cursor: 'pointer', opacity: guardando ? 0.6 : 1,
        }}
      >
        <Icono nombre="balanza" inline size={14} />{guardando ? 'Guardando…' : 'Guardar dictamen'}
      </button>
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`, fontSize: '0.82rem', fontFamily: theme.font.family,
};

const Fila: React.FC<{ etiqueta: string; valor: string }> = ({ etiqueta, valor }) => (
  <div>
    <span style={{ color: theme.colors.textSecondary }}>{etiqueta}: </span>
    <span style={{ fontWeight: 600, color: theme.colors.textPrimary }}>{valor}</span>
  </div>
);

export default PanelCuraduria;
