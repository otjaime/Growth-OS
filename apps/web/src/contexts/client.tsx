'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';

interface ClientOption {
  readonly id: string;
  readonly name: string;
  readonly vertical: string;
}

interface ClientContextState {
  selectedClientId: string | null;
  selectedClient: ClientOption | null;
  clients: readonly ClientOption[];
  isLoading: boolean;
  setSelectedClientId: (id: string | null) => void;
}

const STORAGE_KEY = 'growth_os_selected_client';

const ClientContext = createContext<ClientContextState>({
  selectedClientId: null,
  selectedClient: null,
  clients: [],
  isLoading: true,
  setSelectedClientId: () => {},
});

export function ClientProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [clients, setClients] = useState<readonly ClientOption[]>([]);
  const [selectedClientId, setSelectedClientIdRaw] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/clients')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ id: string; name: string; vertical: string }>) => {
        const options: ClientOption[] = data.map((c) => ({
          id: c.id,
          name: c.name,
          vertical: c.vertical,
        }));
        setClients(options);

        // Restore from localStorage, validate it still exists
        const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (stored && options.some((c) => c.id === stored)) {
          setSelectedClientIdRaw(stored);
        } else {
          // Invalid or missing — clear stale value
          if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
          setSelectedClientIdRaw(null);
        }

        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const setSelectedClientId = useCallback(
    (id: string | null) => {
      setSelectedClientIdRaw(id);
      if (typeof window !== 'undefined') {
        if (id) {
          localStorage.setItem(STORAGE_KEY, id);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    },
    [],
  );

  const selectedClient = selectedClientId
    ? (clients.find((c) => c.id === selectedClientId) ?? null)
    : null;

  return (
    <ClientContext.Provider
      value={{ selectedClientId, selectedClient, clients, isLoading, setSelectedClientId }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClient(): ClientContextState {
  return useContext(ClientContext);
}
