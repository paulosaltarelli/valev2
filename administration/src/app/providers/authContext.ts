import { createContext, useContext } from 'react';
import type { RmUser } from '../../shared/lib/http';

export type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
    user: RmUser | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}


