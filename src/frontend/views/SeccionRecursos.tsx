/**
 * View: SeccionRecursos (SuperAdmin)
 * Administra los dos apartados de la pantalla de inicio de sesión.
 * Cada uno se puede habilitar/deshabilitar y ser un ENLACE o un ARCHIVO PDF.
 */

import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import {
  getRecursosConfig, guardarRecurso, subirArchivoRecurso,
  quitarArchivoRecurso, urlArchivoRecurso,
} from '../api';
import type { RecursoConfig, TipoRecurso } from '../api';

const VACIO: RecursoConfig = {
  titulo: '', tipo: 'enlace', habilitado: false, url: '', tieneArchivo: false, visible: false,
};

export const SeccionRecursos: React.FC = () => {
  const [r1, setR1] = useState<RecursoConfig>(VACIO);
  const [r2, setR2] = useState<RecursoConfig>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = () => {
    setCargando(true);
    getRecursosConfig()
      .then((r) => { setR1(r.data.recurso1); setR2(r.data.recurso2); })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  };
  useEffect(cargar, []);

  const notificar = (m: string) => { setAviso(m); setTimeout(() => setAviso(null), 4000); };

  if (cargando) return <p style={{ color: theme.colors.textSecondary }}>Cargando…</p>;

  return (
    <div style={{ fontFamily: theme.font.family, padding: '4px', maxWidth: '780px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: theme.colors.primaryDark }}>
        Recursos de la pantalla de inicio
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: '0.82rem', color: theme.colors.textSecondary }}>
        Se muestran <strong>debajo del formulario de acceso</strong>. Cada apartado aparece solo si está
        <strong> habilitado</strong> y tiene contenido cargado.
      </p>

      {error && (
        <div role="alert" onClick={() => setError(null)}
          style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }}>
          ⚠ {error}
        </div>
      )}
      {aviso && (
        <div role="status"
          style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#D1FAE5', color: '#065F46', fontSize: '0.82rem', fontWeight: 600 }}>
          ✓ {aviso}
        </div>
      )}

      <Apartado n={1} valor={r1} onCambio={setR1} onError={setError} onAviso={notificar} />
      <Apartado n={2} valor={r2} onCambio={setR2} onError={setError} onAviso={notificar} />
    </div>
  );
};

// ── Un apartado ───────────────────────────────────────────────
const Apartado: React.FC<{
  n: 1 | 2;
  valor: RecursoConfig;
  onCambio: (v: RecursoConfig) => void;
  onError: (m: string) => void;
  onAviso: (m: string) => void;
}> = ({ n, valor, onCambio, onError, onAviso }) => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const set = (p: Partial<RecursoConfig>) => onCambio({ ...valor, ...p });

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarRecurso(n, {
        titulo: valor.titulo, tipo: valor.tipo, url: valor.url, habilitado: valor.habilitado,
      });
      onAviso(`Apartado ${n} guardado`);
    } catch (e: any) { onError(e.message); }
    finally { setGuardando(false); }
  };

  const subir = async () => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      await subirArchivoRecurso(n, archivo);
      setArchivo(null); set({ tieneArchivo: true });
      onAviso(`Archivo del apartado ${n} cargado`);
    } catch (e: any) { onError(e.message); }
    finally { setSubiendo(false); }
  };

  const retirar = async () => {
    if (!confirm('¿Retirar el archivo de este apartado?')) return;
    try {
      await quitarArchivoRecurso(n);
      set({ tieneArchivo: false });
      onAviso('Archivo retirado');
    } catch (e: any) { onError(e.message); }
  };

  // Refleja lo que verá el usuario en el login.
  const hayContenido = valor.tipo === 'enlace' ? !!valor.url.trim() : valor.tieneArchivo;
  const seVera = valor.habilitado && hayContenido;

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h3 style={panelTitle}>Apartado {n}</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
          <input type="checkbox" checked={valor.habilitado}
            onChange={(e) => set({ habilitado: e.target.checked })}
            style={{ width: '17px', height: '17px', cursor: 'pointer' }} />
          Habilitado
        </label>
      </div>

      <label style={label}>Título del apartado</label>
      <input value={valor.titulo} onChange={(e) => set({ titulo: e.target.value })}
        placeholder="Ej. Video demostrativo de PRISMA" style={input} />

      <label style={{ ...label, marginTop: '14px' }}>Tipo de recurso</label>
      <div style={{ display: 'flex', gap: '18px', marginBottom: '4px' }}>
        {(['enlace', 'archivo'] as TipoRecurso[]).map((t) => (
          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="radio" name={`tipo${n}`} checked={valor.tipo === t}
              onChange={() => set({ tipo: t })} />
            {t === 'enlace' ? 'Enlace (URL)' : 'Archivo PDF'}
          </label>
        ))}
      </div>

      {valor.tipo === 'enlace' ? (
        <div style={{ marginTop: '10px' }}>
          <label style={label}>Enlace</label>
          <input value={valor.url} onChange={(e) => set({ url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..." style={input} />
        </div>
      ) : (
        <div style={{ marginTop: '10px' }}>
          <label style={label}>Archivo (PDF)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input type="file" accept=".pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              style={{ fontSize: '0.82rem', fontFamily: theme.font.family }} />
            <button onClick={subir} disabled={!archivo || subiendo}
              style={{ ...btn, opacity: (!archivo || subiendo) ? 0.5 : 1 }}>
              {subiendo ? 'Subiendo…' : valor.tieneArchivo ? 'Reemplazar' : 'Subir'}
            </button>
          </div>
          <div style={{ marginTop: '9px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {valor.tieneArchivo ? (
              <>
                <span style={{ fontSize: '0.78rem', color: '#065F46', fontWeight: 700 }}>✓ Archivo cargado</span>
                <a href={urlArchivoRecurso(n)} target="_blank" rel="noopener noreferrer" style={btnSec}>Ver actual</a>
                <button onClick={retirar} style={{ ...btnSec, color: '#B91C1C', borderColor: '#B91C1C' }}>Retirar</button>
              </>
            ) : (
              <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Sin archivo cargado.</span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button onClick={guardar} disabled={guardando} style={{ ...btn, opacity: guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: seVera ? '#065F46' : theme.colors.textSecondary }}>
          {seVera
            ? '● Se muestra en el login'
            : !valor.habilitado
              ? '○ Deshabilitado — no se muestra'
              : '○ Sin contenido — no se muestra'}
        </span>
      </div>
    </div>
  );
};

// ── estilos ──
const panel: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '10px',
  padding: '16px', backgroundColor: theme.colors.surface, marginBottom: '16px',
};
const panelTitle: React.CSSProperties = {
  margin: 0, fontSize: '0.95rem', fontWeight: 700, color: theme.colors.primaryDark,
};
const label: React.CSSProperties = {
  display: 'block', marginBottom: '5px', fontWeight: 600, fontSize: '0.8rem', color: theme.colors.charcoal,
};
const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: `1px solid ${theme.colors.border}`,
  borderRadius: '6px', fontSize: '0.85rem', fontFamily: theme.font.family, boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  padding: '9px 18px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none',
  borderRadius: '7px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: theme.font.family,
};
const btnSec: React.CSSProperties = {
  padding: '6px 12px', backgroundColor: '#fff', color: theme.colors.primary,
  border: `1px solid ${theme.colors.primary}`, borderRadius: '6px', fontWeight: 700,
  fontSize: '0.76rem', cursor: 'pointer', fontFamily: theme.font.family, textDecoration: 'none',
};
