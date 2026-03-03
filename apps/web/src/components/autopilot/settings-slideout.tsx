'use client';

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ConfigPanel } from './config-panel';

interface SettingsSlideoutProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSlideout({ open, onClose }: SettingsSlideoutProps): JSX.Element {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-0 right-0 z-[91] h-full w-full max-w-[480px] bg-[var(--surface)] border-l border-[var(--glass-border)] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)]">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Autopilot Settings</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-glass-hover transition-colors press-scale"
              >
                <X className="h-4 w-4 text-[var(--foreground-secondary)]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <ConfigPanel />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
