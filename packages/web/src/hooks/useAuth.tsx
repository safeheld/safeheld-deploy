import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../api/client';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ mfa_required?: boolean; mfa_setup_required?: boolean; temp_token?: string }>;
  setupMfa: (tempToken: string) => Promise<{ secret: string; qrCodeDataUrl: string }>;
  verifyMfa: (tempToken: string, code: string, isSetup?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore user from localStorage on mount
    const token = localStorage.getItem('access_token');
    const stored = localStorage.getItem('auth_user');
    if (token && stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.clear();
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    return result;
  }, []);

  const setupMfa = useCallback(async (tempToken: string) => {
    return authApi.setupMfa(tempToken);
  }, []);

  const verifyMfa = useCallback(async (tempToken: string, code: string, isSetup = false) => {
    const result = await authApi.verifyMfa(tempToken, code, isSetup);
    if (result.access_token) {
      localStorage.setItem('access_token', result.access_token);
      localStorage.setItem('refresh_token', result.refresh_token);
      const authUser: AuthUser = {
        userId: result.user.id,
        firmId: result.user.firmId,
        email: result.user.email,
        role: result.user.role,
        name: result.user.name,
      };
      localStorage.setItem('auth_user', JSON.stringify(authUser));
      setUser(authUser);
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {});
    }
    localStorage.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, setupMfa, verifyMfa, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
