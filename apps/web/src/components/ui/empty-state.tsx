import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card text-center py-16">
      <Icon className="h-12 w-12 text-[var(--foreground-secondary)]/30 mx-auto mb-4" />
      <p className="text-[var(--foreground-secondary)] text-lg">{title}</p>
      {description && (
        <p className="text-sm text-[var(--foreground-secondary)]/50 mt-1 max-w-md mx-auto">{description}</p>
      )}
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="inline-block mt-4 text-sm font-medium px-4 py-2 rounded-lg bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] transition-all ease-spring"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-lg bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] transition-all ease-spring"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
