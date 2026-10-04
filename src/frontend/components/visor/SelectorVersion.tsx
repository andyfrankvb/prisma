/**
 * Component: SelectorVersion
 * File: src/frontend/components/visor/SelectorVersion.tsx
 *
 * Elegir explícitamente de qué campaña de digitalización ver un documento,
 * marcando cuál dictaminó Jurídico.
 *
 * El nombre de cada campaña viaja con la imagen (`campania_nombre`) y ya no
 * está escrito aquí: las campañas viven en la base, y la lista fija de tres que
 * había dejaba sin etiqueta a todo el acervo real.
 */
import React from 'react';
import { theme } from '../../theme';
import type { VersionDigitalizacion, VisorImagenFoja, VisorDictamenVersion } from '../../types';

/**
 * Lo que se muestra de una campaña: su nombre con el año cuando lo tiene. Si la
 * versión no está en el catálogo se cae a la clave cruda, para que el documento
 * siga siendo elegible en vez de aparecer como una opción en blanco.
 */
function etiqueta(img: VisorImagenFoja): string {
  if (!img.campania_nombre) return img.version;
  return img.campania_anio ? `${img.campania_nombre} (${img.campania_anio})` : img.campania_nombre;
}

interface Props {
  imagenesDisponibles: VisorImagenFoja[];
  dictamen:            VisorDictamenVersion | null;
  versionSeleccionada: VersionDigitalizacion | undefined;
  onCambiar:           (version: VersionDigitalizacion | undefined) => void;
}

export const SelectorVersion: React.FC<Props> = ({ imagenesDisponibles, dictamen, versionSeleccionada, onCambiar }) => {
  if (imagenesDisponibles.length <= 1) return null;

  const dictaminada = dictamen
    ? imagenesDisponibles.find((i) => i.version === dictamen.version_seleccionada)
    : undefined;

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
      <option value="">
        Automática{dictaminada ? ` (dictaminada: ${etiqueta(dictaminada)})` : ''}
      </option>
      {imagenesDisponibles.map((img) => (
        <option key={img.version} value={img.version}>
          {etiqueta(img)}{dictamen?.version_seleccionada === img.version ? ' ✓' : ''}
        </option>
      ))}
    </select>
  );
};

export default SelectorVersion;
