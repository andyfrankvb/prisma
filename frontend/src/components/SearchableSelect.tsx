/**
 * Componente: SearchableSelect
 * Un desplegable con buscador integrado — pensado para catálogos que crecen
 * (dependencias, remitentes, destinatarios). Filtra por texto sin acentos,
 * permite una acción opcional de "agregar nuevo" al final de la lista.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../theme';

export interface SelectOption { value: string; label: string; }

interface Props {
  value:        string;                    // valor seleccionado ('' = ninguno)
  options:      SelectOption[];
  onChange:     (value: string) => void;
  placeholder?: string;
  disabled?:    boolean;
  addLabel?:    string;                    // texto de la acción "agregar nuevo"
  onAdd?:       () => void;                // se dispara al elegir "agregar nuevo"
  style?:       React.CSSProperties;
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const SearchableSelect: React.FC<Props> = ({
  value, options, onChange, placeholder = 'Selecciona…', disabled, addLabel, onAdd, style,
}) => {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q));
  }, [options, query]);

  // Cerrar al hacer clic fuera
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

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          ...controlStyle,
          color:  selected ? theme.colors.textPrimary : theme.colors.textSecondary,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
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
              if (e.key === 'Enter' && filtered.length === 1) { e.preventDefault(); pick(filtered[0].value); }
            }}
          />
          <div style={listStyle}>
            {filtered.length === 0 ? (
              <div style={emptyStyle}>Sin coincidencias</div>
            ) : filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => pick(o.value)}
                style={{
                  ...optionStyle,
                  backgroundColor: o.value === value ? '#EEF2FF' : 'transparent',
                  fontWeight:      o.value === value ? 700 : 400,
                }}
              >
                {o.label}
              </button>
            ))}
            {onAdd && (
              <button
                type="button"
                onClick={() => { setOpen(false); setQuery(''); onAdd(); }}
                style={addStyle}
              >
                {addLabel ?? 'Agregar nuevo…'}
              </button>
            )}
          </div>
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
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
  fontSize: '0.85rem', border: 'none', borderRadius: '6px', cursor: 'pointer',
  color: theme.colors.textPrimary, fontFamily: theme.font.family,
};
const addStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px',
  fontSize: '0.82rem', border: 'none', borderTop: `1px solid ${theme.colors.border}`,
  marginTop: '4px', cursor: 'pointer', color: theme.colors.primary,
  backgroundColor: 'transparent', fontWeight: 600, fontFamily: theme.font.family,
};
const emptyStyle: React.CSSProperties = {
  padding: '12px', textAlign: 'center', fontSize: '0.8rem',
  color: theme.colors.textSecondary, fontStyle: 'italic',
};
