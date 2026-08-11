/**
 * View: Login — Gobierno del Estado de Quintana Roo
 * Diseño basado en el Toolkit Oficial 2022|2027
 */

import React, { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import { getRecursos, urlArchivoRecurso } from '../api';
import type { RecursoPublico } from '../api';

export const Login: React.FC = () => {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  // Recursos públicos (video y manual) — configurables desde el SUPERADMIN.
  // Si el endpoint falla, simplemente no se muestran: no debe estorbar el login.
  const [recursos, setRecursos] = useState<RecursoPublico[]>([]);
  useEffect(() => {
    getRecursos().then((r) => setRecursos(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Siempre redirigir a la pantalla de selección de módulo
      // SeleccionModulo se encarga de redirigir automáticamente si solo hay 1 módulo
      navigate('/seleccionar-modulo', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight:      '100vh',
      display:        'flex',
      background:     `linear-gradient(135deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 60%, ${theme.colors.primaryLight} 100%)`,
    }}>

      {/* Panel izquierdo — branding */}
      <div style={{
        flex:           '0 0 45%',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '48px',
        position:       'relative',
        overflow:       'hidden',
      }}>
        {/* Círculo decorativo fondo */}
        <div style={{
          position:        'absolute',
          width:           '500px',
          height:          '500px',
          borderRadius:    '50%',
          border:          '1px solid rgba(255,255,255,0.08)',
          top:             '-100px',
          left:            '-100px',
        }} />
        <div style={{
          position:        'absolute',
          width:           '300px',
          height:          '300px',
          borderRadius:    '50%',
          border:          '1px solid rgba(255,255,255,0.06)',
          bottom:          '-50px',
          right:           '-50px',
        }} />

        {/* Logo PRISMA */}
        <div style={{
          marginBottom:    '28px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderRadius:    '12px',
          padding:         '16px 24px',
          boxShadow:       '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          <img
            src="/LOGO.PRISMA.png"
            alt="Logo PRISMA"
            style={{
              width:     '180px',
              maxWidth:  '100%',
              objectFit: 'contain',
            }}
          />
        </div>

        <h1 style={{
          margin:        0,
          color:         theme.colors.white,
          fontSize:      '1.6rem',
          fontWeight:    900,
          fontFamily:    theme.font.family,
          textAlign:     'center',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}>
          RPPC
        </h1>
        <p style={{
          margin:        '6px 0 0',
          color:         theme.colors.gold,
          fontSize:      '0.75rem',
          fontWeight:    700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontFamily:    theme.font.family,
        }}>
          Gobierno del Estado de Quintana Roo
        </p>

        <div style={{
          marginTop:       '40px',
          padding:         '1px 32px',
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius:    '1px',
          width:           '60px',
        }} />

      </div>

      {/* Panel derecho — formulario */}
      <div style={{
        flex:           '0 0 55%',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        padding:        '48px',
      }}>
        <div style={{
          width:        '100%',
          maxWidth:     '420px',
        }}>
          <h2 style={{
            margin:      '0 0 8px',
            fontSize:    '1.5rem',
            fontWeight:  900,
            color:       theme.colors.primaryDark,
            fontFamily:  theme.font.family,
          }}>
            Iniciar Sesión
          </h2>
          <p style={{
            margin:      '0 0 36px',
            color:       theme.colors.textSecondary,
            fontSize:    '0.875rem',
          }}>
            Ingresa tus credenciales para acceder al sistema
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle} htmlFor="email">
                Usuario
              </label>
              <input
                id="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="ej. juanperez"
              />
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={labelStyle} htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div role="alert" style={{
                marginBottom:    '20px',
                padding:         '12px 16px',
                borderRadius:    theme.radius.sm,
                backgroundColor: '#FDE8EF',
                color:           theme.colors.primary,
                fontSize:        '0.875rem',
                fontWeight:      500,
                borderLeft:      `3px solid ${theme.colors.primary}`,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-login"
              disabled={loading}
              style={{
                fontFamily: theme.font.family,
                ['--btn-color' as any]:      theme.colors.primary,
                ['--btn-color-dark' as any]: theme.colors.primaryDark,
              } as React.CSSProperties}
            >
              {loading && <span className="spinner" aria-hidden />}
              {loading ? 'Verificando…' : 'Ingresar'}
            </button>
          </form>

          {/* ── Recursos públicos (configurables por el SUPERADMIN) ── */}
          {recursos.length > 0 && (
            <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: `1px solid ${theme.colors.border}`, display: 'grid', gap: '10px' }}>
              {recursos.map((r) => (
                <a
                  key={r.slot}
                  className="recurso-card"
                  href={r.tipo === 'enlace' ? r.url : urlArchivoRecurso(r.slot)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={recursoVars}
                >
                  <span style={recursoTitulo}>{r.titulo}</span>
                  <span className="recurso-flecha" aria-hidden>→</span>
                </a>
              ))}
            </div>
          )}

          <p style={{
            marginTop:  '32px',
            textAlign:  'center',
            fontSize:   '0.75rem',
            color:      theme.colors.grayMid,
          }}>
            Unidos para Transformar · Quintana Roo 2022–2027
          </p>
        </div>
      </div>
    </div>
  );
};

// ── Estilos de los apartados de recursos ──
// El diseño (animación, hover) vive en global.css bajo .recurso-card; aquí solo
// se pasan los colores del tema como variables CSS.
const recursoVars = {
  ['--recurso-acento' as any]: theme.colors.primary,
  ['--recurso-borde'  as any]: theme.colors.border,
} as React.CSSProperties;

const recursoTitulo: React.CSSProperties = {
  fontSize: '0.85rem', fontWeight: 700, color: theme.colors.charcoal,
  fontFamily: theme.font.family, minWidth: 0, lineHeight: 1.35,
};

const labelStyle: React.CSSProperties = {
  display:      'block',
  marginBottom: '6px',
  fontWeight:   700,
  fontSize:     '0.8rem',
  color:        theme.colors.charcoal,
  textTransform:'uppercase',
  letterSpacing:'0.05em',
  fontFamily:   theme.font.family,
};

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '12px 14px',
  border:       `1.5px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  fontSize:     '0.9rem',
  fontFamily:   theme.font.family,
  outline:      'none',
  boxSizing:    'border-box',
  color:        theme.colors.textPrimary,
  backgroundColor: theme.colors.white,
  transition:   'border-color 0.2s',
};
