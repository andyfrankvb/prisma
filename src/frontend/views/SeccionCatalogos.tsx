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
  getCorreos, crearCorreo, editarCorreo, eliminarCorreo,
  dependenciaASubunidad, subunidadADependencia, moverSubunidad,
} from '../api';
import { Modal } from '../components/Modal';
import type { CatalogoItem } from '../api';

// ── Columna genérica de un nivel ─────────────────────────────
interface ColumnaProps {
  titulo:       string;
  subtitulo?:   string | null;
  items:        CatalogoItem[];
  selectedId?:  number | null;
  onSelect?:    (it: CatalogoItem) => void;   // drill-down (dependencia)
  onMover?:     (it: CatalogoItem) => void;   // reorganizar jerarquía
  crear:        (nombre: string) => Promise<{ data: CatalogoItem }>;
  editar:       (id: number, nombre: string) => Promise<{ data: CatalogoItem }>;
  eliminar:     (id: number) => Promise<{ message: string }>;
  reload:       () => void;
  onError:      (m: string) => void;
  placeholder:  string;
  emptyMsg:     string;
  promptMsg?:   string;
  activo:       boolean;
  /** Los nombres van en MAYÚSCULAS; los correos no. */
  mayusculas?:  boolean;
}

const Columna: React.FC<ColumnaProps> = ({
  titulo, subtitulo, items, selectedId, onSelect, onMover, crear, editar, eliminar, reload, onError,
  placeholder, emptyMsg, promptMsg, activo, mayusculas = true,
}) => {
  const normEntrada = (v: string) => (mayusculas ? v.toUpperCase() : v.trim().toLowerCase());
  const estiloCaja  = mayusculas ? { textTransform: 'uppercase' as const } : {};
  const [nuevo,    setNuevo]    = useState('');
  const [editId,   setEditId]   = useState<number | null>(null);
  const [editVal,  setEditVal]  = useState('');
  const [busqueda, setBusqueda] = useState('');

  const agregar = async () => {
    const nombre = normEntrada(nuevo.trim());
    if (!nombre) return;
    try { await crear(nombre); setNuevo(''); reload(); } catch (e: any) { onError(e.message); }
  };
  const quitar = async (it: CatalogoItem) => {
    if (!confirm(`¿Eliminar "${it.nombre}"?`)) return;
    try { await eliminar(it.id); reload(); } catch (e: any) { onError(e.message); }
  };
  const guardar = async (it: CatalogoItem) => {
    const nombre = normEntrada(editVal.trim());
    if (!nombre || nombre === it.nombre) { setEditId(null); return; }
    try { await editar(it.id, nombre); setEditId(null); reload(); } catch (e: any) { onError(e.message); }
  };

  // Filtro local del buscador: mayúsculas + sin acentos (coincidencia por substring).
  const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(busqueda.trim());
  const itemsFiltrados = q ? items.filter((it) => norm(it.nombre).includes(q)) : items;

  return (
    <div style={panel}>
      <h3 style={panelTitle}>{titulo}</h3>
      {subtitulo && <p style={{ ...muted, margin: '-6px 0 10px' }}>{subtitulo}</p>}

      {!activo ? (
        <p style={muted}>{promptMsg}</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input value={nuevo} onChange={(e) => setNuevo(normEntrada(e.target.value))} placeholder={placeholder}
              style={{ ...input, ...estiloCaja }} onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }} />
            <button onClick={agregar} style={btnAdd}>Agregar</button>
          </div>
          {/* Buscador (aparece cuando hay elementos) */}
          {items.length > 0 && (
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar…"
              style={{ ...input, marginBottom: '10px' }}
            />
          )}

          {items.length === 0 ? (
            <p style={muted}>{emptyMsg}</p>
          ) : itemsFiltrados.length === 0 ? (
            <p style={muted}>Sin resultados para «{busqueda.trim()}».</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {itemsFiltrados.map((it) => {
                const sel = selectedId === it.id;
                return (
                  <div key={it.id} style={{ ...row, backgroundColor: sel ? '#EEF2FF' : '#fff', borderColor: sel ? theme.colors.primary : theme.colors.border }}>
                    {editId === it.id ? (
                      <>
                        <input autoFocus value={editVal} onChange={(e) => setEditVal(normEntrada(e.target.value))} style={{ ...input, padding: '4px 6px', ...estiloCaja }}
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
                        {onMover && (
                          <button onClick={() => onMover(it)} title="Reorganizar (mover de nivel)" style={btnMove}>⇄</button>
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
  const [corOri, setCorOri] = useState<CatalogoItem[]>([]);
  const [corDes, setCorDes] = useState<CatalogoItem[]>([]);
  const [selDep, setSelDep] = useState<CatalogoItem | null>(null);

  // ── Reorganizar jerarquía ──
  const [mover, setMover]       = useState<{ tipo: 'dep' | 'uni'; item: CatalogoItem } | null>(null);
  const [destino, setDestino]   = useState<number | ''>('');
  const [buscaDest, setBuscaDest] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso]       = useState<string | null>(null);

  const cerrarMover = () => { setMover(null); setDestino(''); setBuscaDest(''); };

  const hacerDegradar = async () => {
    if (!mover || !destino) return;
    setGuardando(true);
    try {
      const r = await dependenciaASubunidad(mover.item.id, Number(destino));
      setAviso(r.message); cerrarMover();
      cargarDeps(); if (selDep) cargarUnis(selDep.id);
      if (selDep?.id === mover.item.id) setSelDep(null);
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const hacerPromover = async () => {
    if (!mover) return;
    if (!confirm(`«${mover.item.nombre}» dejará de ser sub-unidad y pasará a ser una dependencia independiente. ¿Continuar?`)) return;
    setGuardando(true);
    try {
      const r = await subunidadADependencia(mover.item.id);
      setAviso(r.message); cerrarMover();
      cargarDeps(); if (selDep) cargarUnis(selDep.id);
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const hacerMoverUni = async () => {
    if (!mover || !destino) return;
    setGuardando(true);
    try {
      const r = await moverSubunidad(mover.item.id, Number(destino));
      setAviso(r.message); cerrarMover();
      if (selDep) cargarUnis(selDep.id);
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const cargarDeps = useCallback(() => {
    getDependencias().then((r) => setDeps(r.data)).catch((e) => setError(e.message));
  }, []);
  const cargarUnis = useCallback((depId: number) => {
    getUnidadesInternas(depId).then((r) => setUnis(r.data)).catch((e) => setError(e.message));
  }, []);
  const cargarRems = useCallback(() => {
    getRemitentes().then((r) => setRems(r.data)).catch((e) => setError(e.message));
  }, []);
  const cargarCorOri = useCallback(() => {
    getCorreos('origen').then((r) => setCorOri(r.data)).catch((e) => setError(e.message));
  }, []);
  const cargarCorDes = useCallback(() => {
    getCorreos('destino').then((r) => setCorDes(r.data)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { cargarDeps(); cargarRems(); cargarCorOri(); cargarCorDes(); },
    [cargarDeps, cargarRems, cargarCorOri, cargarCorDes]);
  useEffect(() => { if (selDep) cargarUnis(selDep.id); else setUnis([]); }, [selDep, cargarUnis]);

  return (
    <div style={{ fontFamily: theme.font.family, padding: '4px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: theme.colors.primaryDark }}>
        Catálogos de ingreso de oficios
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: theme.colors.textSecondary }}>
        Las <strong>sub-unidades</strong> cuelgan de su <strong>dependencia</strong> (elige una para verlas).
        Los <strong>remitentes</strong> y los <strong>correos</strong> son listas independientes.
        Los nombres se guardan en MAYÚSCULAS; los correos, en minúsculas.
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
          onMover={(it) => { setMover({ tipo: 'dep', item: it }); setDestino(''); setBuscaDest(''); }}
          crear={crearDependencia} editar={editarDependencia} eliminar={eliminarDependencia}
          reload={cargarDeps} onError={setError}
          placeholder="NUEVA DEPENDENCIA…" emptyMsg="Sin dependencias." activo
        />
        <Columna
          titulo="Sub-unidades"
          subtitulo={selDep ? selDep.nombre : null}
          items={unis}
          onMover={(it) => { setMover({ tipo: 'uni', item: it }); setDestino(''); setBuscaDest(''); }}
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

      {/* Correos: otro tema y otra pareja de listas, en su propia fila para que
          las columnas de arriba no se aprieten. */}
      <h3 style={{ margin: '22px 0 4px', fontSize: '0.95rem', fontWeight: 800, color: theme.colors.primaryDark }}>
        Correos para recepción por correo electrónico
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: theme.colors.textSecondary }}>
        Dos listas independientes: una no depende de la otra. Se usan al registrar un oficio que llegó por correo.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Columna
          titulo="Correos de quien envía"
          subtitulo="Cuentas desde las que las autoridades mandan el oficio"
          items={corOri}
          crear={(n) => crearCorreo('origen', n)}
          editar={(id, n) => editarCorreo('origen', id, n)}
          eliminar={(id) => eliminarCorreo('origen', id)}
          reload={cargarCorOri} onError={setError}
          placeholder="correo@dependencia.gob.mx" emptyMsg="Sin correos registrados."
          activo mayusculas={false}
        />
        <Columna
          titulo="Correos que reciben"
          subtitulo="Cuentas institucionales donde se recibe el oficio"
          items={corDes}
          crear={(n) => crearCorreo('destino', n)}
          editar={(id, n) => editarCorreo('destino', id, n)}
          eliminar={(id) => eliminarCorreo('destino', id)}
          reload={cargarCorDes} onError={setError}
          placeholder="cuenta@rppc.qroo.gob.mx" emptyMsg="Sin correos registrados."
          activo mayusculas={false}
        />
      </div>

      {/* ── Modal: reorganizar jerarquía ─────────────────────── */}
      <Modal
        open={!!mover}
        title={mover?.tipo === 'dep' ? 'Convertir dependencia en sub-unidad' : 'Reorganizar sub-unidad'}
        onClose={cerrarMover}
        width={560}
      >
        {mover && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '10px 12px', backgroundColor: theme.colors.background, borderRadius: '8px', fontSize: '0.85rem' }}>
              <strong>{mover.item.nombre}</strong>
            </div>

            {mover.tipo === 'uni' && (
              <div style={{ padding: '12px', border: `1px solid ${theme.colors.border}`, borderRadius: '8px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 700 }}>Convertir en dependencia</p>
                <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                  Deja de colgar de «{selDep?.nombre}» y pasa a ser una autoridad independiente.
                </p>
                <button onClick={hacerPromover} disabled={guardando} style={btnAdd}>↑ Convertir en dependencia</button>
              </div>
            )}

            <div style={{ padding: '12px', border: `1px solid ${theme.colors.border}`, borderRadius: '8px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 700 }}>
                {mover.tipo === 'dep' ? 'Convertir en sub-unidad de…' : 'Mover a otra dependencia…'}
              </p>
              {mover.tipo === 'dep' && (
                <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                  Si tiene sub-unidades propias, se reasignarán a la dependencia destino.
                </p>
              )}
              <input
                value={buscaDest}
                onChange={(e) => setBuscaDest(e.target.value)}
                placeholder="🔍 Buscar dependencia destino…"
                style={{ ...input, width: '100%', marginBottom: '8px' }}
              />
              <div style={{ maxHeight: '190px', overflowY: 'auto', border: `1px solid ${theme.colors.border}`, borderRadius: '6px' }}>
                {deps
                  .filter((d) => d.id !== mover.item.id
                    && (!buscaDest.trim() || d.nombre.toUpperCase().includes(buscaDest.trim().toUpperCase())))
                  .slice(0, 60)
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDestino(d.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', border: 'none',
                        padding: '7px 10px', cursor: 'pointer', fontSize: '0.8rem',
                        fontFamily: theme.font.family,
                        backgroundColor: destino === d.id ? theme.colors.primary : 'transparent',
                        color: destino === d.id ? '#fff' : theme.colors.textPrimary,
                      }}
                    >
                      {d.nombre}
                    </button>
                  ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={cerrarMover} style={{ ...btnAdd, backgroundColor: 'transparent', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}` }}>Cancelar</button>
              <button
                onClick={mover.tipo === 'dep' ? hacerDegradar : hacerMoverUni}
                disabled={!destino || guardando}
                style={{ ...btnAdd, opacity: (!destino || guardando) ? 0.5 : 1 }}
              >
                {guardando ? 'Aplicando…' : '⇄ Aplicar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {aviso && (
        <div
          role="status"
          onClick={() => setAviso(null)}
          style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1100, padding: '12px 16px', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, boxShadow: theme.shadow.lg, cursor: 'pointer' }}
        >
          ✓ {aviso}
        </div>
      )}
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
const btnMove: React.CSSProperties = { padding: '2px 7px', backgroundColor: 'transparent', color: theme.colors.primary, border: 'none', borderRadius: '5px', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', flexShrink: 0 };
const btnSave: React.CSSProperties = { padding: '2px 8px', backgroundColor: 'transparent', color: '#16A34A', border: 'none', borderRadius: '5px', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', flexShrink: 0 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid', borderRadius: '7px', padding: '4px 6px' };
const rowLabel: React.CSSProperties = { flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: theme.colors.textPrimary, padding: '2px 4px', fontFamily: theme.font.family };
const muted: React.CSSProperties = { margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' };
