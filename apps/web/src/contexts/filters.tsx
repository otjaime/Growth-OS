'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface FilterState {
  channelFilter: string | null;
  setChannelFilter: (channel: string | null) => void;
}

const FilterContext = createContext<FilterState>({
  channelFilter: null,
  setChannelFilter: () => {},
});

export function FilterProvider({ children }: { children: ReactNode }) {
  const [channelFilter, setChannelFilter] = useState<string | null>(null);

  return (
    <FilterContext.Provider value={{ channelFilter, setChannelFilter }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterState {
  return useContext(FilterContext);
}
