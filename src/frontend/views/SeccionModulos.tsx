/**
 * View: SeccionModulos
 * Gestión de módulos habilitados por usuario — usado dentro del Dashboard_SuperAdmin.
 * File: src/frontend/views/SeccionModulos.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icono } from '../components/Icono';
import { theme } from '../theme';
import type { RolUsuario, ModuloConEstado } from '../types';
import type { UsuarioAdmin } from '../api';
import { adminListarUsuarios } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── ROL labels / colors ───────────────────────────────────────

/** Roles que aparecen en el filtro, en el orden en que se usan. */
const ROLES_FILTRO: RolUsuario[] = [
  'OFICIAL', 'ENCARGADO', 'JURIDICO', 'SECRETARIA', 'DIRECTOR', 'OPERATIVO', 'PARTICULAR', 'SUPERADMIN',
];

/** Campos de la barra de filtros, igual que en Administración. */
const filtroInput: React.CSSProperties = {
  padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '7px',
  fontSize: '0.82rem', fontFamily: theme.font.family, boxSizing: 'border-box', minWidth: 0,
};

const ROL_LABEL: Record<RolUsuario, string> = {
  OFICIAL:    'Oficial de Partes',
  ENCARGADO:  'Director Jurídico',
  JURIDICO:   'Área Jurídica',
  SECRETARIA: 'Secretaría',
  DIRECTOR:   'Dirección General',
  SUPERADMIN: 'Super Administrador',
  OPERATIVO:  'Operativo',
  PARTICULAR: 'Particular',
};

const ROL_COLOR: Record<RolUsuario, { bg: string; text: string }> = {
  PARTICULAR: { bg: '#EDE9E4', text: '#3D3935' },
  OFICIAL:    { bg: '#FEF3C7', text: '#92400E' },
  ENCARGADO:  { bg: '#FDE8EF', text: '#AB0A3D' },
  JURIDICO:   { bg: '#D1FAE5', text: '#065F46' },
  SECRETARIA: { bg: '#EFEDEA', text: '#3D3935' },
  DIRECTOR:   { bg: '#EDE9E4', text: '#3D3935' },
  SUPERADMIN: { bg: '#440412', text: '#fff'    },
  OPERATIVO:  { bg: '#F0FDF4', text: '#166534' },
};

// ── Component ─────────────────────────────────────────────────

