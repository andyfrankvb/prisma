/**
 * Component: SelectorVersion
 * File: src/frontend/components/visor/SelectorVersion.tsx
 *
 * Elegir explícitamente qué versión de digitalización ver (V2009 /
 * V2022_FALTANTE / V3_VALIDADA), marcando cuál es la dictaminada.
 */
import React from 'react';
import { theme } from '../../theme';
import type { VersionDigitalizacion, VisorImagenFoja, VisorDictamenVersion } from '../../types';

const ETIQUETAS: Record<VersionDigitalizacion, string> = {
  V2009:          'V2009 — Original',
  V2022_FALTANTE: 'V2022 — Faltante',
  V3_VALIDADA:    'V3 — Validada',
};

interface Props {
  imagenesDisponibles: VisorImagenFoja[];
  dictamen:            VisorDictamenVersion | null;
  versionSeleccionada: VersionDigitalizacion | undefined;
  onCambiar:           (version: VersionDigitalizacion | undefined) => void;
}

export const SelectorVersion: React.FC<Props> = ({ imagenesDisponibles, dictamen, versionSeleccionada, onCambiar }) => {
  if (imagenesDisponibles.length <= 1) return null;

  return (
    <select
      value={versionSeleccionada ?? ''}
      onChange={(e) => onCambiar((e.target.value || undefined) as VersionDigitalizacion | undefined)}
      style={{
        border: '1px solid rgba(255,255,255,0.35)', borderRadius: theme.radius.sm, padding: '6px 8px',
        fontSize: '0.78rem', fontFamily: theme.font.family, color: theme.colors.white,
        background: 'rgba(255,255,255,0.1)',
      }}
      title="Versión de digitalización"
    >
      <option value="">Automática{dictamen ? ` (dictaminada: ${ETIQUETAS[dictamen.version_seleccionada]})` : ''}</option>
      {imagenesDisponibles.map((img) => (
        <option key={img.version} value={img.version}>
          {ETIQUETAS[img.version]}{dictamen?.version_seleccionada === img.version ? ' ✓' : ''}
        </option>
      ))}
    </select>
  );
};

export default SelectorVersion;
