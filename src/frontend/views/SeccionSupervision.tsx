/**
 * View: SeccionSupervision
 * Panel de supervisión de módulos para la Directora General.
 * File: src/frontend/views/SeccionSupervision.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { theme } from '../theme';
import type { ResumenModulo } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Component ─────────────────────────────────────────────────

export const SeccionSupervision: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const isMobile = useIsMobile();
  const [resumenes, setResumenes] = useState<ResumenModulo[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: ResumenModulo[] }>('/director/supervision');
      // Ordenar por campo orden
      const sorted = [...res.data].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      setResumenes(sorted);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: embedded ? 0 : (isMobile ? '16px 12px' : '24px'), fontFamily: theme.font.family }}>

      {/* Header — oculto cuando está embebido en una sección colapsable */}
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, color: theme.colors.primaryDark, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Supervisión de Módulos
            </h2>
            <p style={{ margin: '3px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
              Estado actual de todos los módulos del sistema
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background:   theme.colors.primary,
              border:       'none',
              color:        '#fff',
              padding:      '8px 16px',
              borderRadius: '6px',
              cursor:       loading ? 'not-allowed' : 'pointer',
              fontSize:     '0.85rem',
              fontWeight:   600,
              opacity:      loading ? 0.7 : 1,
            }}
          >
            ↻ Actualizar
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: theme.colors.textSecondary }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Cargando supervisión…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ padding: '16px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '8px', marginBottom: '16px' }}>
          <strong>Error al cargar:</strong> {error}
        </div>
      )}

      {/* Grid de tarjetas */}
      {!loading && !error && (
        resumenes.length === 0 ? (
          <p style={{ textAlign: 'center', color: theme.colors.textSecondary, padding: '40px 0' }}>
            No hay módulos activos registrados.
          </p>
        ) : (
          <div style={{
            display:             'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
            gap:                 isMobile ? '12px' : '20px',
          }}>
            {resumenes.map((r) => (
              <TarjetaModulo key={r.id} resumen={r} />
            ))}
          </div>
        )
      )}
    </div>
  );
};

// ── TarjetaModulo ─────────────────────────────────────────────

const TarjetaModulo: React.FC<{ resumen: ResumenModulo }> = ({ resumen }) => {
  const hasError     = Boolean(resumen.error);
  const alertas      = resumen.alertas  ?? 0;
  const pendientes   = resumen.pendientes ?? 0;

  let borderColor = theme.colors.alert.green;
  if (alertas > 0) {
    borderColor = theme.colors.alert.red;
  } else if (pendientes > 0) {
    borderColor = theme.colors.alert.yellow;
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius:    '10px',
      boxShadow:       theme.shadow.sm,
      borderLeft:      `4px solid ${hasError ? theme.colors.grayMid : borderColor}`,
      overflow:        'hidden',
    }}>
      {/* Card header */}
      <div style={{
        padding:      '14px 18px 10px',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: theme.colors.primary }}>
          {resumen.nombre}
        </h3>
        <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {resumen.clave}
        </p>
      </div>

      {/* Card body */}
      <div style={{ padding: '16px 18px' }}>
        {hasError ? (
          <div style={{ padding: '10px 12px', backgroundColor: '#FEF2F2', borderRadius: '6px', fontSize: '0.8rem', color: theme.colors.alert.red }}>
            <strong>⚠ Error:</strong> {resumen.error}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
            <MetricaItem
              label="Activos"
              value={resumen.activos ?? 0}
              color={theme.colors.primary}
              big
            />
            <MetricaItem
              label="Pendientes"
              value={resumen.pendientes ?? 0}
              color={pendientes > 0 ? theme.colors.alert.yellow : theme.colors.textSecondary}
            />
            <MetricaItem
              label="Alertas"
              value={resumen.alertas ?? 0}
              color={alertas > 0 ? theme.colors.alert.red : theme.colors.textSecondary}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ── MetricaItem ───────────────────────────────────────────────

const MetricaItem: React.FC<{ label: string; value: number; color: string; big?: boolean }> = ({ label, value, color, big }) => (
  <div style={{ textAlign: 'center', flex: 1 }}>
    <div style={{ fontSize: big ? '2rem' : '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>
      {value}
    </div>
    <div style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, marginTop: '4px', fontWeight: 500 }}>
      {label}
    </div>
  </div>
);
