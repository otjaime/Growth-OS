'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  LayoutDashboard,
  Megaphone,
  Users,
  DollarSign,
  AlertTriangle,
  FileText,
  Cable,
  Activity,
  Filter,
} from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/', label: 'Executive Summary', icon: LayoutDashboard },
  { href: '/channels', label: 'Channel Performance', icon: Megaphone },
  { href: '/funnel', label: 'Conversion Funnel', icon: Filter },
  { href: '/cohorts', label: 'Cohorts & Retention', icon: Users },
  { href: '/unit-economics', label: 'Unit Economics', icon: DollarSign },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/wbr', label: 'Weekly Review', icon: FileText },
  { href: '/connections', label: 'Data Connections', icon: Cable },
  { href: '/jobs', label: 'Job Runs', icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#0c1524] border-r border-[var(--card-border)] flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-blue-500" />
          <div>
            <h1 className="text-lg font-bold text-white">Growth OS</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Analytics Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-slate-400">Demo Mode Active</span>
        </div>
      </div>
    </aside>
  );
}
