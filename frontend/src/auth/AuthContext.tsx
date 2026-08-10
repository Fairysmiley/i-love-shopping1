import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, refreshSession, setAccessToken, setUnauthorizedHandler } from '../api/client';
import type { AuthResponse, User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<LoginOutcome>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  applyTokenFromOAuth: (token: string) => Promise<void>;
  /** Finishes a mandatory-2FA-enrollment login: applies the full session
   * returned by POST /auth/2fa/enable once enrollment is confirmed. */
  completeTwoFactorSetupLogin: (accessToken: string, user: User) => void;
}

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  captchaToken?: string;
}

type LoginOutcome = { ok: true } | { requiresTwoFactor: true } | { requiresTwoFactorSetup: true };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const me = await api.get<User>('/users/me');
    setUser(me);
  }, []);

  // On boot, try to restore a session via the refresh cookie.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      const restored = await refreshSession();
      if (restored) {
        try {
          await loadProfile();
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, [loadProfile]);

  const login = useCallback<AuthContextValue['login']>(
    async (email, password, twoFactorCode) => {
      const res = await api.post<
        AuthResponse | { requiresTwoFactor: true } | { requiresTwoFactorSetup: true; accessToken: string }
      >('/auth/login', { email, password, twoFactorCode });
      if ('requiresTwoFactor' in res) {
        return { requiresTwoFactor: true };
      }
      if ('requiresTwoFactorSetup' in res) {
        // A privileged role with no 2FA enrolled yet — this token can only
        // call the 2FA setup/enable endpoints (enforced server-side), so
        // hold it in memory while the login page walks through enrollment.
        setAccessToken(res.accessToken);
        return { requiresTwoFactorSetup: true };
      }
      setAccessToken(res.accessToken);
      setUser(res.user);
      return { ok: true };
    },
    [],
  );

  const completeTwoFactorSetupLogin = useCallback((accessToken: string, user: User) => {
    setAccessToken(accessToken);
    setUser(user);
  }, []);

  const register = useCallback<AuthContextValue['register']>(async (input) => {
    const res = await api.post<AuthResponse>('/auth/register', input);
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Never refresh on 401 during logout — that would revive the session we are ending.
      await api.post('/auth/logout', undefined, { retryOnAuth: false });
    } catch {
      // Clear local session even if the server call fails (offline, expired token, etc.).
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const applyTokenFromOAuth = useCallback(
    async (token: string) => {
      setAccessToken(token);
      await loadProfile();
    },
    [loadProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refreshProfile: loadProfile,
      applyTokenFromOAuth,
      completeTwoFactorSetupLogin,
    }),
    [user, loading, login, register, logout, loadProfile, applyTokenFromOAuth, completeTwoFactorSetupLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
