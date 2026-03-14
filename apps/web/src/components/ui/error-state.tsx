import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="card border-apple-red/30 flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="h-8 w-8 text-apple-red/60" />
      {title && (
        <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      )}
      <p className="text-sm text-apple-red">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs font-medium px-4 py-2 rounded-lg border border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06] transition-all ease-spring"
        >
          Retry
        </button>
      )}
    </div>
  );
}
