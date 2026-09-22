/**
 * Component: PanelTranscripcion
 * File: src/frontend/components/visor/PanelTranscripcion.tsx
 *
 * Transcripción IA/humana editable — port de AITranscriptionPanel.tsx
 * (VISAR). La generación IA llama al motor OCR real del proyecto
 * (src/services/ocr/ocr.engine.ts vía el endpoint del backend), no a un
 * texto de relleno.
 */
import React, { useEffect, useState } from 'react';
import { Icono } from '../Icono';
import { theme } from '../../theme';
import { getTranscripcion, generarTranscripcionIA, actualizarTranscripcion } from '../../services/visorApi';
import type { VisorTranscripcion } from '../../types';

interface Props {
  fojaId:    number | null;
  puedeEditar: boolean;
}

export const PanelTranscripcion: React.FC<Props> = ({ fojaId, puedeEditar }) => {
  const [transcripcion, setTranscripcion] = useState<VisorTranscripcion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (!fojaId) { setTranscripcion(null); setEditando(false); return; }
    setCargando(true); setError(null); setEditando(false);
    getTranscripcion(fojaId)
      .then(setTranscripcion)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setCargando(false));
  }, [fojaId]);

  const generar = async () => {
    if (!fojaId) return;
    setGenerando(true); setError(null);
    try {
      setTranscripcion(await generarTranscripcionIA(fojaId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar la transcripción.');
    } finally { setGenerando(false); }
  };

  const guardar = async () => {
    if (!fojaId || !texto.trim()) return;
    setGuardando(true); setError(null);
    try {
      setTranscripcion(await actualizarTranscripcion(fojaId, texto));
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally { setGuardando(false); }
  };

  if (!fojaId) {
    return <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Selecciona una foja para ver la transcripción.</p>;
  }
  if (cargando) {
    return <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Cargando…</p>;
  }
  if (error && !transcripcion) {
    return <p style={{ fontSize: '0.78rem', color: theme.colors.alert.red }}>{error}</p>;
  }

  if (!transcripcion) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, margin: 0 }}>
          Esta foja todavía no tiene transcripción. Se recomienda verificación manual antes de incorporarla al expediente.
        </p>
        {puedeEditar && (
          <button onClick={generar} disabled={generando} style={btnPrimario(generando)}>
            {generando ? 'Generando…' : 'Generar con IA'}
          </button>
        )}
      </div>
    );
  }

  if (editando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border}`, fontSize: '0.82rem', fontFamily: theme.font.family, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setEditando(false)} style={btnSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={btnPrimario(guardando)}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ fontSize: '0.82rem', lineHeight: 1.6, color: theme.colors.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>
        {transcripcion.texto_transcrito}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: transcripcion.origen === 'IA' ? theme.colors.gold : theme.colors.alert.green }}>
          {transcripcion.origen === 'IA' ? `Borrador IA${transcripcion.modelo_ia ? ` (${transcripcion.modelo_ia})` : ''}` : 'Validado por humano'}
        </span>
        {puedeEditar && (
          <button
            onClick={() => { setTexto(transcripcion.texto_transcrito); setEditando(true); }}
            style={{ background: 'none', border: 'none', color: theme.colors.primary, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            <Icono nombre="editar" inline size={12} />Editar
          </button>
        )}
      </div>
    </div>
  );
};

const btnPrimario = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: theme.radius.sm, border: 'none',
  background: theme.colors.primary, color: '#fff', fontWeight: 700, fontSize: '0.8rem',
  fontFamily: theme.font.family, cursor: 'pointer', opacity: disabled ? 0.6 : 1,
});
const btnSecundario: React.CSSProperties = {
  padding: '8px 14px', borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border}`,
  background: '#fff', color: theme.colors.textPrimary, fontWeight: 600, fontSize: '0.8rem',
  fontFamily: theme.font.family, cursor: 'pointer',
};

export default PanelTranscripcion;
