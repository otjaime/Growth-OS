import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  icon?: LucideIcon;
  breadcrumb?: { label: string; href: string };
  actions?: ReactNode;
}

export function PageHeader({ title, icon: Icon, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        {breadcrumb && (
          <Link
            href={breadcrumb.href}
            className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors mb-1 block"
          >
            &larr; {breadcrumb.label}
          </Link>
        )}
        <div className="flex items-center gap-3">
          {Icon && <Icon className="h-6 w-6 text-apple-blue" />}
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
