'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, RotateCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ExecutionStatusProps {
  diagnosisId: string;
  status: string; // 'PENDING' | 'APPROVED' | 'EXECUTED' | 'DISMISSED'
  /** Pre-loaded execution error from the diagnosis record (shown immediately). */
  initialError?: string | null;
  onExecuted?: () => void;
}

interface StatusResponse {
  status: string;
  executionResult?: Record<string, unknown>;
  error?: string;
}

const MAX_POLL_DURATION_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

export function ExecutionStatus({ diagnosisId, status, initialError, onExecuted }: ExecutionStatusProps): JSX.Element | null {
  const [phase, setPhase] = useState<'submitting' | 'processing' | 'completed' | 'failed'>(
    initialError ? 'failed' : 'submitting',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError ?? null);
  const [retrying, setRetrying] = useState(false);
  const onExecutedRef = useRef(onExecuted);
  onExecutedRef.current = onExecuted;

  // If there's an initial error, skip polling entirely
  const shouldPoll = status === 'APPROVED' && !initialError;

  useEffect(() => {
    if (!shouldPoll) return;

    let cancelled = false;
    const startTime = Date.now();

    const poll = async () => {
      try {
        const res = await apiFetch(`/api/autopilot/diagnoses/${diagnosisId}/status`);
        if (cancelled) return;

        if (!res.ok) {
          setPhase('failed');
          setErrorMessage(`API error: ${res.status}`);
          return;
        }

        const data: StatusResponse = await res.json();

        if (data.status === 'EXECUTED') {
          setPhase('completed');
          onExecutedRef.current?.();
          return;
        }

        if (data.error) {
          setPhase('failed');
          setErrorMessage(data.error);
          return;
        }

        // Still processing
        setPhase('processing');

        // Check timeout
        if (Date.now() - startTime >= MAX_POLL_DURATION_MS) {
          setPhase('failed');
          setErrorMessage('Execution timed out after 60 seconds');
          return;
        }

        // Schedule next poll
        if (!cancelled) {
          timerId = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) {
          setPhase('failed');
          setErrorMessage('Network error while checking status');
        }
      }
    };

    let timerId: number | undefined;
    // Start first poll after a short delay
    timerId = window.setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [shouldPoll, diagnosisId]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setPhase('submitting');
    setErrorMessage(null);
    try {
      const res = await apiFetch(`/api/autopilot/diagnoses/${diagnosisId}/retry`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        setPhase('failed');
        setErrorMessage(data.error ?? `Retry failed: ${res.status}`);
        return;
      }

      // Start polling for the retry execution
      setPhase('processing');
      const startTime = Date.now();
      const pollRetry = async () => {
        try {
          const statusRes = await apiFetch(`/api/autopilot/diagnoses/${diagnosisId}/status`);
          if (!statusRes.ok) {
            setPhase('failed');
            setErrorMessage(`API error: ${statusRes.status}`);
            return;
          }
          const data: StatusResponse = await statusRes.json();
          if (data.status === 'EXECUTED') {
            setPhase('completed');
            onExecutedRef.current?.();
            return;
          }
          if (data.error) {
            setPhase('failed');
            setErrorMessage(data.error);
            return;
          }
          if (Date.now() - startTime >= MAX_POLL_DURATION_MS) {
            setPhase('failed');
            setErrorMessage('Retry timed out after 60 seconds');
            return;
          }
          window.setTimeout(pollRetry, POLL_INTERVAL_MS);
        } catch {
          setPhase('failed');
          setErrorMessage('Network error while checking retry status');
        }
      };
      window.setTimeout(pollRetry, POLL_INTERVAL_MS);
    } catch {
      setPhase('failed');
      setErrorMessage('Network error — could not retry');
    } finally {
      setRetrying(false);
    }
  }, [diagnosisId]);

  if (status !== 'APPROVED') return null;

  return (
    <div className="flex items-center gap-2 mt-3">
      {phase === 'submitting' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-apple-blue" />
          <span className="text-xs text-[var(--foreground-secondary)]">
            {retrying ? 'Retrying...' : 'Submitting...'}
          </span>
        </>
      )}

      {phase === 'processing' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-apple-blue" />
          <span className="text-xs text-[var(--foreground-secondary)]">Processing...</span>
        </>
      )}

      {phase === 'completed' && (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-apple-green" />
          <span className="text-xs text-apple-green font-medium">Completed</span>
        </>
      )}

      {phase === 'failed' && (
        <>
          <XCircle className="h-3.5 w-3.5 text-apple-red" />
          <span className="text-xs text-apple-red font-medium">
            Failed{errorMessage ? ` — ${errorMessage}` : ''}
          </span>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="ml-1 flex items-center gap-1 text-xs font-medium text-apple-blue hover:text-apple-blue/80 transition-colors disabled:opacity-50"
          >
            <RotateCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </>
      )}
    </div>
  );
}
