/**
 * App: Main router and layout
 * File: src/frontend/App.tsx
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DialogoProvider } from './context/DialogoContext';

import { Login }              from './views/Login';
import { SeleccionModulo }    from './views/SeleccionModulo';
import { Dashboard_Oficial }  from './views/Dashboard_Oficial';
import { Dashboard_Gestion }  from './views/Dashboard_Gestion';
import { Dashboard_Juridico } from './views/Dashboard_Juridico';
import { SeccionCatalogos }  from './views/SeccionCatalogos';
import { Dashboard_Director } from './views/Dashboard_Director';
import { Dashboard_SuperAdmin } from './views/Dashboard_SuperAdmin';
import { Dashboard_DirectorArea } from './views/Dashboard_DirectorArea';
import { Dashboard_Tramites }     from './views/Dashboard_Tramites';
import { AppShell }           from './components/AppShell';

import { theme } from './theme';

// ── Protected route wrapper ──────────────────────────────────────────────────

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight:       '100vh',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          backgroundColor: theme.colors.background,
          color:           theme.colors.textSecondary,
        }}
      >
        Cargando…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

// ── Main App ─────────────────────────────────────────────────────────────────

function App() {
  return (
    <AuthProvider>
      <DialogoProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/seleccionar-modulo"
            element={
              <ProtectedRoute>
                <SeleccionModulo />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/oficial"
            element={
              <ProtectedRoute>
                <AppShell><Dashboard_Oficial /></AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/gestion"
            element={
              <ProtectedRoute>
                <AppShell><Dashboard_Gestion /></AppShell>
              </ProtectedRoute>
            }
          />

          {/* Catálogos para quien tenga el módulo. Es la misma pantalla que usa
              el SuperAdmin y las mismas tablas: aquí solo cambia por dónde se
              entra, no qué se ve ni de dónde sale. */}
          <Route
            path="/catalogos"
            element={
              <ProtectedRoute>
                <AppShell><SeccionCatalogos /></AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/juridico"
            element={
              <ProtectedRoute>
                <AppShell><Dashboard_Juridico /></AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/director"
            element={
              <ProtectedRoute>
                <AppShell><Dashboard_Director /></AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/superadmin"
            element={
              <ProtectedRoute>
                <AppShell><Dashboard_SuperAdmin /></AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/director-area"
            element={
              <ProtectedRoute>
                <AppShell><Dashboard_DirectorArea /></AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/tramites"
            element={
              <ProtectedRoute>
                <AppShell><Dashboard_Tramites /></AppShell>
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/seleccionar-modulo" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      </DialogoProvider>
    </AuthProvider>
  );
}

export default App;
