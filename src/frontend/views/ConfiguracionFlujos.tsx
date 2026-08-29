/**
 * View: Configuración de Flujos por Módulo
 * File: src/frontend/views/ConfiguracionFlujos.tsx
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Icono } from '../components/Icono';
import { theme } from '../theme';
import type { UsuarioDisponible } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { useDialogo } from '../context/DialogoContext';
import { MatrizDestinos } from './MatrizDestinos';

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
  /** Cómo se llama en pantalla. El identificador guardado no cambia. */
  nombre_visible?:        string;
  por_unidad:             boolean;
  /** Admite varias personas. Sin `por_unidad`, se agregan sin elegir área. */
  admite_varios?:         boolean;
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
  tipo:             string;          // DELEGACION | DIRECCION — define la etiqueta del titular
  vobo_por:         'DELEGADO' | 'ENCARGADO';
  /** Delegación que además puede dirigir oficios a las direcciones de área. */
  recibe_direcciones_area?: boolean;
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
  /** El rol admite varias personas pero no se reparte por área: no pide oficina. */
  sinOficina?:  boolean;
}

// ── Componente principal ──────────────────────────────────────

/**
 * Agrupa las configuraciones por unidad, conservando el orden de llegada.
 * Los roles globales (sin unidad) caen en un grupo propio.
 */
function agruparPorUnidad(cfgs: ConfigEntry[]) {
  const mapa = new Map<string, { clave: string; nombre: string; items: ConfigEntry[] }>();
  for (const c of cfgs) {
    const clave = String(c.unidad_id ?? 'global');
    if (!mapa.has(clave)) {
      mapa.set(clave, { clave, nombre: c.unidad_nombre ?? 'Sin unidad', items: [] });
    }
    mapa.get(clave)!.items.push(c);
  }
  return Array.from(mapa.values());
}

