/**
 * Component: BuscadorInscripciones
 * File: src/frontend/components/visor/BuscadorInscripciones.tsx
 *
 * Panel lateral de la pestaña "Inscripciones" — port fiel del sidebar-panel
 * del "NUEVO VISUALIZADOR / INSCRIPCIONES" de libros-lista.component.html
 * (SID): Oficina + Sección/Tomo + Inscripción (número o rango "0001_0010")
 * + límite de resultados, y la tarjeta de la inscripción seleccionada.
 */
import React from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import * as s from './estilosSid';
import type { VisorDelegacion, VisorSeccion, VisorInscripcionConTomo } from '../../types';

interface Props {
  delegaciones: VisorDelegacion[];
  secciones:    VisorSeccion[];
  delegacionId: string;
  seccionId:    string;
  tomoQuery:    string;
  inscripcionQuery: string;
  limite:       string;
  onDelegacionChange: (v: string) => void;
  onSeccionChange:    (v: string) => void;
  onTomoQueryChange:  (v: string) => void;
  onInscripcionQueryChange: (v: string) => void;
  onLimiteChange: (v: string) => void;
  onBuscar: () => void;
  buscando: boolean;

  seleccionada: VisorInscripcionConTomo | null;
  onVer:        () => void;
  onLimpiar:    () => void;
}

const LIMITES = ['50', '100', '300', '500', '1000'];

export const BuscadorInscripciones: React.FC<Props> = ({
  delegaciones, secciones, delegacionId, seccionId, tomoQuery, inscripcionQuery, limite,
  onDelegacionChange, onSeccionChange, onTomoQueryChange, onInscripcionQueryChange, onLimiteChange, onBuscar, buscando,
  seleccionada, onVer, onLimpiar,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div style={s.card}>
      <div style={s.cardBody}>
        <div style={{ marginBottom: '12px' }}>
          <label style={s.etiqueta}><Icono nombre="edificio" size={13} />Oficina</label>
          <select style={s.input} value={delegacionId} onChange={(e) => onDelegacionChange(e.target.value)}>
            <option value="">Seleccionar…</option>
            {delegaciones.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={s.etiqueta}>Sección</label>
            <select style={s.input} value={seccionId} onChange={(e) => onSeccionChange(e.target.value)}>
              <option value="">Todas</option>
              {secciones.map((sec) => <option key={sec.id} value={sec.id}>{sec.nombre}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={s.etiqueta}>Tomo</label>
            <input style={s.input} value={tomoQuery} onChange={(e) => onTomoQueryChange(e.target.value)} placeholder="Ej. CXLIV" />
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={s.etiqueta}><Icono nombre="etiqueta" size={12} />Inscripción</label>
          <input style={s.input} value={inscripcionQuery} onChange={(e) => onInscripcionQueryChange(e.target.value)}
                 placeholder="0001 o 0001_0010" onKeyDown={(e) => { if (e.key === 'Enter') onBuscar(); }} />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={s.etiqueta}>Resultados a mostrar</label>
          <select style={s.input} value={limite} onChange={(e) => onLimiteChange(e.target.value)}>
            {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <button style={s.botonPrimario} onClick={onBuscar} disabled={buscando || !delegacionId}>
          <Icono nombre="buscar" inline size={13} />{buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
    </div>

    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textSecondary }}>
          <Icono nombre="documento" inline size={13} />Inscripción
        </span>
        <span style={s.badge(`${theme.colors.primary}18`, theme.colors.primary)}>
          {seleccionada ? String(seleccionada.numero_inscripcion).padStart(4, '0') : '0'}
        </span>
      </div>
      <div style={s.cardBody}>
        {!seleccionada ? (
          <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, margin: 0 }}>
            Selecciona una inscripción del listado.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
            <Fila etiqueta="Sección" valor={String(seleccionada.seccion_numero)} />
            <Fila etiqueta="Tomo" valor={seleccionada.numero_romano} />
            <Fila etiqueta="Volumen" valor={seleccionada.volumen ?? '—'} />
            <Fila etiqueta="Inscripción" valor={String(seleccionada.numero_inscripcion).padStart(4, '0')} />
            <Fila etiqueta="Archivo" valor={seleccionada.asignacion} />
            {seleccionada.observaciones && <Fila etiqueta="Observaciones" valor={seleccionada.observaciones} />}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '14px' }}>
          <button style={s.botonOutline(theme.colors.primary)} onClick={onVer} disabled={!seleccionada?.foja_id}>
            <Icono nombre="ojo" inline size={12} />Ver
          </button>
          <button style={s.botonOutline(theme.colors.textSecondary)} onClick={onLimpiar} disabled={!seleccionada}>
            <Icono nombre="cerrar" inline size={12} />Limpiar
          </button>
        </div>
      </div>
    </div>
  </div>
);

const Fila: React.FC<{ etiqueta: string; valor: string }> = ({ etiqueta, valor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
    <span style={{ color: theme.colors.textSecondary, flexShrink: 0 }}>{etiqueta}</span>
    <span style={{ fontWeight: 600, color: theme.colors.textPrimary, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valor}</span>
  </div>
);

export default BuscadorInscripciones;
