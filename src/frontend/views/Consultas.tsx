/**
 * View: Consultas (Consulta Pública SIQROO)
 * File: src/frontend/views/Consultas.tsx
 *
 * Migrado desde SID (src/app/views/pages/consultas/consultas.component.ts).
 * Histórico de búsquedas hechas por el público: filtro por código de acceso,
 * texto de búsqueda, nombre y oficina, con paginación servida por el backend
 * (igual que el legacy — la tabla nunca pagina en el cliente).
 * Reconstruido con el theme y los componentes base de PRISMA — sin
 * Bootstrap, jQuery, DataTables, SweetAlert, NobleUI ni Feather Icons.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from '../components/Icono';
import { theme } from '../theme';
import { getConsultas } from '../api';
import type { Consulta } from '../types';

// Mismo catálogo que el legacy (consultas.component.ts) — texto libre en la
// BD, pero el filtro trabaja con el id numérico de oficina.
const OFICINAS: { id: number; nombre: string }[] = [
  { id: 1, nombre: 'Chetumal' },
  { id: 2, nombre: 'Cancún' },
  { id: 3, nombre: 'Playa del Carmen' },
  { id: 4, nombre: 'Cozumel' },
];

const DEBOUNCE_MS = 300;
const PER_PAGE    = 20;

interface Filtros {
  codigo_acceso:   string;
  filtro_busqueda: string;
  nombre_completo: string;
  busqueda:        string;
  oficina:         string;
}

const FILTROS_VACIOS: Filtros = {
  codigo_acceso: '', filtro_busqueda: '', nombre_completo: '', busqueda: '', oficina: '',
};

// ── estilos ──────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  background:   theme.colors.surface,
  borderRadius: theme.radius.lg,
  boxShadow:    theme.shadow.md,
  border:       `1px solid ${theme.colors.border}`,
  overflow:     'hidden',
};

const toolbar: React.CSSProperties = {
  background:   `linear-gradient(180deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 140%)`,
  borderRadius: theme.radius.lg,
  padding:      '16px',
  marginBottom: '16px',
  boxShadow:    theme.shadow.md,
};

const grupoFiltros: React.CSSProperties = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap:                 '10px',
};

const inputSobreGuinda: React.CSSProperties = {
  border:       '1px solid rgba(255,255,255,0.35)',
  borderRadius: theme.radius.sm,
  padding:      '8px 10px',
  fontSize:     '0.85rem',
  fontFamily:   theme.font.family,
  color:        theme.colors.white,
  background:   'rgba(255,255,255,0.1)',
  width:        '100%',
  boxSizing:    'border-box',
};

const labelSobreGuinda: React.CSSProperties = {
  display:      'block',
  fontSize:     '0.7rem',
  fontWeight:   700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color:        'rgba(255,255,255,0.85)',
  marginBottom: '4px',
};

const btnLimpiar: React.CSSProperties = {
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '6px',
  padding:      '8px 14px',
  borderRadius: '999px',
  fontSize:     '0.78rem',
  fontWeight:   700,
  fontFamily:   theme.font.family,
  cursor:       'pointer',
  border:       '1px solid rgba(255,255,255,0.35)',
  background:   'rgba(255,255,255,0.08)',
  color:        theme.colors.white,
  whiteSpace:   'nowrap',
};

const btnIcono: React.CSSProperties = {
  display:         'inline-flex',
  alignItems:      'center',
  justifyContent:  'center',
  width:            30,
  height:           30,
  borderRadius:    theme.radius.sm,
  border:          `1px solid ${theme.colors.border}`,
  background:      `${theme.colors.primary}0f`,
  color:           theme.colors.primary,
  cursor:          'pointer',
};

const th: React.CSSProperties = {
  textAlign:    'left',
  padding:      '10px 14px',
  fontSize:     '0.72rem',
  fontWeight:   700,
  letterSpacing:'0.04em',
  textTransform:'uppercase',
  color:        theme.colors.white,
  whiteSpace:   'nowrap',
};

const td: React.CSSProperties = {
  padding:      '10px 14px',
  fontSize:     '0.85rem',
  color:        theme.colors.textPrimary,
  borderBottom: `1px solid ${theme.colors.border}`,
  verticalAlign: 'top',
};

const badge: React.CSSProperties = {
  display:         'inline-flex',
  alignItems:      'center',
  padding:         '3px 10px',
  borderRadius:    '999px',
  fontSize:        '0.72rem',
  fontWeight:      700,
  fontFamily:      theme.font.family,
  backgroundColor: `${theme.colors.primary}18`,
  color:           theme.colors.primary,
};

const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
};

const nombreOficina = (id: string | null): string => {
  if (id == null || id === '') return '—';
  return OFICINAS.find((o) => String(o.id) === id)?.nombre ?? id;
};

// ── vista ────────────────────────────────────────────────────────

export const Consultas: React.FC = () => {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [pagina,  setPagina]  = useState(1);

  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [cargando,  setCargando]  = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [total,     setTotal]     = useState(0);
  const [perPage,   setPerPage]   = useState(PER_PAGE);
  const [lastPage,  setLastPage]  = useState(1);

  // Búsqueda "en tiempo real" con debounce — igual que el legacy.
  useEffect(() => {
    const timer = setTimeout(() => {
      setCargando(true);
      setError(null);
      getConsultas({
        codigo_acceso:   filtros.codigo_acceso.trim()   || undefined,
        filtro_busqueda: filtros.filtro_busqueda.trim() || undefined,
        nombre_completo: filtros.nombre_completo.trim() || undefined,
        busqueda:        filtros.busqueda.trim()        || undefined,
        oficina:         filtros.oficina || undefined,
        page:            pagina,
        per_page:        PER_PAGE,
      })
        .then((res) => {
          setConsultas(res.data ?? []);
          setTotal(res.meta?.total ?? 0);
          setPerPage(res.meta?.per_page ?? PER_PAGE);
          setLastPage(res.meta?.last_page ?? 1);
        })
        .catch((e: Error) => setError(e.message || 'Error al cargar consultas.'))
        .finally(() => setCargando(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filtros, pagina]);

  const cambiarFiltro = (campo: keyof Filtros, valor: string) => {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  };

  const limpiarFiltros = () => {
    setFiltros(FILTROS_VACIOS);
    setPagina(1);
  };

  const irAPagina = (p: number) => {
    if (p < 1 || p > lastPage) return;
    setPagina(p);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1280px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: theme.colors.primaryDark, fontFamily: theme.font.family, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icono nombre="buscar" size={22} color={theme.colors.primary} /> Histórico de Consulta Pública SIQROO
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={badge}>{total} registro{total === 1 ? '' : 's'}</span>
          <button
            type="button"
            onClick={() => navigate('/consultas/vigilancia')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '999px', border: `1px solid ${theme.colors.primary}`,
              background: 'transparent', color: theme.colors.primary,
              fontSize: '0.78rem', fontWeight: 700, fontFamily: theme.font.family, cursor: 'pointer',
            }}
          >
            <Icono nombre="candado" size={14} /> Catálogo de Vigilancia
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }}
          onClick={() => setError(null)}
        >
          {error} <span style={{ opacity: 0.7 }}>(clic para cerrar)</span>
        </div>
      )}

      {/* Filtros */}
      <div style={toolbar}>
        <div style={grupoFiltros}>
          <div>
            <label style={labelSobreGuinda}>Código de acceso</label>
            <input
              style={inputSobreGuinda}
              placeholder="ABC123"
              value={filtros.codigo_acceso}
              onChange={(e) => cambiarFiltro('codigo_acceso', e.target.value)}
            />
          </div>
          <div>
            <label style={labelSobreGuinda}>Filtro de búsqueda</label>
            <input
              style={inputSobreGuinda}
              placeholder="vigente, folio, etc."
              value={filtros.filtro_busqueda}
              onChange={(e) => cambiarFiltro('filtro_busqueda', e.target.value)}
            />
          </div>
          <div>
            <label style={labelSobreGuinda}>Nombre completo</label>
            <input
              style={inputSobreGuinda}
              placeholder="Buscar por nombre…"
              value={filtros.nombre_completo}
              onChange={(e) => cambiarFiltro('nombre_completo', e.target.value)}
            />
          </div>
          <div>
            <label style={labelSobreGuinda}>Búsqueda (Titular, Tomo, RFC, Folio)</label>
            <input
              style={inputSobreGuinda}
              placeholder="Buscar en datos JSON…"
              value={filtros.busqueda}
              onChange={(e) => cambiarFiltro('busqueda', e.target.value)}
            />
          </div>
          <div>
            <label style={labelSobreGuinda}>Oficina</label>
            <select
              style={inputSobreGuinda}
              value={filtros.oficina}
              onChange={(e) => cambiarFiltro('oficina', e.target.value)}
            >
              <option value="">— Todas las oficinas —</option>
              {OFICINAS.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button style={btnLimpiar} onClick={limpiarFiltros} type="button">
            <Icono nombre="refrescar" size={14} color={theme.colors.white} /> Limpiar filtros
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div style={panel}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.primary }}>
                <th style={{ ...th, width: '48px' }}>#</th>
                <th style={th}>Nombre</th>
                <th style={th}>Código</th>
                <th style={th}>Filtro</th>
                <th style={th}>Oficina</th>
                <th style={th}>Hora</th>
                <th style={th}>Búsqueda</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td style={td} colSpan={7}>Cargando…</td></tr>
              ) : consultas.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }} colSpan={7}>Sin resultados para mostrar.</td></tr>
              ) : (
                consultas.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ ...td, color: theme.colors.textSecondary, fontWeight: 700 }}>
                      {(pagina - 1) * perPage + (i + 1)}
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{c.nombre_completo}</td>
                    <td style={td}><span style={badge}>{c.codigo_acceso}</span></td>
                    <td style={td}>{c.filtro_busqueda || <span style={{ color: theme.colors.textSecondary }}>—</span>}</td>
                    <td style={td}>{nombreOficina(c.oficina)}</td>
                    <td style={{ ...td, color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>{fmtFecha(c.hora_busqueda)}</td>
                    <td style={{ ...td, maxWidth: '320px' }}>
                      {Object.entries(c.busqueda ?? {}).length === 0 ? (
                        <span style={{ color: theme.colors.textSecondary }}>—</span>
                      ) : (
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                          {Object.entries(c.busqueda).map(([clave, valor]) => (
                            <li key={clave} style={{ marginBottom: '3px' }}>
                              <span style={{ ...badge, marginRight: '6px' }}>{clave}</span>
                              <span>{String(valor)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
          padding: '10px 14px', fontSize: '0.78rem', color: theme.colors.textSecondary, borderTop: `1px solid ${theme.colors.border}`,
        }}>
          <span>
            {total === 0
              ? 'Sin resultados'
              : `Página ${pagina} de ${lastPage} — mostrando ${consultas.length} de ${total} registros`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button style={btnIcono} disabled={pagina === 1} onClick={() => irAPagina(1)}>
              <Icono nombre="regresarIzq" size={14} color={theme.colors.primary} />
            </button>
            <button style={btnIcono} disabled={pagina === 1} onClick={() => irAPagina(pagina - 1)}>
              <Icono nombre="flechaIzq" size={14} color={theme.colors.primary} />
            </button>
            <span style={{ minWidth: '52px', textAlign: 'center', fontWeight: 700, color: theme.colors.textPrimary }}>
              {pagina} / {lastPage}
            </span>
            <button style={btnIcono} disabled={pagina === lastPage} onClick={() => irAPagina(pagina + 1)}>
              <Icono nombre="flechaDer" size={14} color={theme.colors.primary} />
            </button>
            <button style={btnIcono} disabled={pagina === lastPage} onClick={() => irAPagina(lastPage)}>
              <Icono nombre="regresarDer" size={14} color={theme.colors.primary} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Consultas;