export const ConfiguracionFlujos: React.FC = () => {
  const isMobile = useIsMobile();
  const [modulos,   setModulos]   = useState<ModuloFlujo[]>([]);
  const [delegaciones, setDelegaciones] = useState<DelegacionVobo[]>([]);
  const dialogo = useDialogo();
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
  /** Marca si una delegación puede dirigir oficios a las direcciones de área. */
  const cambiarDestinos = useCallback(async (unidadId: number, valor: boolean) => {
    setVoboSaving(unidadId);
    const previo = delegaciones;
    setDelegaciones(prev => prev.map(d => d.id === unidadId ? { ...d, recibe_direcciones_area: valor } : d));
    try {
      const res = await fetch(`${BASE}/admin/delegaciones-vobo/${unidadId}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recibe_direcciones_area: valor }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'No se pudo guardar');
    } catch (e: any) {
      setDelegaciones(previo);
      setError(e.message);
    } finally {
      setVoboSaving(null);
    }
  }, [delegaciones]);

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
      dialogo.avisar({ titulo: 'No se pudo guardar', mensaje: err.message });
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
  /**
   * `sinOficina` para los roles que admiten varias personas pero no se reparten
   * por área —hoy, la carga del firmado—: ahí no hay oficina que elegir y pedirla
   * dejaba el formulario trabado, con el botón de guardar siempre apagado.
   */
  const abrirAgregar = useCallback(async (moduloClave: string, rolFlujo: string, sinOficina = false) => {
    setAddState({ moduloClave, rolFlujo, unidadId: '', usuarioId: '', usuarios: [], loadingUsers: true, saving: false, error: null, sinOficina });
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
    if (!addState || addState.usuarioId === '') return;
    if (!addState.sinOficina && addState.unidadId === '') return;
    setAddState(prev => prev ? { ...prev, saving: true, error: null } : null);
    try {
      await apiFetch(`${BASE}/admin/flujos/${addState.moduloClave}/${addState.rolFlujo}`, {
        method: 'PUT',
        // Sin oficina se manda sin `unidad_id`: el servidor rechaza recibirla
        // para los roles que no se reparten por área.
        body: JSON.stringify({
          usuario_id: addState.usuarioId,
          ...(addState.sinOficina ? {} : { unidad_id: Number(addState.unidadId) }),
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
  const eliminarEntrada = useCallback(async (moduloClave: string, rolFlujo: string, unidadId: number, usuarioId?: number) => {
    const sigue = await dialogo.confirmar({
      titulo:    'Eliminar configuración',
      mensaje:   'Esta persona dejará de tener ese papel en el flujo del módulo.',
      confirmar: 'Eliminar',
      peligro:   true,
    });
    if (!sigue) return;
    try {
      // usuario_id es necesario en los roles con varios actores por unidad (OFICIAL),
      // si no se borrarían todos los de esa delegación.
      const qs = usuarioId ? `?usuario_id=${usuarioId}` : '';
      await apiFetch(`${BASE}/admin/flujos/${moduloClave}/${rolFlujo}/${unidadId}${qs}`, { method: 'DELETE' });
      cargarFlujos();
    } catch (err: any) {
      dialogo.avisar({ titulo: 'No se pudo guardar', mensaje: err.message });
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
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: theme.colors.textPrimary }}><Icono nombre="engranaje" inline />Configuración de Flujos</h2>
        <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: theme.colors.textSecondary }}>
          Asigna qué usuario desempeña cada rol dentro del flujo de trabajo de cada módulo.
        </p>
      </div>

      <MatrizDestinos />

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
            // Todo rol que se configura POR UNIDAD necesita poder agregar unidades
            // nuevas (antes solo OFICIAL y JURIDICO tenían el botón, así que no había
            // forma de dar de alta al ENCARGADO de un área sin configurar).
            const esMultiple = rol.por_unidad;
            /**
             * Admite varias personas pero no se reparte por área: la carga del
             * firmado. Necesita su propio botón porque el de «Agregar por
             * oficina» pide una oficina que aquí no existe.
             */
            const sinArea = !!rol.admite_varios && !rol.por_unidad;

            /**
             * Áreas que no tienen a nadie en este rol.
             *
             * La pantalla solo mostraba lo que sí está configurado, así que un
             * área faltante era invisible por definición: no había renglón que
             * mirar. Cuando la que falta es el ENCARGADO, los oficios dirigidos
             * a esa unidad no caen en la bandeja de nadie y se quedan en RECIBIDO
             * indefinidamente, sin que nada lo delate.
             */
            const sinConfigurar = esMultiple
              ? modulo.unidades.filter(
                  (u) => !rol.configuraciones.some((c) => c.unidad_id === u.id),
                )
              : [];

            return (
              <div key={rol.rol_flujo} style={{ borderBottom: isLast ? 'none' : `1px solid ${theme.colors.border}` }}>
                {/* Cabecera del rol */}
                <div style={{ padding: '12px 20px', backgroundColor: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: theme.colors.textPrimary }}>
                      {rol.nombre_visible ?? rol.rol_flujo}
                    </span>
                    <span style={{ marginLeft: '8px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>{rol.regla_compatibilidad?.descripcion}</span>
                  </div>
                  {(esMultiple || sinArea) && (
                    <button
                      onClick={() => abrirAgregar(modulo.modulo_clave, rol.rol_flujo, sinArea)}
                      style={{ padding: '5px 12px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      {sinArea ? '+ Agregar persona' : '+ Agregar por oficina'}
                    </button>
                  )}
                </div>

                {sinConfigurar.length > 0 && (
                  <div style={{ padding: '9px 20px', backgroundColor: '#FEF3C7', borderTop: `1px solid ${theme.colors.border}`, fontSize: '0.76rem', color: '#92400E' }}>
                    <strong>Sin asignar:</strong> {sinConfigurar.map((u) => u.nombre).join(' · ')}
                    {rol.rol_flujo === 'ENCARGADO' && (
                      <span style={{ display: 'block', marginTop: '3px', fontSize: '0.72rem' }}>
                        Los oficios dirigidos a estas áreas no le caen a nadie y no se pueden asignar.
                      </span>
                    )}
                  </div>
                )}

                {/* Formulario agregar nueva entrada */}
                {addState?.moduloClave === modulo.modulo_clave && addState?.rolFlujo === rol.rol_flujo && (
                  <div style={{ padding: '12px 20px', backgroundColor: '#F5F4F2', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {!addState.sinOficina && (
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
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.charcoal, marginBottom: '4px' }}>Usuario</label>
                      {addState.loadingUsers ? (
                        <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Cargando usuarios…</span>
                      ) : (
                        <select
                          value={addState.usuarioId}
                          onChange={e => setAddState(prev => prev ? { ...prev, usuarioId: Number(e.target.value) || '' } : null)}
                          disabled={!addState.sinOficina && !addState.unidadId}
                          style={{ padding: '6px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: '0.78rem', minWidth: '220px', opacity: (!addState.sinOficina && !addState.unidadId) ? 0.5 : 1 }}
                        >
                          <option value="">{(!addState.sinOficina && !addState.unidadId) ? '— Selecciona una oficina primero —' : addState.usuarios.length === 0 ? 'Sin usuarios disponibles' : '— Seleccionar usuario —'}</option>
                          {addState.usuarios.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.nombre}{addState.sinOficina && u.unidad_nombre ? ` · ${u.unidad_nombre}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={guardarNueva}
                        disabled={addState.saving || addState.usuarioId === ''
                          || (!addState.sinOficina && addState.unidadId === '')}
                        style={{ padding: '6px 14px', background: theme.colors.alert.green, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                      >
                        {addState.saving ? 'Guardando…' : 'Guardar'}
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
                  // Se agrupan por unidad: una delegación con varios actores (p. ej. dos
                  // oficiales de partes) aparece una sola vez con su gente debajo.
                  agruparPorUnidad(rol.configuraciones).map((grupo) => (
                    <div key={grupo.clave} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                      <div style={{ padding: '8px 20px 2px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: theme.colors.primary }}>
                          <Icono nombre="edificio" inline />{grupo.nombre}
                          {grupo.items.length > 1 && (
                            <span style={{ marginLeft: '8px', fontSize: '0.68rem', fontWeight: 600, color: theme.colors.textSecondary }}>
                              {grupo.items.length} personas
                            </span>
                          )}
                        </span>
                      </div>
                      {grupo.items.map((cfg) => {
                    const isEditingThis = editEntry?.moduloClave === modulo.modulo_clave && editEntry?.rolFlujo === rol.rol_flujo && editEntry?.unidadId === cfg.unidad_id;
                    return (
                      <div key={cfg.id} style={{ padding: '6px 20px 10px 40px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
                                {editEntry.saving ? 'Guardando…' : <Icono nombre="check" size={14} />}
                              </button>
                              <button onClick={() => setEditEntry(null)} style={{ padding: '5px 8px', background: 'transparent', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.75rem' }}>
                                <Icono nombre="cerrar" inline />                              </button>
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
                              <Icono nombre="editar" inline />Editar
                            </button>
                            {cfg.unidad_id !== null && (
                              <button
                                onClick={() => eliminarEntrada(modulo.modulo_clave, rol.rol_flujo, cfg.unidad_id!, cfg.usuario_id)}
                                style={{ padding: '5px 10px', background: theme.colors.alert.red, color: '#fff', border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}
                              >
                                <Icono nombre="papelera" inline />                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                      })}
                    </div>
                  ))
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
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.primaryDark }}>Visto bueno por área</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
              Elige quién aprueba (VoBo) los oficios en cada área: su titular o el encargado.
              En las delegaciones, además, a qué áreas pueden dirigir los oficios que registran.
            </p>
          </div>

          {delegaciones.map((d, i) => (
            <div key={d.id} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderTop: i === 0 ? 'none' : `1px solid ${theme.colors.border}` }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primary }}><Icono nombre="edificio" inline />{d.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                  {d.tipo === 'DIRECCION' ? 'Director' : 'Delegado'}: {d.delegado_nombre ?? '—'} · Encargado: {d.encargado_nombre ?? '—'}
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
                      {opt === 'ENCARGADO' ? 'Encargado' : (d.tipo === 'DIRECCION' ? 'Director' : 'Delegado')}
                    </button>
                  );
                })}
              </div>

              {d.tipo === 'DELEGACION' && (
                <label
                  title="Marca esto si a esta delegación le llegan oficios dirigidos a la Jurídica, la Administrativa o la de Innovación (comparte sede con ellas)."
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: theme.colors.textSecondary, cursor: 'pointer', flexBasis: '100%' }}
                >
                  <input
                    type="checkbox"
                    checked={!!d.recibe_direcciones_area}
                    disabled={voboSaving === d.id}
                    onChange={(e) => cambiarDestinos(d.id, e.target.checked)}
                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                  />
                  {/* El «al registrar» es lo que la distingue de «Destinos entre
                      áreas». Aquella dice a quién se le puede turnar el oficio ya
                      adentro del trámite; ésta, qué correspondencia alcanza a
                      capturar esta ventanilla, que depende de qué le llega
                      físicamente —Chetumal comparte sede con las direcciones y
                      recibe también lo de ellas—. Sin decir el momento, las dos
                      se leen como la misma regla. */}
                  Al registrar, también puede dirigir oficios a las direcciones de área
                  <span style={{ color: theme.colors.grayMid }}>
                    (sin esto: solo a su delegado y a la Dirección General. No afecta a quién
                    se le puede turnar después: eso se define en «Destinos entre áreas»)
                  </span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