export const SeccionModulos: React.FC = () => {
  const [usuarios,       setUsuarios]       = useState<UsuarioAdmin[]>([]);
  const [total,          setTotal]          = useState(0);
  const [page,           setPage]           = useState(1);
  const [loading,        setLoading]        = useState(false);
  const [listError,      setListError]      = useState<string | null>(null);

  const [selectedUser,   setSelectedUser]   = useState<UsuarioAdmin | null>(null);
  const [modulos,        setModulos]        = useState<ModuloConEstado[]>([]);
  const [modulosLoading, setModulosLoading] = useState(false);
  const [toggleErrors,   setToggleErrors]   = useState<Record<number, string>>({});
  const [pillsTick,      setPillsTick]      = useState(0);

  // ── Filtros: buscar por persona y acotar por el módulo que maneja ──
  const [search,     setSearch]     = useState('');
  const [searchDeb,  setSearchDeb]  = useState('');
  const [filtroMod,  setFiltroMod]  = useState('');
  const [filtroRol,  setFiltroRol]  = useState('');
  const [catalogo,   setCatalogo]   = useState<{ id: number; clave: string; nombre_display: string }[]>([]);

  useEffect(() => {
    const t = setTimeout(() => { setSearchDeb(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // El catálogo de módulos alimenta el selector.
  useEffect(() => {
    apiFetch<{ data: { id: number; clave: string; nombre_display: string }[] }>('/admin/modulos')
      .then((r) => setCatalogo(r.data))
      .catch(() => setCatalogo([]));
  }, []);

  const isMobile = useIsMobile();
  const LIMIT = 20;

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await adminListarUsuarios({
        page, limit: LIMIT,
        search: searchDeb || undefined,
        modulo: filtroMod || undefined,
        rol:    filtroRol || undefined,
      });
      setUsuarios(res.data);
      setTotal(res.meta.total);
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, searchDeb, filtroMod, filtroRol]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  const fetchModulos = useCallback(async (userId: number) => {
    setModulosLoading(true);
    setToggleErrors({});
    try {
      const res = await apiFetch<{ data: ModuloConEstado[] }>(`/admin/usuarios/${userId}/modulos`);
      setModulos(res.data);
      modulosCache[userId] = res.data;
      setPillsTick((t) => t + 1);
    } catch (err: any) {
      setModulos([]);
    } finally {
      setModulosLoading(false);
    }
  }, []);

  const handleSelectUser = (u: UsuarioAdmin) => {
    setSelectedUser(u);
    fetchModulos(u.id);
  };

  const handleToggle = async (modulo: ModuloConEstado) => {
    if (!selectedUser) return;

    // Optimistic update — refleja también en el caché de los pills de la tabla
    const prevModulos = modulos;
    const nextModulos = modulos.map((m) => m.id === modulo.id ? { ...m, habilitado: !m.habilitado } : m);
    setModulos(nextModulos);
    modulosCache[selectedUser.id] = nextModulos;
    setPillsTick((t) => t + 1);
    setToggleErrors((prev) => { const n = { ...prev }; delete n[modulo.id]; return n; });

    try {
      if (!modulo.habilitado) {
        // Enable
        await apiFetch(`/admin/usuarios/${selectedUser.id}/modulos/${modulo.id}`, { method: 'POST' });
      } else {
        // Disable
        await apiFetch(`/admin/usuarios/${selectedUser.id}/modulos/${modulo.id}`, { method: 'DELETE' });
      }
    } catch (err: any) {
      // Revert (estado y caché)
      setModulos(prevModulos);
      modulosCache[selectedUser.id] = prevModulos;
      setPillsTick((t) => t + 1);
      setToggleErrors((prev) => ({ ...prev, [modulo.id]: err.message }));
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{
      display:         'flex',
      height:          '100%',
      fontFamily:      theme.font.family,
      backgroundColor: theme.colors.background,
    }}>

      {/* ── Tabla de usuarios ─────────────────────────────── */}
      {/* En móvil, al seleccionar un usuario se oculta la lista y el panel ocupa todo */}
      <div style={{
        flex:       selectedUser ? (isMobile ? '0 0 0' : '0 0 60%') : '1',
        display:    isMobile && selectedUser ? 'none' : 'block',
        overflowY:  'auto',
        padding:    isMobile ? '16px 12px' : '24px',
        transition: 'flex 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, color: theme.colors.primaryDark, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Gestión de Módulos
            </h2>
            <p style={{ margin: '3px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
              {total} usuario{total !== 1 ? 's' : ''} — clic en fila para gestionar módulos
            </p>
          </div>
        </div>

        {/* Filtros — mismo diseño que Administración */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', padding: '14px 16px', backgroundColor: theme.colors.surface, borderRadius: '10px', border: `1px solid ${theme.colors.border}` }}>
          <input
            type="search"
            placeholder="Buscar nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...filtroInput, width: '220px' }}
            aria-label="Buscar"
          />
          <select
            value={filtroMod}
            onChange={(e) => { setFiltroMod(e.target.value); setPage(1); }}
            style={{ ...filtroInput, width: '230px' }}
            aria-label="Módulo"
          >
            <option value="">Todos los módulos</option>
            {catalogo.map((m) => (
              <option key={m.id} value={m.clave}>{m.nombre_display}</option>
            ))}
          </select>
          <select
            value={filtroRol}
            onChange={(e) => { setFiltroRol(e.target.value); setPage(1); }}
            style={{ ...filtroInput, width: '170px' }}
            aria-label="Rol"
          >
            <option value="">Todos los roles</option>
            {ROLES_FILTRO.map((r) => <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>)}
          </select>
          {(search || filtroMod || filtroRol) && (
            <button
              onClick={() => { setSearch(''); setSearchDeb(''); setFiltroMod(''); setFiltroRol(''); setPage(1); }}
              style={{
                padding: '8px 14px', fontSize: '0.8rem', fontWeight: 700, color: theme.colors.primary,
                backgroundColor: '#fff', border: `1px solid ${theme.colors.primary}`,
                borderRadius: '7px', cursor: 'pointer', fontFamily: theme.font.family,
              }}
            >
              Limpiar
            </button>
          )}
        </div>

        {listError && (
          <div role="alert" style={alertErrorStyle}>{listError}</div>
        )}

        {/* Table — scroll horizontal en móvil */}
        <div style={{ backgroundColor: theme.colors.surface, borderRadius: '10px', border: `1px solid ${theme.colors.border}`, overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: theme.colors.primary, color: '#fff' }}>
                {['Nombre', 'Email', 'Rol', 'Unidad', 'Módulos habilitados'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: theme.colors.textSecondary }}>
                    <span style={{ fontSize: '1.5rem' }}>⏳</span>
                    <p style={{ margin: '8px 0 0' }}>Cargando usuarios…</p>
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: theme.colors.textSecondary }}>Sin resultados</td>
                </tr>
              ) : (
                usuarios.map((u, i) => {
                  const isSelected = selectedUser?.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      style={{
                        backgroundColor: isSelected
                          ? '#FDE8EF'
                          : i % 2 === 0 ? '#fff' : '#F9FAFB',
                        borderBottom:    `1px solid ${theme.colors.border}`,
                        cursor:          'pointer',
                        borderLeft:      isSelected ? `3px solid ${theme.colors.primary}` : '3px solid transparent',
                        transition:      'background 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#FEF3F7'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fff' : '#F9FAFB'; }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: theme.colors.textPrimary }}>{u.nombre}</div>
                        <div style={{ fontSize: '0.7rem', color: theme.colors.textSecondary }}>ID #{u.id}</div>
                      </td>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}><RolBadge rol={u.rol} /></td>
                      <td style={tdStyle}>{u.oficina_nombre}</td>                      <td style={tdStyle}>
                        <ModulosPills userId={u.id} refresh={pillsTick} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>← Anterior</button>
            <span style={{ lineHeight: '36px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>Pág. {page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnSecondary}>Siguiente →</button>
          </div>
        )}
      </div>

      {/* ── Panel lateral de detalle ───────────────────────── */}
      {selectedUser && (
        <div style={{
          flex:            isMobile ? '1 1 100%' : '0 0 40%',
          borderLeft:      isMobile ? 'none' : `1px solid ${theme.colors.border}`,
          backgroundColor: theme.colors.surface,
          overflowY:       'auto',
          padding:         isMobile ? '16px 12px' : '24px',
          display:         'flex',
          flexDirection:   'column',
          gap:             '16px',
        }}>
          {isMobile && (
            <button
              onClick={() => setSelectedUser(null)}
              style={{
                alignSelf: 'flex-start', background: 'transparent', border: 'none',
                color: theme.colors.primary, fontSize: '0.85rem', fontWeight: 700,
                cursor: 'pointer', padding: '4px 0',
              }}
            >
              ← Volver a usuarios
            </button>
          )}
          {/* Header del panel */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, color: theme.colors.primaryDark, fontSize: '1rem', fontWeight: 900 }}>
                {selectedUser.nombre}
              </h3>
              <div style={{ marginTop: '6px' }}>
                <RolBadge rol={selectedUser.rol} />
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                {selectedUser.email} · {selectedUser.oficina_nombre}
              </p>
            </div>
            <button
              onClick={() => setSelectedUser(null)}
              aria-label="Cerrar panel"
              style={{ background: 'transparent', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: theme.colors.textSecondary, lineHeight: 1, padding: '0 4px' }}
            >
              ×
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Icono nombre="lista" inline />Módulos del sistema
            </h4>

            {modulosLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: theme.colors.textSecondary }}>
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
                <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>Cargando módulos…</p>
              </div>
            ) : modulos.length === 0 ? (
              <p style={{ color: theme.colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
                Sin módulos en el catálogo
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {modulos.map((m) => (
                  <div key={m.id}>
                    <div style={{
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'space-between',
                      padding:         '12px 14px',
                      borderRadius:    '8px',
                      backgroundColor: m.habilitado ? '#FDE8EF' : '#F9FAFB',
                      border:          `1px solid ${m.habilitado ? theme.colors.primary + '44' : theme.colors.border}`,
                    }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: theme.colors.textPrimary }}>
                          {m.nombre_display}
                        </p>
                        {m.descripcion && (
                          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                            {m.descripcion}
                          </p>
                        )}
                      </div>
                      <Toggle
                        checked={m.habilitado}
                        onChange={() => handleToggle(m)}
                        label={m.habilitado ? 'ON' : 'OFF'}
                      />
                    </div>
                    {toggleErrors[m.id] && (
                      <p style={{ margin: '4px 0 0 14px', fontSize: '0.72rem', color: theme.colors.alert.red }}>
                        <Icono nombre="alerta" inline />{toggleErrors[m.id]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── ModulosPills — carga los módulos habilitados de un usuario ─

const modulosCache: Record<number, ModuloConEstado[]> = {};

const ModulosPills: React.FC<{ userId: number; refresh?: number }> = ({ userId, refresh }) => {
  const [modulos, setModulos] = useState<ModuloConEstado[]>(modulosCache[userId] ?? []);

  useEffect(() => {
    // Si el caché ya tiene datos (incl. tras una asignación), re-sincroniza desde él
    if (modulosCache[userId]) {
      setModulos(modulosCache[userId]);
      return;
    }
    let cancelled = false;
    apiFetch<{ data: ModuloConEstado[] }>(`/admin/usuarios/${userId}/modulos`)
      .then(({ data }) => {
        if (cancelled) return;
        modulosCache[userId] = data;
        setModulos(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, refresh]);

  const habilitados = modulos.filter((m) => m.habilitado);
  if (habilitados.length === 0) {
    return <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>Sin módulos</span>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {habilitados.map((m) => (
        <span
          key={m.id}
          style={{
            display:         'inline-flex',
            alignItems:      'center',
            padding:         '2px 8px',
            borderRadius:    '20px',
            fontSize:        '0.65rem',
            fontWeight:      700,
            backgroundColor: '#FDE8EF',
            color:           theme.colors.primary,
            border:          `1px solid ${theme.colors.primary}33`,
            whiteSpace:      'nowrap',
          }}
        >
          {m.nombre_display}
        </span>
      ))}
    </div>
  );
};

// ── Toggle ────────────────────────────────────────────────────

const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: checked ? theme.colors.primary : theme.colors.textSecondary, minWidth: '24px', textAlign: 'right' }}>
      {label}
    </span>
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        position:        'relative',
        width:           '44px',
        height:          '24px',
        borderRadius:    '12px',
        border:          'none',
        backgroundColor: checked ? theme.colors.primary : theme.colors.grayMid,
        cursor:          'pointer',
        transition:      'background-color 0.2s',
        padding:         0,
        flexShrink:      0,
      }}
    >
      <span style={{
        position:        'absolute',
        top:             '3px',
        left:            checked ? '23px' : '3px',
        width:           '18px',
        height:          '18px',
        borderRadius:    '50%',
        backgroundColor: '#fff',
        transition:      'left 0.2s',
        boxShadow:       '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  </div>
);

// ── RolBadge ──────────────────────────────────────────────────

const RolBadge: React.FC<{ rol: RolUsuario }> = ({ rol }) => {
  const cfg = ROL_COLOR[rol] ?? { bg: '#EDE9E4', text: '#3D3935' };
  return (
    <span style={{
      display:         'inline-flex',
      alignItems:      'center',
      padding:         '3px 10px',
      borderRadius:    '20px',
      fontSize:        '0.68rem',
      fontWeight:      700,
      backgroundColor: cfg.bg,
      color:           cfg.text,
      textTransform:   'uppercase',
      letterSpacing:   '0.05em',
      whiteSpace:      'nowrap',
    }}>
      {ROL_LABEL[rol] ?? rol}
    </span>
  );
};

// ── Styles ────────────────────────────────────────────────────

const thStyle: React.CSSProperties      = { padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties      = { padding: '11px 16px', verticalAlign: 'middle' };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const alertErrorStyle: React.CSSProperties = { padding: '10px 14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px' };
