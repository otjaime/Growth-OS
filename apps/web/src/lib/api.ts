export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('growth_os_token');
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem('growth_os_token', token);
}

export function clearAuthToken(): void {
  sessionStorage.removeItem('growth_os_token');
}

/** Fetch wrapper that injects the stored Bearer token */
export function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const url = path.startsWith('http') ? path : `${API}${path}`;
  return fetch(url, {
    ...opts,
    headers: {
      ...opts?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
