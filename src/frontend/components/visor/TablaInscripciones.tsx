/**
 * Component: TablaInscripciones
 * File: src/frontend/components/visor/TablaInscripciones.tsx
 *
 * Port fiel de la tabla "Inscripciones Disponibles" de
 * libros-lista.component.html (SID): clic selecciona, doble clic abre
 * directo el visor.
 */
import React from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import * as s from './estilosSid';
import type { VisorInscripcionConTomo } from '../../types';
import { etiquetaInscripcion } from './etiquetas';

interface Props {
  inscripciones: VisorInscripcionConTomo[];
  seleccionada:  VisorInscripcionConTomo | null;
  cargando:      boolean;
  onSeleccionar: (insc: VisorInscripcionConTomo) => void;
  onAbrir:       (insc: VisorInscripcionConTomo) => void;
}

export const TablaInscripciones: React.FC<Props> = ({ inscripciones, seleccionada, cargando, onSeleccionar, onAbrir }) => (
  <div style={s.card}>
    <div style={s.cardBody}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: theme.colors.primaryDark, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icono nombre="documento" size={18} color={theme.colors.primary} />Inscripciones Disponibles
        </h2>
        <span style={s.badge(`${theme.colors.primary}18`, theme.colors.primary)}>{inscripciones.length}</span>
      </div>

      <div style={s.tablaWrap}>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Sección</th>
              <th style={s.th}>Tomo</th>
              <th style={s.th}>Vol.</th>
              <th style={s.th}>Inscripción</th>
              <th style={s.th}>Archivo</th>
              <th style={s.th}>Digitalizaciones y observaciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td style={s.td} colSpan={6}>Consultando inscripciones…</td></tr>
            ) : inscripciones.length === 0 ? (
              <tr><td style={{ ...s.td, textAlign: 'center', color: theme.colors.textSecondary }} colSpan={6}>
                Realiza una búsqueda para mostrar inscripciones disponibles.
              </td></tr>
            ) : inscripciones.map((insc) => (
              <tr
                key={insc.id}
                style={s.filaClicable(seleccionada?.id === insc.id)}
                onClick={() => onSeleccionar(insc)}
                onDoubleClick={() => onAbrir(insc)}
              >
                <td style={s.td}>{insc.seccion_numero}</td>
                <td style={{ ...s.td, fontWeight: 700 }}>{insc.numero_romano}</td>
                <td style={s.td}>{insc.volumen ?? '—'}</td>
                <td style={s.td}>
                  <span style={s.badge(theme.colors.background, theme.colors.textSecondary)}>
                    {etiquetaInscripcion(insc)}
                  </span>
                </td>
                <td style={{ ...s.td, maxWidth: '220px' }} title={insc.asignacion}>
                  {!insc.foja_id && <Icono nombre="alerta" inline size={11} color={theme.colors.alert.yellow} />}
                  {insc.asignacion}
                </td>
                {/*
                  De qué campañas hay documento y qué reportó quien digitalizó
                  cada uno. Va en el listado y no solo al abrir: una observación
                  como "faltó actualizar las anotaciones marginales de la foja 2"
                  dice que el archivo no refleja el libro físico, y eso hay que
                  verlo antes de elegir cuál consultar.
                */}
                <td style={{ ...s.td, maxWidth: '360px' }}>
                  {(insc.digitalizaciones ?? []).length === 0 ? (
                    <span style={{ color: theme.colors.textSecondary }}>sin documento</span>
                  ) : (insc.digitalizaciones ?? []).map((d) => (
                    <div key={d.clave} style={{ marginBottom: '3px' }}>
                      <span style={s.badge(theme.colors.background, theme.colors.textSecondary)}>
                        {d.nombre}
                      </span>
                      {d.observaciones && (
                        <span
                          style={{ marginLeft: '6px', fontSize: '0.74rem', color: theme.colors.textSecondary }}
                          title={d.observaciones}
                        >
                          {d.observaciones.length > 70 ? `${d.observaciones.slice(0, 70)}…` : d.observaciones}
                        </span>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default TablaInscripciones;
