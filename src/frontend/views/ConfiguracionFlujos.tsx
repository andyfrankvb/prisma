/**
 * View: Configuración de Flujos por Módulo
 * File: src/frontend/views/ConfiguracionFlujos.tsx
 */

import React, { useEffect, useState, useCallback } from 'react';
import { theme } from '../theme';
import type { UsuarioDisponible } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';

const BASE = (import.meta as any).env?.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Tipos ─────────────────────────────────────────────────────

interface ConfigEntry {
  id:                     number;
  usuario_id:             number;
  usuario_nombre:         string;
  usuario_email:          string;
  usuario_rol:            string;
  unidad_id:              number | null;
  unidad_nombre:          string | null;
  actualizado_en:         string | null;
  actualizado_por_nombre: string | null;
}

interface RolFlujo {
  rol_flujo:              string;
  por_unidad:             boolean;
  configuraciones:        ConfigEntry[];
  usuario_id:             number | null;
  usuario_nombre:         string | null;
  usuario_email:          string | null;
  actualizado_en:         string | null;
  actualizado_por_nombre: string | null;
  regla_compatibilidad:   { rol_sistema_requerido: string; unidad_tipo_requerida?: string; descripcion: string } | null;
}

interface Unidad {
  id:     number;
  nombre: string;
  tipo:   string;
}

interface ModuloFlujo {
  modulo_clave:  string;
  modulo_nombre: string;
  descripcion:   string | null;
  roles:         RolFlujo[];
  unidades:      Unidad[];
}

interface DelegacionVobo {
  id:               number;
  nombre:           string;
  vobo_por:         'DELEGADO' | 'ENCARGADO';
  delegado_nombre:  string | null;
  encargado_nombre: string | null;
}

interface AddState {
  moduloClave:  string;
  rolFlujo:     string;
  unidadId:     number | '';
  usuarioId:    number | '';
  usuarios:     UsuarioDisponible[];
  loadingUsers: boolean;
  saving:       boolean;
  error:        string | null;
}

// ── Componente principal ──────────────────────────────────────

