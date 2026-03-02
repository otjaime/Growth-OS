'use client';

import { Target, BarChart3, Clock, DollarSign, Activity, Settings } from 'lucide-react';
import type { AutopilotTab } from './types';

interface AutopilotTabBarProps {
  activeTab: AutopilotTab;
  onTabChange: (tab: AutopilotTab) => void;
  diagnosisCount: number;
  adsCount: number;
}

const mainTabs: { key: AutopilotTab; label: string; icon: typeof Target }[] = [
  { key: 'diagnoses', label: 'Diagnoses', icon: Target },
  { key: 'ads', label: 'All Ads', icon: BarChart3 },
  { key: 'budget', label: 'Budget', icon: DollarSign },
  { key: 'health', label: 'Health', icon: Activity },
  { key: 'history', label: 'History', icon: Clock },
];

export function AutopilotTabBar({ activeTab, onTabChange, diagnosisCount, adsCount }: AutopilotTabBarProps) {
  const isSettingsActive = activeTab === 'settings';

  return (
    <div className="flex items-center gap-2" role="tablist" aria-label="Autopilot sections">
      {/* Main tabs */}
      <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1">
        {mainTabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const count = key === 'diagnoses' ? diagnosisCount : key === 'ads' ? adsCount : undefined;

          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-all ease-spring ${
                isActive
                  ? 'bg-white/[0.08] text-[var(--foreground)]'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {count !== undefined && count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  isActive ? 'bg-white/[0.1] text-[var(--foreground)]' : 'bg-white/[0.06] text-[var(--foreground-secondary)]'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings tab — separated on the right */}
      <button
        role="tab"
        aria-selected={isSettingsActive}
        onClick={() => onTabChange('settings')}
        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-all ease-spring ${
          isSettingsActive
            ? 'bg-white/[0.08] text-[var(--foreground)]'
            : 'text-[var(--foreground-secondary)]/60 hover:text-[var(--foreground-secondary)] hover:bg-white/[0.04]'
        }`}
        title="Autopilot Settings"
      >
        <Settings className="h-3.5 w-3.5" />
        Settings
      </button>
    </div>
  );
}
