'use client';

import { useState, useRef, useCallback } from 'react';
import { ShieldAlert, Loader2, CheckCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface EmergencyStopProps {
  onStopped?: () => void;
}

interface StopResult {
  expiredCount: number;
}

export function EmergencyStop({ onStopped }: EmergencyStopProps) {
  const [holding, setHolding] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<StopResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const executeStop = useCallback(async () => {
    setHolding(false);
    setExecuting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/autopilot/emergency-stop', {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError(body.error ?? 'Emergency stop failed');
        return;
      }
      const data = await res.json();
      setResult({ expiredCount: data.expiredCount ?? 0 });
      onStopped?.();
    } catch (err) {
      setError(`Emergency stop failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecuting(false);
    }
  }, [onStopped]);

  const handlePressStart = useCallback(() => {
    if (executing || result) return;
    setHolding(true);
    setError(null);

    // Start the CSS transition by setting width to 100%
    if (progressRef.current) {
      progressRef.current.style.width = '0%';
      // Force reflow to reset the transition
      void progressRef.current.offsetWidth;
      progressRef.current.style.width = '100%';
    }

    holdTimerRef.current = setTimeout(() => {
      executeStop();
    }, 2000);
  }, [executing, result, executeStop]);

  const handlePressEnd = useCallback(() => {
    if (!holding) return;
    setHolding(false);

    // Cancel the timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    // Reset progress bar
    if (progressRef.current) {
      progressRef.current.style.transition = 'none';
      progressRef.current.style.width = '0%';
      // Force reflow then restore transition
      void progressRef.current.offsetWidth;
      progressRef.current.style.transition = '';
    }
  }, [holding]);

  if (result) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--tint-green)] border border-apple-green/30">
        <CheckCircle className="h-4 w-4 text-apple-green shrink-0" />
        <div>
          <p className="text-sm font-medium text-apple-green">Autopilot stopped</p>
          <p className="text-xs text-apple-green/80 mt-0.5">
            {result.expiredCount} diagnos{result.expiredCount === 1 ? 'is' : 'es'} expired. Mode set to Monitor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        disabled={executing}
        className="relative overflow-hidden flex items-center justify-center gap-2 w-full bg-[var(--tint-red)] hover:bg-apple-red/20 text-apple-red border border-apple-red/30 rounded-xl px-6 py-3 text-sm font-semibold transition-all ease-spring disabled:opacity-50 select-none"
      >
        {executing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Stopping...
          </>
        ) : holding ? (
          <>
            <ShieldAlert className="h-4 w-4" />
            Hold to confirm...
          </>
        ) : (
          <>
            <ShieldAlert className="h-4 w-4" />
            Emergency Stop
          </>
        )}
        <div
          ref={progressRef}
          className="absolute bottom-0 left-0 h-0.5 bg-apple-red transition-all duration-[2000ms] ease-linear"
          style={{ width: '0%' }}
        />
      </button>
      {error && (
        <p className="text-xs text-apple-red px-1">{error}</p>
      )}
    </div>
  );
}
