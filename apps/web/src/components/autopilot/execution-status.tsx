'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ExecutionStatusProps {
  diagnosisId: string;
  status: string; // 'PENDING' | 'APPROVED' | 'EXECUTED' | 'DISMISSED'
  onExecuted?: () => void;
}

interface StatusResponse {
  status: string;
  executionResult?: Record<string, unknown>;
  error?: string;
}

const MAX_POLL_DURATION_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

export function ExecutionStatus({ diagnosisId, status, onExecuted }: ExecutionStatusProps): JSX.Element | null {
  const [phase, setPhase] = useState<'submitting' | 'processing' | 'completed' | 'failed'>('submitting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const onExecutedRef = useRef(onExecuted);
  onExecutedRef.current = onExecuted;

  useEffect(() => {
    if (status !== 'APPROVED') return;

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
  }, [status, diagnosisId]);

  if (status !== 'APPROVED') return null;

  return (
    <div className="flex items-center gap-2 mt-3">
      {phase === 'submitting' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-apple-blue" />
          <span className="text-xs text-[var(--foreground-secondary)]">Submitting...</span>
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
        </>
      )}
    </div>
  );
}
