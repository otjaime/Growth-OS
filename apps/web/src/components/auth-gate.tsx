'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { BarChart3, Lock, LogOut } from 'lucide-react';
import { API, getAuthToken, setAuthToken, clearAuthToken } from '@/lib/api';

interface AuthCtx { logout: () => void }
const AuthContext = createContext<AuthCtx>({ logout: () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getAuthToken();

    // Probe a protected endpoint to check if auth is required / token valid
    fetch(`${API}/api/settings/mode`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 401) {
          clearAuthToken();
          setAuthed(false);
        } else {
          setAuthed(true);
        }
      })
      .catch(() => {
        // API unreachable — let user through so they see error states on pages
        setAuthed(true);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await r.json()) as { success: boolean; token?: string; message?: string };
      if (data.success && data.token) {
        setAuthToken(data.token);
        setAuthed(true);
      } else {
        setError(data.message ?? 'Invalid password');
      }
    } catch {
      setError('Cannot connect to API server.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAuthToken();
    setAuthed(false);
    setPassword('');
  };

  if (authed === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <BarChart3 className="h-8 w-8 text-apple-blue" />
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Growth OS</h1>
          </div>
          <form onSubmit={handleLogin} className="card glass-elevated space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-[var(--foreground-secondary)]" />
              <p className="text-sm text-[var(--foreground-secondary)]">Enter your password to continue</p>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-2.5 bg-white/[0.06] border border-[var(--glass-border)] rounded-[var(--radius-md)] text-[var(--foreground)] text-sm placeholder-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none"
              autoFocus
            />
            {error && <p className="text-apple-red text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2.5 bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 text-white rounded-[var(--radius-md)] text-sm font-medium transition-all ease-spring"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Small logout button for sidebars / headers */
export function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button
      onClick={logout}
      title="Sign out"
      className="flex items-center gap-1.5 text-xs text-[var(--foreground-secondary)]/50 hover:text-[var(--foreground-secondary)] transition-all ease-spring"
    >
      <LogOut className="h-3 w-3" /> Sign out
    </button>
  );
}
