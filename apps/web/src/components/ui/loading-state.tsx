import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message, className }: LoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center h-64 gap-3 ${className ?? ''}`}>
      <Loader2 className="h-8 w-8 animate-spin text-apple-blue" />
      {message && (
        <p className="text-sm text-[var(--foreground-secondary)]">{message}</p>
      )}
    </div>
  );
}
