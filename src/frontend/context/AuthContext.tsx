/**
 * Context: Auth
 * Provides current user and login/logout helpers app-wide.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import type { AuthUser } from '../types';
import { login as apiLogin } from '../api';

interface AuthContextValue {
  user:    AuthUser | null;
  token:   string | null;
  login:   (email: string, password: string) => Promise<void>;
  logout:  () => void;
  loading: boolean;
  /**
   * La contraseña con la que entró la puso un tercero —el alta o un
   * restablecimiento del superadmin— y hay que cambiarla antes de nada. Lo dice el
   * servidor al iniciar sesión; se guarda junto al token porque tiene que
   * sobrevivir a una recarga de la página: si no, bastaría con refrescar para
   * saltarse la pantalla.
   */
  debeCambiarPassword: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [debeCambiarPassword, setDebeCambiar] = useState(false);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser  = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser) as AuthUser);
      setDebeCambiar(localStorage.getItem('debe_cambiar_password') === '1');
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: t, user: u, debe_cambiar_password } = await apiLogin(email, password);
    localStorage.setItem('token', t);
    localStorage.setItem('user',  JSON.stringify(u));
    if (debe_cambiar_password) localStorage.setItem('debe_cambiar_password', '1');
    else                       localStorage.removeItem('debe_cambiar_password');
    setToken(t);
    setUser(u);
    setDebeCambiar(Boolean(debe_cambiar_password));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('debe_cambiar_password');
    setToken(null);
    setUser(null);
    setDebeCambiar(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, debeCambiarPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
