import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authService from './auth-service';
import { AuthContext, type AuthContextValue } from './auth-context';
import type { AuthUser, LoginCredentials } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');

  useEffect(() => {
    let active = true;
    authService.restoreSession().then((restored) => {
      if (!active) return;
      setUser(restored);
      setStatus(restored ? 'authenticated' : 'anonymous');
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const loggedIn = await authService.login(credentials);
    setUser(loggedIn);
    setStatus('authenticated');
    return loggedIn;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
