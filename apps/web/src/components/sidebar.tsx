'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
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
  Settings,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [apiOk, setApiOk] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((r) => r.json())
      .then((d) => {
        setDemoMode(d.demoMode ?? null);
        setApiOk(d.status === 'healthy');
      })
      .catch(() => {
        setApiOk(false);
      });
  }, []);

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

      {/* Footer — mode indicator */}
      <div className="px-6 py-4 border-t border-[var(--card-border)]">
        <Link href="/settings" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className={clsx(
            'w-2 h-2 rounded-full animate-pulse',
            !apiOk ? 'bg-red-500' : demoMode ? 'bg-purple-500' : 'bg-green-500',
          )} />
          <span className="text-xs text-slate-400">
            {!apiOk ? 'API Disconnected' : demoMode ? 'Demo Mode' : 'Live Mode'}
          </span>
        </Link>
      </div>
    </aside>
  );
}
