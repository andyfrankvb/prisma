/**
 * Component: BuscadorLibros
 * File: src/frontend/components/visor/BuscadorLibros.tsx
 *
 * Panel lateral de la pestaña "Libros" — port fiel del sidebar-panel de
 * libros-lista.component.html (SID): Oficina + Sección/Tomo, buscar, y la
 * tarjeta "Imágenes" con rango (Ver/Descargar) y el listado numerado de
 * fojas del libro seleccionado.
 */
import React from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import * as s from './estilosSid';
import type { VisorDelegacion, VisorSeccion, VisorFoja, VisorLibroResumen } from '../../types';

interface Props {
  delegaciones: VisorDelegacion[];
  secciones:    VisorSeccion[];
  delegacionId: string;
  seccionId:    string;
  tomoQuery:    string;
  onDelegacionChange: (v: string) => void;
  onSeccionChange:    (v: string) => void;
  onTomoQueryChange:  (v: string) => void;
  onBuscar: () => void;
  buscando: boolean;

  libroSeleccionado: VisorLibroResumen | null;
  fojas:             VisorFoja[];
  cargandoFojas:     boolean;
  indiceActual:      number;
  onAbrirFoja: (indice: number) => void;

  rangoDesde: string;
  rangoHasta: string;
  onRangoDesdeChange: (v: string) => void;
  onRangoHastaChange: (v: string) => void;
  onVerRango:        () => void;
  onDescargarRango:  () => void;
  descargando: boolean;
}

export const BuscadorLibros: React.FC<Props> = ({
  delegaciones, secciones, delegacionId, seccionId, tomoQuery,
  onDelegacionChange, onSeccionChange, onTomoQueryChange, onBuscar, buscando,
  libroSeleccionado, fojas, cargandoFojas, indiceActual, onAbrirFoja,
  rangoDesde, rangoHasta, onRangoDesdeChange, onRangoHastaChange, onVerRango, onDescargarRango, descargando,
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
            <input style={s.input} value={tomoQuery} onChange={(e) => onTomoQueryChange(e.target.value)}
                   placeholder="Ej. CXLIV" onKeyDown={(e) => { if (e.key === 'Enter') onBuscar(); }} />
          </div>
        </div>

        <button style={s.botonPrimario} onClick={onBuscar} disabled={buscando || !delegacionId}>
          <Icono nombre="buscar" inline size={13} />{buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
    </div>

    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textSecondary }}>
          <Icono nombre="documento" inline size={13} />Imágenes
        </span>
        <span style={s.badge(`${theme.colors.primary}18`, theme.colors.primary)}>{fojas.length}</span>
      </div>

      <div style={s.cardBody}>
        {!libroSeleccionado ? (
          <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, margin: 0 }}>
            Selecciona un libro de la tabla para ver sus fojas.
          </p>
        ) : (
          <>
            <div style={{ marginBottom: '10px' }}>
              <label style={s.etiqueta}><Icono nombre="filtro" size={12} />Rango</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="number" min={1} max={fojas.length} value={rangoDesde} onChange={(e) => onRangoDesdeChange(e.target.value)}
                       style={{ ...s.input, borderRadius: theme.radius.sm, textAlign: 'center' }} placeholder="De" />
                <span style={{ color: theme.colors.textSecondary }}>–</span>
                <input type="number" min={1} max={fojas.length} value={rangoHasta} onChange={(e) => onRangoHastaChange(e.target.value)}
                       style={{ ...s.input, borderRadius: theme.radius.sm, textAlign: 'center' }} placeholder="A" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' }}>
                <button style={s.botonOutline(theme.colors.primary)} onClick={onVerRango} disabled={!rangoDesde}>
                  <Icono nombre="ojo" inline size={12} />Ver
                </button>
                <button style={s.botonOutline(theme.colors.alert.green)} onClick={onDescargarRango} disabled={descargando || !rangoDesde || !rangoHasta}>
                  <Icono nombre="descargar" inline size={12} />{descargando ? 'Descargando…' : 'Descargar'}
                </button>
              </div>
            </div>

            <div style={s.scrollLista}>
              {cargandoFojas ? (
                <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Cargando…</p>
              ) : fojas.map((foja, i) => (
                <div key={foja.id} style={s.itemLista(i === indiceActual)} onClick={() => onAbrirFoja(i)}>
                  <span style={s.itemListaNumero(i === indiceActual)}>{i + 1}</span>
                  <Icono nombre="documento" size={13} color={theme.colors.textSecondary} />
                  <span style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.colors.textPrimary }}>
                    {foja.numero_foja}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  </div>
);

export default BuscadorLibros;
