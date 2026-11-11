/**
 * Component: EncabezadoImpresion
 * File: src/frontend/components/EncabezadoImpresion.tsx
 *
 * Encabezado oficial para los reportes del Módulo de Reportes al imprimir o
 * "Guardar como PDF" (un destino más del diálogo nativo de impresión, por
 * eso un solo botón — ver BotonImprimirReporte — cubre ambos casos).
 *
 * Solo existe en el papel: en pantalla no ocupa espacio (clase
 * `solo-impresion`, definida en frontend/src/global.css). Todo reporte nuevo
 * de este módulo debe montar este mismo componente al inicio de su contenido
 * imprimible para que los tres —Conciliación de Ingresos, FRE y los que
 * sigan— salgan con el mismo formato y los mismos logos.
 */

import React from 'react';
import { theme } from '../theme';

interface Props {
  titulo:     string;
  subtitulo?: string;
  filtros?:   string;
}

export const EncabezadoImpresion: React.FC<Props> = ({ titulo, subtitulo, filtros }) => (
  <div className="solo-impresion" style={{ marginBottom: '20px' }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px',
      paddingBottom: '12px', borderBottom: `3px solid ${theme.colors.primary}`,
    }}>
      <img src="/PRISMA1.png" alt="PRISMA — Plataforma de Control y Seguimiento" style={{ height: '60px', width: 'auto', objectFit: 'contain' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
        <img src="/SIQROO.png" alt="SIQROO — Sistema Inmobiliario de Quintana Roo" style={{ height: '52px', width: 'auto', objectFit: 'contain' }} />
        <img src="/RPPC.png" alt="Registro Público de la Propiedad y del Comercio — Gobierno del Estado" style={{ height: '50px', width: 'auto', objectFit: 'contain' }} />
      </div>
    </div>
    <div style={{ marginTop: '12px' }}>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: theme.colors.primary }}>{titulo}</div>
      {subtitulo && (
        <div style={{ fontSize: '0.82rem', color: theme.colors.textSecondary, marginTop: '2px' }}>{subtitulo}</div>
      )}
      <div style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, marginTop: '6px' }}>
        Generado el {new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}
        {filtros ? ` · ${filtros}` : ''}
      </div>
    </div>
  </div>
);
