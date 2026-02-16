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
  Sparkles,
  Gauge,
  FlaskConical,
  Lightbulb,
  TrendingUp,
  Menu,
  X,
  Mail,
} from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import { LogoutButton } from '@/components/auth-gate';
import { useFilters } from '@/contexts/filters';

const CHANNELS = [
  { slug: 'meta', label: 'Meta Ads' },
  { slug: 'google', label: 'Google Ads' },
  { slug: 'tiktok', label: 'TikTok Ads' },
  { slug: 'email', label: 'Email' },
  { slug: 'organic', label: 'Organic' },
  { slug: 'affiliate', label: 'Affiliate' },
  { slug: 'direct', label: 'Direct' },
];

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const NAV_ITEMS = [
  { href: '/', label: 'Executive Summary', icon: LayoutDashboard },
  { href: '/channels', label: 'Channel Performance', icon: Megaphone },
  { href: '/funnel', label: 'Conversion Funnel', icon: Filter },
  { href: '/cohorts', label: 'Cohorts & Retention', icon: Users },
  { href: '/email', label: 'Email Performance', icon: Mail },
  { href: '/unit-economics', label: 'Unit Economics', icon: DollarSign },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/wbr', label: 'Weekly Review', icon: FileText },
  { href: '/ask', label: 'Ask Your Data', icon: Sparkles },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical },
  { href: '/suggestions', label: 'AI Suggestions', icon: Lightbulb },
  { href: '/growth-model', label: 'Growth Model', icon: TrendingUp },
  { href: '/connections', label: 'Data Connections', icon: Cable },
  { href: '/pipeline', label: 'Pipeline Health', icon: Gauge },
  { href: '/jobs', label: 'Job Runs', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { channelFilter, setChannelFilter } = useFilters();
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [apiOk, setApiOk] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fetchHealth = () => {
      apiFetch(`/api/health`)
        .then((r) => r.json())
        .then((d) => {
          setDemoMode(d.demoMode ?? null);
          setApiOk(d.status === 'healthy');
          setLastSyncAt(d.lastSyncAt ?? null);
        })
        .catch(() => {
          setApiOk(false);
        });
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 60_000);
    return () => clearInterval(id);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const syncLabel = lastSyncAt
    ? `Synced ${formatRelativeTime(lastSyncAt)}`
    : 'Not synced yet';

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[var(--card-border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-blue-500" />
            <div>
              <h1 className="text-lg font-bold text-white">Growth OS</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Analytics Platform</p>
            </div>
          </div>
          {/* Close button on mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
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

      {/* Channel Filter */}
      <div className="px-4 py-3 border-t border-[var(--card-border)]">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Channel Filter</label>
        <select
          value={channelFilter ?? ''}
          onChange={(e) => setChannelFilter(e.target.value || null)}
          className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Channels</option>
          {CHANNELS.map((ch) => (
            <option key={ch.slug} value={ch.slug}>{ch.label}</option>
          ))}
        </select>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[var(--card-border)] space-y-2">
        <Link href="/settings" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className={clsx(
            'w-2 h-2 rounded-full animate-pulse',
            !apiOk ? 'bg-red-500' : demoMode ? 'bg-purple-500' : 'bg-green-500',
          )} />
          <span className="text-xs text-slate-400">
            {!apiOk ? 'API Disconnected' : demoMode ? 'Demo Mode' : 'Live Mode'}
          </span>
        </Link>
        {apiOk && (
          <p className="text-[10px] text-slate-500 pl-4">{syncLabel}</p>
        )}
        <LogoutButton />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: fixed, mobile: slide-out */}
      <aside
        className={clsx(
          'fixed left-0 top-0 h-screen w-64 bg-[#0c1524] border-r border-[var(--card-border)] flex flex-col z-50 transition-transform duration-200',
          // Desktop: always visible
          'lg:translate-x-0',
          // Mobile: slide in/out
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
