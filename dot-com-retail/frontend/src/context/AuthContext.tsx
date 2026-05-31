import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
  id: number;
  username: string;
  email: string;
  is_staff?: boolean;
  is_active?: boolean;
  created_at?: string;
  twofa_enabled?: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: User | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
    login: (accessToken: string, user: User) => void;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Keep tokens and user data in memory only
  const [authState, setAuthState] = useState<AuthState>({
    accessToken: null,
    user: null,
  });

  const login = useCallback((accessToken: string, user: User) => {
    setAuthState({
      accessToken,
      user,
    });
  }, []);

  const logout = useCallback(async () => {
    // Try to call backend to clear refresh token cookie
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/users/token/revoke/`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore errors - clear frontend state anyway
    }
    
    // Clear frontend state
    setAuthState({
      accessToken: null,
      user: null,
    });
  }, []);

  const getAccessToken = useCallback(() => {
    return authState.accessToken;
  }, [authState.accessToken]);

  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/users/token/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Use HttpOnly cookie for refresh
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setAuthState(prev => ({
          ...prev,
          accessToken: data.access,
        }));
        return data.access;
      } else {
        logout();
        return null;
      }
    } catch (error) {
      logout();
      return null;
    }
  }, [logout]);

  // Auto-refresh on mount to restore session (if refresh cookie exists)
  useEffect(() => {
    (async () => {
      const access = await refreshAccessToken();
      if (access) {
        try {
          const profileResp = await fetch(`${import.meta.env.VITE_API_URL}/users/profile/`, {
            headers: { 'Authorization': `Bearer ${access}` },
            credentials: 'include',
          });
          if (profileResp.ok) {
            const user = await profileResp.json();
            setAuthState(prev => ({ ...prev, user }));
          }
        } catch {
          // ignore
        }
      }
    })();
  }, [refreshAccessToken]);

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!authState.accessToken,
      user: authState.user,
      login,
      logout,
      getAccessToken,
      refreshAccessToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};