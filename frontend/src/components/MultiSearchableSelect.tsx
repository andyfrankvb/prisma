/**
 * Componente: MultiSearchableSelect
 * Variante de SearchableSelect (mismo buscador, mismo look) para elegir
 * VARIOS valores de un catálogo largo en vez de uno solo. Cada fila lleva un
 * checkbox y el desplegable no se cierra al marcar, para poder elegir varios
 * seguidos; lo elegido se ve también como chips removibles debajo del campo.
 *
 * Es un componente aparte de SearchableSelect (no una prop nueva ahí) para no
 * arriesgar los filtros de un solo valor que ya lo usan en otros reportes.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../theme';
import type { SelectOption } from './SearchableSelect';

interface Props {
  values:       string[];                  // valores seleccionados
  options:      SelectOption[];
  onChange:     (values: string[]) => void;
  placeholder?: string;
  disabled?:    boolean;
  style?:       React.CSSProperties;
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const MultiSearchableSelect: React.FC<Props> = ({
  values, options, onChange, placeholder = 'Todos', disabled, style,
}) => {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const labelPorValor = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (v: string) => {
    if (selectedSet.has(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };
  const quitar = (v: string) => onChange(values.filter((x) => x !== v));

  const textoBoton = values.length === 0
    ? placeholder
    : values.length === 1
      ? (labelPorValor.get(values[0]) ?? values[0])
      : `${values.length} seleccionados`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          ...controlStyle,
          color:  values.length ? theme.colors.textPrimary : theme.colors.textSecondary,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{textoBoton}</span>
        <span style={{ marginLeft: 8, flexShrink: 0, color: theme.colors.textSecondary }}>▾</span>
      </button>

      {open && (
        <div style={dropdownStyle}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            style={searchInputStyle}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOpen(false); setQuery(''); }
              if (e.key === 'Enter' && filtered.length === 1) { e.preventDefault(); toggle(filtered[0].value); }
            }}
          />
          <div style={listStyle}>
            {filtered.length === 0 ? (
              <div style={emptyStyle}>Sin coincidencias</div>
            ) : filtered.map((o) => {
              const marcado = selectedSet.has(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  style={{
                    ...optionStyle,
                    backgroundColor: marcado ? '#EEF2FF' : 'transparent',
                    fontWeight:      marcado ? 700 : 400,
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '15px', height: '15px', borderRadius: '4px', flexShrink: 0,
                    border: `1.5px solid ${marcado ? theme.colors.primary : theme.colors.border}`,
                    backgroundColor: marcado ? theme.colors.primary : 'transparent',
                    color: '#fff', fontSize: '0.65rem', lineHeight: 1,
                  }}>
                    {marcado ? '✓' : ''}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
          {values.map((v) => (
            <span key={v} style={chipStyle}>
              {labelPorValor.get(v) ?? v}
              <button
                type="button"
                onClick={() => quitar(v)}
                aria-label={`Quitar ${v}`}
                style={chipCloseStyle}
              >
                ✕
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} style={limpiarStyle}>
            Limpiar selección
          </button>
        </div>
      )}
    </div>
  );
};

// ── estilos ──────────────────────────────────────────────
const controlStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  width: '100%', padding: '10px 12px', fontSize: '0.9rem',
  border: `1px solid ${theme.colors.border}`, borderRadius: '8px',
  backgroundColor: '#fff', fontFamily: theme.font.family, textAlign: 'left',
};
const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
  backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`,
  borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
};
const searchInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '0.85rem',
  border: 'none', borderBottom: `1px solid ${theme.colors.border}`,
  outline: 'none', fontFamily: theme.font.family,
};
const listStyle: React.CSSProperties = { maxHeight: '240px', overflowY: 'auto', padding: '4px' };
const optionStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  width: '100%', textAlign: 'left', padding: '8px 10px',
  border: 'none', background: 'transparent', borderRadius: '6px', cursor: 'pointer',
  fontSize: '0.85rem', fontFamily: theme.font.family, color: theme.colors.textPrimary,
};
const emptyStyle: React.CSSProperties = { padding: '14px', textAlign: 'center', fontSize: '0.82rem', color: theme.colors.textSecondary };
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '3px 6px 3px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
  backgroundColor: '#FDE8EF', color: theme.colors.primary,
};
const chipCloseStyle: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', color: theme.colors.primary,
  fontSize: '0.68rem', padding: '2px', lineHeight: 1, opacity: 0.7,
};
const limpiarStyle: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', color: theme.colors.textSecondary,
  fontSize: '0.72rem', textDecoration: 'underline', padding: '3px 0',
};
