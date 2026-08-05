import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  api,
  setToken,
  setUnauthorizedHandler,
  getToken,
  type User,
} from "@/lib/api";

interface AuthValue {
  user: User | null;
  /** True until the stored token has been checked against the server. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  /** Apply a fresh user object, e.g. after editing profile goals. */
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUserState(null);
  }, []);

  // A 401 from any request means the token is dead — drop it rather than
  // leaving the UI showing a signed-in shell that cannot load anything.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Restore the session on load. The token lives in localStorage, so it
  // survives a refresh, but it still has to be validated against the server.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setUserState(me);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    setToken(result.access_token);
    setUserState(result.user);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await api.signup(email, password, name);
      setToken(result.access_token);
      setUserState(result.user);
    },
    [],
  );

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, setUser: setUserState }),
    [user, loading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }
  return context;
}
