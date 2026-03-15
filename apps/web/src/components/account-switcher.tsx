'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Briefcase, ChevronDown, Search, Check } from 'lucide-react';
import clsx from 'clsx';
import { useClient } from '@/contexts/client';

export function AccountSwitcher() {
  const { selectedClientId, selectedClient, clients, isLoading, setSelectedClientId } = useClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedClientId(id);
      setOpen(false);
      setSearch('');
    },
    [setSelectedClientId],
  );

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.vertical.toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="px-3 py-3 border-b border-[var(--glass-border)]">
        <div className="h-9 rounded-lg bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  if (clients.length === 0) return null;

  return (
    <div ref={containerRef} className="relative px-3 py-3 border-b border-[var(--glass-border)]">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
          'border border-[var(--glass-border)]',
          'hover:bg-white/[0.06]',
          open ? 'bg-white/[0.08] border-[var(--apple-blue)]/50' : 'bg-white/[0.03]',
        )}
      >
        <Briefcase className="w-4 h-4 text-[var(--foreground-secondary)] shrink-0" />
        <span className="flex-1 text-left truncate">
          {selectedClient ? selectedClient.name : 'All Accounts'}
        </span>
        {selectedClient && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[var(--foreground-secondary)] uppercase tracking-wider shrink-0">
            {selectedClient.vertical}
          </span>
        )}
        <ChevronDown
          className={clsx(
            'w-3.5 h-3.5 text-[var(--foreground-secondary)] transition-transform shrink-0',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={clsx(
            'absolute left-3 right-3 top-full mt-1 z-50',
            'rounded-xl border border-[var(--glass-border)]',
            'bg-[var(--glass-bg)] backdrop-blur-2xl',
            'shadow-xl shadow-black/20',
            'max-h-[320px] flex flex-col',
          )}
        >
          {/* Search */}
          {clients.length > 3 && (
            <div className="p-2 border-b border-[var(--glass-border)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-secondary)]" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search accounts..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white/[0.04] border border-[var(--glass-border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:outline-none focus:border-[var(--apple-blue)]/50"
                />
              </div>
            </div>
          )}

          {/* Options */}
          <div className="overflow-y-auto flex-1 py-1">
            {/* All Accounts option */}
            <button
              onClick={() => handleSelect(null)}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                'hover:bg-white/[0.06]',
                selectedClientId === null && 'text-[var(--apple-blue)]',
              )}
            >
              <Briefcase className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">All Accounts</span>
              <span className="text-[10px] text-[var(--foreground-secondary)]">Portfolio</span>
              {selectedClientId === null && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>

            {/* Divider */}
            <div className="mx-3 my-1 border-t border-[var(--glass-border)]" />

            {/* Client options */}
            {filtered.map((client) => (
              <button
                key={client.id}
                onClick={() => handleSelect(client.id)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                  'hover:bg-white/[0.06]',
                  selectedClientId === client.id && 'text-[var(--apple-blue)]',
                )}
              >
                <div className="w-4 h-4 rounded bg-white/[0.08] flex items-center justify-center text-[10px] font-medium shrink-0">
                  {client.name.charAt(0)}
                </div>
                <span className="flex-1 text-left truncate">{client.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[var(--foreground-secondary)] uppercase tracking-wider shrink-0">
                  {client.vertical}
                </span>
                {selectedClientId === client.id && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))}

            {filtered.length === 0 && search && (
              <div className="px-3 py-4 text-xs text-center text-[var(--foreground-secondary)]">
                No accounts match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
