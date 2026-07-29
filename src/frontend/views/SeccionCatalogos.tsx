/**
 * View: SeccionCatalogos
 * Panel del SuperAdmin.
 *  - Dependencia → Sub-unidad (cascada, master-detail).
 *  - Remitentes (personas): catálogo GLOBAL independiente.
 * Todo en MAYÚSCULAS.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { theme } from '../theme';
import {
  getDependencias, crearDependencia, editarDependencia, eliminarDependencia,
  getUnidadesInternas, crearUnidadInterna, editarUnidadInterna, eliminarUnidadInterna,
  getRemitentes, crearRemitente, editarRemitente, eliminarRemitente,
} from '../api';
import type { CatalogoItem } from '../api';

// ── Columna genérica de un nivel ─────────────────────────────
interface ColumnaProps {
  titulo:       string;
  subtitulo?:   string | null;
  items:        CatalogoItem[];
  selectedId?:  number | null;
  onSelect?:    (it: CatalogoItem) => void;   // drill-down (dependencia)
  crear:        (nombre: string) => Promise<{ data: CatalogoItem }>;
  editar:       (id: number, nombre: string) => Promise<{ data: CatalogoItem }>;
  eliminar:     (id: number) => Promise<{ message: string }>;
  reload:       () => void;
  onError:      (m: string) => void;
  placeholder:  string;
  emptyMsg:     string;
  promptMsg?:   string;
  activo:       boolean;
}

const Columna: React.FC<ColumnaProps> = ({
  titulo, subtitulo, items, selectedId, onSelect, crear, editar, eliminar, reload, onError,
  placeholder, emptyMsg, promptMsg, activo,
}) => {
  const [nuevo,   setNuevo]   = useState('');
  const [editId,  setEditId]  = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const agregar = async () => {
    const nombre = nuevo.trim().toUpperCase();
    if (!nombre) return;
    try { await crear(nombre); setNuevo(''); reload(); } catch (e: any) { onError(e.message); }
  };
  const quitar = async (it: CatalogoItem) => {
    if (!confirm(`¿Eliminar "${it.nombre}"?`)) return;
    try { await eliminar(it.id); reload(); } catch (e: any) { onError(e.message); }
  };
  const guardar = async (it: CatalogoItem) => {
    const nombre = editVal.trim().toUpperCase();
    if (!nombre || nombre === it.nombre) { setEditId(null); return; }
    try { await editar(it.id, nombre); setEditId(null); reload(); } catch (e: any) { onError(e.message); }
  };

  return (
    <div style={panel}>
      <h3 style={panelTitle}>{titulo}</h3>
      {subtitulo && <p style={{ ...muted, margin: '-6px 0 10px' }}>{subtitulo}</p>}

      {!activo ? (
        <p style={muted}>{promptMsg}</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value.toUpperCase())} placeholder={placeholder}
              style={{ ...input, textTransform: 'uppercase' }} onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }} />
            <button onClick={agregar} style={btnAdd}>Agregar</button>
          </div>
          {items.length === 0 ? <p style={muted}>{emptyMsg}</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {items.map((it) => {
                const sel = selectedId === it.id;
                return (
                  <div key={it.id} style={{ ...row, backgroundColor: sel ? '#EEF2FF' : '#fff', borderColor: sel ? theme.colors.primary : theme.colors.border }}>
                    {editId === it.id ? (
                      <>
                        <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value.toUpperCase())} style={{ ...input, padding: '4px 6px', textTransform: 'uppercase' }}
                          onKeyDown={(e) => { if (e.key === 'Enter') guardar(it); if (e.key === 'Escape') setEditId(null); }} />
                        <button onClick={() => guardar(it)} title="Guardar" style={btnSave}>✓</button>
                        <button onClick={() => setEditId(null)} title="Cancelar" style={btnDel}>✕</button>
                      </>
                    ) : (
                      <>
                        {onSelect ? (
                          <button onClick={() => onSelect(it)} style={rowLabel}>{it.nombre}</button>
                        ) : (
                          <span style={{ flex: 1, fontSize: '0.82rem', color: theme.colors.textPrimary, padding: '2px 4px' }}>{it.nombre}</span>
                        )}
                        <button onClick={() => { setEditId(it.id); setEditVal(it.nombre); }} title="Editar" style={btnEdit}>✏️</button>
                        <button onClick={() => quitar(it)} title="Eliminar" style={btnDel}>✕</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const SeccionCatalogos: React.FC = () => {
  const [error,  setError]  = useState<string | null>(null);
  const [deps,   setDeps]   = useState<CatalogoItem[]>([]);
  const [unis,   setUnis]   = useState<CatalogoItem[]>([]);
  const [rems,   setRems]   = useState<CatalogoItem[]>([]);
  const [selDep, setSelDep] = useState<CatalogoItem | null>(null);

  const cargarDeps = useCallback(() => {
    getDependencias().then((r) => setDeps(r.data)).catch((e) => setError(e.message));
  }, []);
  const cargarUnis = useCallback((depId: number) => {
    getUnidadesInternas(depId).then((r) => setUnis(r.data)).catch((e) => setError(e.message));
  }, []);
  const cargarRems = useCallback(() => {
    getRemitentes().then((r) => setRems(r.data)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { cargarDeps(); cargarRems(); }, [cargarDeps, cargarRems]);
  useEffect(() => { if (selDep) cargarUnis(selDep.id); else setUnis([]); }, [selDep, cargarUnis]);

  return (
    <div style={{ fontFamily: theme.font.family, padding: '4px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: theme.colors.primaryDark }}>
        Catálogos de ingreso de oficios
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: theme.colors.textSecondary }}>
        Las <strong>sub-unidades</strong> cuelgan de su <strong>dependencia</strong> (elige una para verlas).
        Los <strong>remitentes</strong> son una lista independiente. Todo se guarda en MAYÚSCULAS.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }} onClick={() => setError(null)}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Columna
          titulo="Dependencias"
          items={deps}
          selectedId={selDep?.id ?? null}
          onSelect={setSelDep}
          crear={crearDependencia} editar={editarDependencia} eliminar={eliminarDependencia}
          reload={cargarDeps} onError={setError}
          placeholder="NUEVA DEPENDENCIA…" emptyMsg="Sin dependencias." activo
        />
        <Columna
          titulo="Sub-unidades"
          subtitulo={selDep ? selDep.nombre : null}
          items={unis}
          crear={(n) => crearUnidadInterna(selDep!.id, n)} editar={editarUnidadInterna} eliminar={eliminarUnidadInterna}
          reload={() => selDep && cargarUnis(selDep.id)} onError={setError}
          placeholder="NUEVA SUB-UNIDAD…" emptyMsg="Esta dependencia no tiene sub-unidades."
          promptMsg="Selecciona una dependencia para ver sus sub-unidades." activo={!!selDep}
        />
        <Columna
          titulo="Remitentes (independientes)"
          items={rems}
          crear={crearRemitente} editar={editarRemitente} eliminar={eliminarRemitente}
          reload={cargarRems} onError={setError}
          placeholder="NUEVO REMITENTE…" emptyMsg="Sin remitentes." activo
        />
      </div>
    </div>
  );
};

// ── estilos ──────────────────────────────────────────────
const panel: React.CSSProperties = { border: `1px solid ${theme.colors.border}`, borderRadius: '10px', padding: '16px', backgroundColor: theme.colors.surface };
const panelTitle: React.CSSProperties = { margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, color: theme.colors.primaryDark };
const input: React.CSSProperties = { flex: 1, padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.82rem', fontFamily: theme.font.family, minWidth: 0 };
const btnAdd: React.CSSProperties = { padding: '8px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' };
const btnDel: React.CSSProperties = { padding: '2px 8px', backgroundColor: 'transparent', color: '#DC2626', border: 'none', borderRadius: '5px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 };
const btnEdit: React.CSSProperties = { padding: '2px 6px', backgroundColor: 'transparent', border: 'none', borderRadius: '5px', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, opacity: 0.75 };
const btnSave: React.CSSProperties = { padding: '2px 8px', backgroundColor: 'transparent', color: '#16A34A', border: 'none', borderRadius: '5px', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', flexShrink: 0 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid', borderRadius: '7px', padding: '4px 6px' };
const rowLabel: React.CSSProperties = { flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: theme.colors.textPrimary, padding: '2px 4px', fontFamily: theme.font.family };
const muted: React.CSSProperties = { margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' };