export const ConfiguracionFlujos: React.FC = () => {
  const isMobile = useIsMobile();
  const [modulos,   setModulos]   = useState<ModuloFlujo[]>([]);
  const [delegaciones, setDelegaciones] = useState<DelegacionVobo[]>([]);
  const [voboSaving,   setVoboSaving]   = useState<number | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [addState,  setAddState]  = useState<AddState | null>(null);
  const [editEntry, setEditEntry] = useState<{ moduloClave: string; rolFlujo: string; unidadId: number | null; usuarios: UsuarioDisponible[]; selected: number | ''; saving: boolean; error: string | null } | null>(null);

  const cargarFlujos = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [data, dele] = await Promise.all([
        apiFetch<{ data: ModuloFlujo[] }>(`${BASE}/admin/flujos`),
        apiFetch<{ data: DelegacionVobo[] }>(`${BASE}/admin/delegaciones-vobo`).catch(() => ({ data: [] as DelegacionVobo[] })),
      ]);
      setModulos(data.data);
      setDelegaciones(dele.data);
    } catch (err: any) {
      setError(err.message ?? 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  // Cambiar quién da el VoBo en una delegación
  const cambiarVobo = useCallback(async (unidadId: number, vobo_por: 'DELEGADO' | 'ENCARGADO') => {
    setVoboSaving(unidadId);
    // Optimista
    setDelegaciones(prev => prev.map(d => d.id === unidadId ? { ...d, vobo_por } : d));
    try {
      await apiFetch(`${BASE}/admin/delegaciones-vobo/${unidadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ vobo_por }),
      });
    } catch (err: any) {
      alert(err.message);
      cargarFlujos();
    } finally {
      setVoboSaving(null);
    }
  }, []);

  useEffect(() => { cargarFlujos(); }, [cargarFlujos]);

  // Cargar usuarios disponibles para un rol, opcionalmente filtrados por unidad
  const cargarUsuarios = useCallback(async (moduloClave: string, rolFlujo: string, unidadId?: number): Promise<UsuarioDisponible[]> => {
    const qs = unidadId ? `?unidad_id=${unidadId}` : '';
    const data = await apiFetch<{ data: UsuarioDisponible[] }>(
      `${BASE}/admin/flujos/${moduloClave}/${rolFlujo}/usuarios-disponibles${qs}`,
    );
    return data.data;
  }, []);

  // Abrir formulario de agregar nueva entrada por unidad
  const abrirAgregar = useCallback(async (moduloClave: string, rolFlujo: string) => {
    setAddState({ moduloClave, rolFlujo, unidadId: '', usuarioId: '', usuarios: [], loadingUsers: true, saving: false, error: null });
    try {
      const usuarios = await cargarUsuarios(moduloClave, rolFlujo);
      setAddState(prev => prev ? { ...prev, usuarios, loadingUsers: false } : null);
    } catch (err: any) {
      setAddState(prev => prev ? { ...prev, loadingUsers: false, error: err.message } : null);
    }
  }, [cargarUsuarios]);

  // Abrir editor de entrada existente
  const abrirEditar = useCallback(async (moduloClave: string, rolFlujo: string, unidadId: number | null) => {
    setEditEntry({ moduloClave, rolFlujo, unidadId, usuarios: [], selected: '', saving: false, error: null });
    try {
      const usuarios = await cargarUsuarios(moduloClave, rolFlujo);
      setEditEntry(prev => prev ? { ...prev, usuarios } : null);
    } catch (err: any) {
      setEditEntry(prev => prev ? { ...prev, error: err.message } : null);
    }
  }, [cargarUsuarios]);

  // Guardar nueva entrada
  const guardarNueva = useCallback(async () => {
    if (!addState || addState.usuarioId === '' || addState.unidadId === '') return;
    setAddState(prev => prev ? { ...prev, saving: true, error: null } : null);
    try {
      await apiFetch(`${BASE}/admin/flujos/${addState.moduloClave}/${addState.rolFlujo}`, {
        method: 'PUT',
        body: JSON.stringify({
          usuario_id: addState.usuarioId,
          unidad_id:  Number(addState.unidadId),
        }),
      });
      setAddState(null);
      cargarFlujos();
    } catch (err: any) {
      setAddState(prev => prev ? { ...prev, saving: false, error: err.message } : null);
    }
  }, [addState, cargarFlujos]);

  // Guardar edición
  const guardarEdicion = useCallback(async () => {
    if (!editEntry || editEntry.selected === '') return;
    setEditEntry(prev => prev ? { ...prev, saving: true, error: null } : null);
    try {
      await apiFetch(`${BASE}/admin/flujos/${editEntry.moduloClave}/${editEntry.rolFlujo}`, {
        method: 'PUT',
        body: JSON.stringify({
          usuario_id: editEntry.selected,
          unidad_id:  editEntry.unidadId,
        }),
      });
      setEditEntry(null);
      cargarFlujos();
    } catch (err: any) {
      setEditEntry(prev => prev ? { ...prev, saving: false, error: err.message } : null);
    }
  }, [editEntry, cargarFlujos]);

  // Eliminar entrada por unidad
  const eliminarEntrada = useCallback(async (moduloClave: string, rolFlujo: string, unidadId: number) => {
    if (!confirm('¿Eliminar esta configuración?')) return;
    try {
      await apiFetch(`${BASE}/admin/flujos/${moduloClave}/${rolFlujo}/${unidadId}`, { method: 'DELETE' });
      cargarFlujos();
    } catch (err: any) {
      alert(err.message);
    }
  }, [cargarFlujos]);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: theme.colors.textSecondary, fontFamily: theme.font.family }}>
      Cargando configuraciones…
    </div>
  );

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: theme.colors.alert.red, fontFamily: theme.font.family }}>
      {error}
      <br />
      <button onClick={cargarFlujos} style={{ marginTop: '12px', padding: '8px 16px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px', fontFamily: theme.font.family, maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: theme.colors.textPrimary }}>⚙️ Configuración de Flujos</h2>
        <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: theme.colors.textSecondary }}>
          Asigna qué usuario desempeña cada rol dentro del flujo de trabajo de cada módulo.
        </p>
      </div>

      {modulos.map((modulo) => (
        <div key={modulo.modulo_clave} style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, marginBottom: '20px', overflow: 'hidden', boxShadow: theme.shadow.sm }}>
          {/* Header módulo */}
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: '#F9F7F5' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.primaryDark }}>{modulo.modulo_nombre}</h3>
            {modulo.descripcion && <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>{modulo.descripcion}</p>}
          </div>

          {/* Roles */}
          {modulo.roles.map((rol, rIdx) => {
            const isLast = rIdx === modulo.roles.length - 1;
            const esMultiple = modulo.modulo_clave === 'oficialia_partes'
              && (rol.rol_flujo === 'OFICIAL' || rol.rol_flujo === 'JURIDICO');

            return (
              <div key={rol.rol_flujo} style={{ borderBottom: isLast ? 'none' : `1px solid ${theme.colors.border}` }}>
                {/* Cabecera del rol */}
                <div style={{ padding: '12px 20px', backgroundColor: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: theme.colors.textPrimary }}>{rol.rol_flujo}</span>
                    <span style={{ marginLeft: '8px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>{rol.regla_compatibilidad?.descripcion}</span>
                  </div>
                  {esMultiple && (
                    <button
                      onClick={() => abrirAgregar(modulo.modulo_clave, rol.rol_flujo)}
                      style={{ padding: '5px 12px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      + Agregar por oficina
                    </button>
                  )}
                </div>

                {/* Formulario agregar nueva entrada */}
                {addState?.moduloClave === modulo.modulo_clave && addState?.rolFlujo === rol.rol_flujo && (
                  <div style={{ padding: '12px 20px', backgroundColor: '#EFF6FF', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.charcoal, marginBottom: '4px' }}>Oficina</label>
                      <select
                        value={addState.unidadId}
                        onChange={async e => {
                          const uid = Number(e.target.value) || '';
                          setAddState(prev => prev ? { ...prev, unidadId: uid, usuarioId: '', usuarios: [], loadingUsers: !!uid } : null);
                          if (uid) {
                            try {
                              const usuarios = await cargarUsuarios(addState.moduloClave, addState.rolFlujo, uid as number);
                              setAddState(prev => prev ? { ...prev, usuarios, loadingUsers: false } : null);
                            } catch (err: any) {
                              setAddState(prev => prev ? { ...prev, loadingUsers: false, error: err.message } : null);
                            }
                          }
                        }}
                        style={{ padding: '6px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: '0.78rem', minWidth: '200px' }}
                      >
                        <option value="">— Seleccionar oficina —</option>
                        {modulo.unidades.map(u => (
                          <option key={u.id} value={u.id}>{u.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.charcoal, marginBottom: '4px' }}>Usuario</label>
                      {addState.loadingUsers ? (
                        <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Cargando usuarios…</span>
                      ) : (
                        <select
                          value={addState.usuarioId}
                          onChange={e => setAddState(prev => prev ? { ...prev, usuarioId: Number(e.target.value) || '' } : null)}
                          disabled={!addState.unidadId}
                          style={{ padding: '6px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: '0.78rem', minWidth: '220px', opacity: !addState.unidadId ? 0.5 : 1 }}
                        >
                          <option value="">{!addState.unidadId ? '— Selecciona una oficina primero —' : addState.usuarios.length === 0 ? 'Sin usuarios disponibles' : '— Seleccionar usuario —'}</option>
                          {addState.usuarios.map(u => (
                            <option key={u.id} value={u.id}>{u.nombre}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={guardarNueva}
                        disabled={addState.saving || addState.usuarioId === '' || addState.unidadId === ''}
                        style={{ padding: '6px 14px', background: theme.colors.alert.green, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                      >
                        {addState.saving ? 'Guardando…' : '✓ Guardar'}
                      </button>
                      <button
                        onClick={() => setAddState(null)}
                        style={{ padding: '6px 10px', background: 'transparent', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.78rem' }}
                      >
                        Cancelar
                      </button>
                    </div>
                    {addState.error && <span style={{ fontSize: '0.75rem', color: theme.colors.alert.red, width: '100%' }}>{addState.error}</span>}
                  </div>
                )}

                {/* Entradas configuradas */}
                {rol.configuraciones.length === 0 ? (
                  <div style={{ padding: '12px 20px' }}>
                    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', background: '#FEF3C7', color: '#92400E', fontSize: '0.75rem', fontWeight: 600 }}>Sin configurar</span>
                  </div>
                ) : (
                  rol.configuraciones.map((cfg) => {
                    const isEditingThis = editEntry?.moduloClave === modulo.modulo_clave && editEntry?.rolFlujo === rol.rol_flujo && editEntry?.unidadId === cfg.unidad_id;
                    return (
                      <div key={cfg.id} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderTop: `1px solid ${theme.colors.border}` }}>
                        {/* Unidad */}
                        {cfg.unidad_nombre && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: theme.colors.primary, minWidth: '160px' }}>🏛 {cfg.unidad_nombre}</span>
                        )}
                        {/* Usuario */}
                        <div style={{ flex: 1 }}>
                          {isEditingThis ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <select
                                value={editEntry.selected}
                                onChange={e => setEditEntry(prev => prev ? { ...prev, selected: Number(e.target.value) || '' } : null)}
                                style={{ padding: '5px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: '0.78rem', minWidth: '200px' }}
                              >
                                <option value="">— Seleccionar —</option>
                                {editEntry.usuarios.map(u => (
                                  <option key={u.id} value={u.id}>{u.nombre} ({u.unidad_nombre})</option>
                                ))}
                              </select>
                              <button onClick={guardarEdicion} disabled={editEntry.saving || editEntry.selected === ''} style={{ padding: '5px 12px', background: theme.colors.alert.green, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                {editEntry.saving ? 'Guardando…' : '✓'}
                              </button>
                              <button onClick={() => setEditEntry(null)} style={{ padding: '5px 8px', background: 'transparent', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.75rem' }}>
                                ✕
                              </button>
                              {editEntry.error && <span style={{ fontSize: '0.72rem', color: theme.colors.alert.red }}>{editEntry.error}</span>}
                            </div>
                          ) : (
                            <div>
                              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: theme.colors.textPrimary }}>{cfg.usuario_nombre}</p>
                              <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>{cfg.usuario_email}</p>
                              {cfg.actualizado_en && (
                                <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: theme.colors.grayMid }}>
                                  Actualizado {new Date(cfg.actualizado_en).toLocaleDateString('es-MX')}{cfg.actualizado_por_nombre ? ` por ${cfg.actualizado_por_nombre}` : ''}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Acciones */}
                        {!isEditingThis && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => abrirEditar(modulo.modulo_clave, rol.rol_flujo, cfg.unidad_id)}
                              style={{ padding: '5px 10px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}
                            >
                              ✏️ Editar
                            </button>
                            {cfg.unidad_id !== null && (
                              <button
                                onClick={() => eliminarEntrada(modulo.modulo_clave, rol.rol_flujo, cfg.unidad_id!)}
                                style={{ padding: '5px 10px', background: theme.colors.alert.red, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* ── VoBo en delegaciones ─────────────────────────────── */}
      {delegaciones.length > 0 && (
        <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, marginBottom: '20px', overflow: 'hidden', boxShadow: theme.shadow.sm }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: '#F9F7F5' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.primaryDark }}>Visto bueno en delegaciones</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
              Elige quién aprueba (VoBo) los oficios en cada delegación: el delegado o el encargado.
            </p>
          </div>

          {delegaciones.map((d, i) => (
            <div key={d.id} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderTop: i === 0 ? 'none' : `1px solid ${theme.colors.border}` }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primary }}>🏛 {d.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                  Delegado: {d.delegado_nombre ?? '—'} · Encargado: {d.encargado_nombre ?? '—'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['DELEGADO', 'ENCARGADO'] as const).map((opt) => {
                  const activo = d.vobo_por === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => !activo && cambiarVobo(d.id, opt)}
                      disabled={voboSaving === d.id}
                      style={{
                        padding: '6px 14px', borderRadius: theme.radius.sm, fontSize: '0.78rem', fontWeight: 700, cursor: activo ? 'default' : 'pointer',
                        border: `1px solid ${activo ? theme.colors.primary : theme.colors.border}`,
                        background: activo ? theme.colors.primary : 'transparent',
                        color: activo ? '#fff' : theme.colors.textSecondary,
                        opacity: voboSaving === d.id ? 0.6 : 1,
                      }}
                    >
                      {opt === 'DELEGADO' ? 'Delegado' : 'Encargado'}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
