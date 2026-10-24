import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types/index.js';
import { api, ApiError } from '../api/client.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(api.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for 401 events from ApiClient
    api.onUnauthorized(() => {
      setUser(null);
      setToken(null);
    });

    const verifySession = async () => {
      if (!api.getToken()) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await api.getMe();
        setUser(currentUser);
        setToken(api.getToken());
      } catch (err: any) {
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.login(email, password);
      setUser(data.user);
      setToken(data.token);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err.message || 'Login failed. Please check your network connection.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    api.setToken(null);
    setUser(null);
    setToken(null);
    setError(null);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, error, login, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
