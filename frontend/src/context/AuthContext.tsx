import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { CurrentUser, UserRole } from '@/types/api';
import { getMeApi, loginApi, logoutApi, registerApi } from '@/api';

interface AuthContextType {
  user: CurrentUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session on mount via GET /auth/me
  const refreshUser = useCallback(async () => {
    try {
      const me = await getMeApi();
      if (me && me.isActive) {
        setUser(me);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<CurrentUser> => {
    // 1. POST /auth/login sets ledgerline_session (HttpOnly) & ledgerline_csrf cookies
    await loginApi(email, password);
    // 2. Fetch current user identity from /auth/me
    const me = await getMeApi();
    setUser(me);
    return me;
  };

  const register = async (email: string, password: string): Promise<void> => {
    // POST /auth/register creates user account with role='holder'
    // Backend registration does NOT log in automatically. User must log in afterwards.
    await registerApi(email, password);
  };

  const logout = async (): Promise<void> => {
    try {
      await logoutApi();
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
