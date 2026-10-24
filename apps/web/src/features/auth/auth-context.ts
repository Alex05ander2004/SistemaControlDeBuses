import { createContext, useContext } from 'react';
import type { AuthUser, LoginCredentials } from './types';

export interface AuthContextValue {
  user: AuthUser | null;
  /** `loading` mientras se intenta restaurar la sesión al abrir la app. */
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
