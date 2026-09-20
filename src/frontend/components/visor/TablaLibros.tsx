/**
 * Component: TablaLibros
 * File: src/frontend/components/visor/TablaLibros.tsx
 *
 * Panel de contenido de la pestaña "Libros" — port fiel de la tabla
 * "Libros Disponibles" de libros-lista.component.html (SID). Las columnas
 * Vol./Estatus/Observaciones de SID no tienen equivalente en el esquema de
 * PRISMA (no se migraron de VISAR); se muestran las que sí — Sección, Tomo,
 * Cajón, Fojas y Inscripciones.
 */
import React from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import * as s from './estilosSid';
import type { VisorLibroResumen } from '../../types';

interface Props {
  libros:    VisorLibroResumen[];
  seleccionado: VisorLibroResumen | null;
  cargando:  boolean;
  onSeleccionar: (libro: VisorLibroResumen) => void;
}

export const TablaLibros: React.FC<Props> = ({ libros, seleccionado, cargando, onSeleccionar }) => (
  <div style={s.card}>
    <div style={s.cardBody}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: theme.colors.primaryDark, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icono nombre="documento" size={18} color={theme.colors.primary} />Libros Disponibles
        </h2>
        <span style={s.badge(`${theme.colors.primary}18`, theme.colors.primary)}>{libros.length}</span>
      </div>

      <div style={s.tablaWrap}>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Sección</th>
              <th style={s.th}>Tomo</th>
              <th style={s.th}>Cajón</th>
              <th style={s.th}>Fojas</th>
              <th style={s.th}>Inscripciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td style={s.td} colSpan={5}>Cargando…</td></tr>
            ) : libros.length === 0 ? (
              <tr><td style={{ ...s.td, textAlign: 'center', color: theme.colors.textSecondary }} colSpan={5}>
                Busca una oficina para ver sus libros disponibles.
              </td></tr>
            ) : libros.map((libro) => (
              <tr key={libro.id} style={s.filaClicable(seleccionado?.id === libro.id)} onClick={() => onSeleccionar(libro)}>
                <td style={s.td}>{libro.seccion_nombre}</td>
                <td style={{ ...s.td, fontWeight: 700 }}>{libro.numero_romano}</td>
                <td style={s.td}>{libro.cajon ?? '—'}</td>
                <td style={s.td}>
                  {libro.total_fojas > 0 ? `${libro.foja_inicial} – ${libro.foja_final} (${libro.total_fojas})` : '—'}
                </td>
                <td style={s.td}>
                  <span style={s.badge(theme.colors.background, theme.colors.textSecondary)}>{libro.total_inscripciones}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default TablaLibros;
