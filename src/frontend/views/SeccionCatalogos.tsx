/**
 * View: SeccionCatalogos
 * Panel del SuperAdmin. Tres catálogos INDEPENDIENTES para el ingreso de oficios:
 * dependencias, unidades internas y remitentes (personas). Ninguno depende de otro.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { theme } from '../theme';
import {
  getDependencias, crearDependencia, editarDependencia, eliminarDependencia,
  getUnidadesInternas, crearUnidadInterna, editarUnidadInterna, eliminarUnidadInterna,
  getRemitentes, crearRemitente, editarRemitente, eliminarRemitente,
} from '../api';
import type { CatalogoItem } from '../api';

interface PanelProps {
  titulo:      string;
  placeholder: string;
  uppercase?:  boolean;
  get:         () => Promise<{ data: CatalogoItem[] }>;
  crear:       (nombre: string) => Promise<{ data: CatalogoItem }>;
  editar:      (id: number, nombre: string) => Promise<{ data: CatalogoItem }>;
  eliminar:    (id: number) => Promise<{ message: string }>;
  onError:     (msg: string) => void;
}

const CatalogoPanel: React.FC<PanelProps> = ({ titulo, placeholder, uppercase, get, crear, editar, eliminar, onError }) => {
  const [items,   setItems]   = useState<CatalogoItem[]>([]);
  const [nuevo,   setNuevo]   = useState('');
  const [loading, setLoading] = useState(false);
  const [editId,  setEditId]  = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const tx = (v: string) => (uppercase ? v.toUpperCase() : v);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setItems((await get()).data); }
    catch (e: any) { onError(e.message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const agregar = async () => {
    const nombre = tx(nuevo.trim());
    if (!nombre) return;
    try { await crear(nombre); setNuevo(''); cargar(); }
    catch (e: any) { onError(e.message); }
  };
  const quitar = async (it: CatalogoItem) => {
    if (!confirm(`¿Eliminar "${it.nombre}"?`)) return;
    try { await eliminar(it.id); cargar(); }
    catch (e: any) { onError(e.message); }
  };
  const guardar = async (it: CatalogoItem) => {
    const nombre = tx(editVal.trim());
    if (!nombre || nombre === it.nombre) { setEditId(null); return; }
    try { await editar(it.id, nombre); setEditId(null); cargar(); }
    catch (e: any) { onError(e.message); }
  };

  const upStyle = uppercase ? { textTransform: 'uppercase' as const } : {};

  return (
    <div style={panel}>
      <h3 style={panelTitle}>{titulo}</h3>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input value={nuevo} onChange={(e) => setNuevo(tx(e.target.value))} placeholder={placeholder}
          style={{ ...input, ...upStyle }} onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }} />
        <button onClick={agregar} style={btnAdd}>Agregar</button>
      </div>
      {loading ? <p style={muted}>Cargando…</p> : items.length === 0 ? <p style={muted}>Sin registros.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map((it) => (
            <div key={it.id} style={{ ...row, backgroundColor: '#fff', borderColor: theme.colors.border }}>
              {editId === it.id ? (
                <>
                  <input autoFocus value={editVal} onChange={(e) => setEditVal(tx(e.target.value))} style={{ ...input, padding: '4px 6px', ...upStyle }}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardar(it); if (e.key === 'Escape') setEditId(null); }} />
                  <button onClick={() => guardar(it)} title="Guardar" style={btnSave}>✓</button>
                  <button onClick={() => setEditId(null)} title="Cancelar" style={btnDel}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '0.82rem', color: theme.colors.textPrimary, padding: '2px 4px' }}>{it.nombre}</span>
                  <button onClick={() => { setEditId(it.id); setEditVal(it.nombre); }} title="Editar" style={btnEdit}>✏️</button>
                  <button onClick={() => quitar(it)} title="Eliminar" style={btnDel}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const SeccionCatalogos: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ fontFamily: theme.font.family, padding: '4px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: theme.colors.primaryDark }}>
        Catálogos de ingreso de oficios
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: theme.colors.textSecondary }}>
        Los tres catálogos son independientes. El Oficial elige cada uno por separado (con buscador) al registrar un oficio,
        porque las personas y las áreas cambian de dependencia.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }} onClick={() => setError(null)}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <CatalogoPanel titulo="Dependencias"      placeholder="NUEVA DEPENDENCIA…"      uppercase get={getDependencias}     crear={crearDependencia}     editar={editarDependencia}     eliminar={eliminarDependencia}     onError={setError} />
        <CatalogoPanel titulo="Unidades internas" placeholder="NUEVA UNIDAD INTERNA…"   uppercase get={getUnidadesInternas}  crear={crearUnidadInterna}   editar={editarUnidadInterna}   eliminar={eliminarUnidadInterna}   onError={setError} />
        <CatalogoPanel titulo="Remitentes"        placeholder="NUEVO REMITENTE…"        uppercase get={getRemitentes}        crear={crearRemitente}       editar={editarRemitente}       eliminar={eliminarRemitente}       onError={setError} />
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
const muted: React.CSSProperties = { margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' };
