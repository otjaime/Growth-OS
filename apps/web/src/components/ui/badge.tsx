import type { ReactNode } from 'react';
import clsx from 'clsx';

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'slate' | 'purple' | 'pink' | 'cyan' | 'teal' | 'orange' | 'lime';

interface BadgeProps {
  children: ReactNode;
  variant: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  green: 'bg-green-500/20 text-green-400',
  red: 'bg-red-500/20 text-red-400',
  amber: 'bg-amber-500/20 text-amber-400',
  blue: 'bg-blue-500/20 text-blue-400',
  gray: 'bg-gray-500/20 text-gray-400',
  slate: 'bg-slate-500/20 text-slate-300',
  purple: 'bg-purple-500/20 text-purple-400',
  pink: 'bg-pink-500/20 text-pink-400',
  cyan: 'bg-cyan-500/20 text-cyan-400',
  teal: 'bg-teal-500/20 text-teal-400',
  orange: 'bg-orange-500/20 text-orange-400',
  lime: 'bg-lime-500/20 text-lime-400',
};

const SIZE_CLASSES = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-0.5',
};

export function Badge({ children, variant, size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps common status/verdict strings to badge variants */
export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  WINNER: 'green',
  WIN: 'green',
  LOSER: 'red',
  LOSS: 'red',
  INCONCLUSIVE: 'gray',
  INCONCLUSIVE_VERDICT: 'gray',
  DRAFT: 'gray',
  APPROVED: 'blue',
  LIVE: 'amber',
  RUNNING: 'amber',
  PAUSED_BY_USER: 'gray',
  PAUSED_BY_SYSTEM: 'red',
  HIGH: 'green',
  MEDIUM: 'amber',
  LOW: 'gray',
  IDEA: 'gray',
  BACKLOG: 'blue',
  COMPLETED: 'green',
  ARCHIVED: 'slate',
};

/** Get the variant for a status/verdict string, with fallback */
export function getStatusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status] ?? 'gray';
}
