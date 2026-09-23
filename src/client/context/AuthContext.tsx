import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, UserProfile } from '../../shared/types/index.ts';
import { api, getStoredAuthToken, setStoredAuthToken, removeStoredAuthToken } from '../lib/api.ts';

export interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
  canExtract: boolean;
  canCommit: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      const token = getStoredAuthToken();
      if (!token) {
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const res = await api.getMe();
      if (res && res.authenticated) {
        setUser(res.user);
        setProfile(res.profile);
      } else {
        setUser(null);
        setProfile(null);
        removeStoredAuthToken();
      }
    } catch (err) {
      console.warn('Auth token verification notice:', err);
      setUser(null);
      setProfile(null);
      removeStoredAuthToken();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    if (res.session?.access_token) {
      setStoredAuthToken(res.session.access_token);
      setUser(res.user);
      setProfile(res.profile);
    }
  };

  const register = async (email: string, pass: string) => {
    const res = await api.register(email, pass);
    if (res.session?.access_token) {
      setStoredAuthToken(res.session.access_token);
      setUser(res.user);
      setProfile(res.profile);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // Ignore logout errors
    } finally {
      removeStoredAuthToken();
      setUser(null);
      setProfile(null);
    }
  };

  const role: UserRole = profile?.role || 'viewer';
  const isAdmin = role === 'admin';
  const isReviewer = role === 'reviewer' || role === 'admin';
  const canExtract = isReviewer;
  const canCommit = isReviewer;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAuthenticated: !!user,
        isLoading,
        isAdmin,
        isReviewer,
        canExtract,
        canCommit,
        login,
        register,
        logout,
        refreshProfile: fetchCurrentUser,
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
