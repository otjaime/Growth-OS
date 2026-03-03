'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, Undo2, Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { apiFetch } from '@/lib/api';

interface UndoToastItem {
  id: string;
  logId: string;
  message: string;
  timestamp: number;
}

interface UndoToastProps {
  /** Duration in ms before toast auto-dismisses (default 8000) */
  duration?: number;
}

// Global event emitter for undo toasts (avoids prop drilling)
type UndoListener = (item: Omit<UndoToastItem, 'timestamp'>) => void;
const listeners = new Set<UndoListener>();

export function showUndoToast(logId: string, message: string): void {
  const item = { id: `${logId}-${Date.now()}`, logId, message };
  listeners.forEach((fn) => fn(item));
}

export function UndoToastProvider({ duration = 8000 }: UndoToastProps): JSX.Element {
  const [toasts, setToasts] = useState<UndoToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Subscribe to global emitter
  useEffect(() => {
    const handler: UndoListener = (item) => {
      setToasts((prev) => [...prev, { ...item, timestamp: Date.now() }]);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  // Auto-dismiss timers
  useEffect(() => {
    for (const toast of toasts) {
      if (!timersRef.current.has(toast.id)) {
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
          timersRef.current.delete(toast.id);
        }, duration);
        timersRef.current.set(toast.id, timer);
      }
    }
  }, [toasts, duration]);

  // Cleanup on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <UndoToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function UndoToastCard({
  toast,
  onDismiss,
}: {
  toast: UndoToastItem;
  onDismiss: (id: string) => void;
}): JSX.Element {
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);

  const handleUndo = async () => {
    setUndoing(true);
    try {
      const res = await apiFetch(`/api/autopilot/actions/${toast.logId}/rollback`, {
        method: 'POST',
      });
      if (res.ok) {
        setUndone(true);
        setTimeout(() => onDismiss(toast.id), 1500);
      }
    } catch {
      // silently fail — the toast will auto-dismiss
    } finally {
      setUndoing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--glass-border)] shadow-lg backdrop-blur-xl"
    >
      <CheckCircle2 className="h-4 w-4 text-apple-green shrink-0" />
      <p className="text-sm text-[var(--foreground)] flex-1 min-w-0 truncate">
        {undone ? 'Undone!' : toast.message}
      </p>
      {!undone && (
        <button
          onClick={handleUndo}
          disabled={undoing}
          className="flex items-center gap-1 text-xs font-medium text-apple-blue hover:text-apple-blue/80 press-scale transition-colors disabled:opacity-50 shrink-0"
        >
          {undoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
          Undo
        </button>
      )}
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded hover:bg-glass-hover transition-colors shrink-0"
      >
        <X className="h-3 w-3 text-[var(--foreground-secondary)]" />
      </button>
    </motion.div>
  );
}
