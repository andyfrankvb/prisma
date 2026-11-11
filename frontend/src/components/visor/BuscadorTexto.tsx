/**
 * Component: BuscadorTexto
 * File: src/frontend/components/visor/BuscadorTexto.tsx
 *
 * Buscar un documento por lo que dice adentro.
 *
 * Hasta ahora al Visor solo se llegaba sabiendo el tomo y la inscripción. Esto
 * permite encontrar un acta por un nombre, un predio o un juzgado, que es como
 * se busca cuando no se tiene el dato exacto. Sirve igual para inscripciones y
 * para libros: lo que se busca es el texto de la foja.
 *
 * Solo encuentra lo que ya está transcrito, y por eso la pantalla dice siempre
 * cuántos documentos lo están: sin ese dato, no encontrar nada se confunde con
 * que lo buscado no exista.
 */
import React from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import * as s from './estilosSid';
import type { VisorResultadoTexto } from '../../types';

interface Props {
  texto:        string;
  onTextoChange: (v: string) => void;
  onBuscar:     () => void;
  buscando:     boolean;
  resultados:   VisorResultadoTexto[];
  transcritos:  number;
  documentos:   number;
  busco:        boolean;
  onAbrir:      (r: VisorResultadoTexto) => void;
}

export const BuscadorTexto: React.FC<Props> = ({
  texto, onTextoChange, onBuscar, buscando, resultados, transcritos, documentos, busco, onAbrir,
}) => {
  const porcentaje = documentos > 0 ? (transcritos / documentos) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      <div style={{ ...s.card, padding: '16px 18px' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); onBuscar(); }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: '1 1 320px' }}>
            <label htmlFor="busqueda-texto" style={s.etiqueta}>Buscar en el contenido</label>
            <input
              id="busqueda-texto"
              type="search"
              value={texto}
              onChange={(e) => onTextoChange(e.target.value)}
              placeholder="un nombre, un predio, un juzgado…"
              style={s.input}
            />
          </div>
          <button type="submit" disabled={buscando || !texto.trim()} style={s.botonPrimario}>
            <Icono nombre="buscar" inline />{buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </form>

        <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
          Entre comillas busca la frase exacta; con un guion delante excluye una palabra.
          No distingue acentos, que el reconocimiento de texto suele equivocar.
        </p>
      </div>

      {/*
        La cobertura va siempre a la vista, no solo cuando no hay resultados: es
        la diferencia entre "no existe" y "todavía no se ha transcrito", y quien
        consulta tiene que poder distinguirlo antes de concluir nada.
      */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '9px 12px', borderRadius: theme.radius.sm,
        backgroundColor: porcentaje < 50 ? '#FDF4E3' : theme.colors.background,
        border: `1px solid ${porcentaje < 50 ? '#E8CF9B' : theme.colors.border}`,
        fontSize: '0.74rem', color: theme.colors.textSecondary,
      }}>
        <Icono nombre={porcentaje < 50 ? 'alerta' : 'documento'} inline />
        <span>
          Se busca solo entre los documentos transcritos: <strong>{transcritos.toLocaleString('es-MX')}</strong>
          {' '}de {documentos.toLocaleString('es-MX')}
          {porcentaje < 50 && ' — lo que no esté transcrito no aparecerá aquí aunque exista.'}
        </span>
      </div>

      {busco && !buscando && resultados.length === 0 && (
        <div style={{ ...s.card, padding: '22px', textAlign: 'center', color: theme.colors.textSecondary, fontSize: '0.82rem' }}>
          Sin coincidencias entre los documentos transcritos.
        </div>
      )}

      {resultados.length > 0 && (
        <div style={{ ...s.card, overflow: 'hidden' }}>
          <div style={{ padding: '10px 18px', borderBottom: `1px solid ${theme.colors.border}`, fontSize: '0.76rem', color: theme.colors.textSecondary }}>
            {resultados.length} documento{resultados.length === 1 ? '' : 's'} con coincidencias
          </div>

          {resultados.map((r, i) => (
            <button
              key={`${r.foja_id}-${r.version}`}
              onClick={() => onAbrir(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '14px 18px', border: 'none', background: 'none',
                borderBottom: i < resultados.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                fontFamily: theme.font.family,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <strong style={{ fontSize: '0.84rem', color: theme.colors.textPrimary }}>
                  {r.asignacion ?? `Tomo ${r.numero_romano} · foja ${r.numero_foja}`}
                </strong>
                <span style={s.badge(theme.colors.background, theme.colors.textSecondary)}>
                  {r.delegacion} · Sección {r.seccion_numero}
                </span>
                <span style={s.badge(theme.colors.background, theme.colors.textSecondary)}>
                  {r.campania_nombre ?? r.version}
                </span>
                {!r.asignacion && (
                  <span style={s.badge(theme.colors.background, theme.colors.textSecondary)}>libro</span>
                )}
              </div>
              {/*
                El fragmento viene del servidor con <b> en las coincidencias, y es
                texto reconocido de un escaneo: no lleva etiquetas propias.
              */}
              <p
                style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary, lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: r.fragmento }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default BuscadorTexto;
