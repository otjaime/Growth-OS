'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';

interface DemoModeState {
  isDemoMode: boolean;
  isLoading: boolean;
}

const DemoModeContext = createContext<DemoModeState>({
  isDemoMode: false,
  isLoading: true,
});

export function DemoModeProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/settings/mode')
      .then((r) => r.json())
      .then((data: { mode: string }) => {
        setIsDemoMode(data.mode === 'demo');
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <DemoModeContext.Provider value={{ isDemoMode, isLoading }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeState {
  return useContext(DemoModeContext);
}
