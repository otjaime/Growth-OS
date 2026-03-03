'use client';

import { motion } from 'motion/react';
import { BarChart3, Target, Clock } from 'lucide-react';
import type { AutopilotTab } from './types';

interface AutopilotTabBarProps {
  activeTab: AutopilotTab;
  onTabChange: (tab: AutopilotTab) => void;
  diagnosisCount: number;
}

const mainTabs: { key: AutopilotTab; label: string; icon: typeof Target }[] = [
  { key: 'ads', label: 'All Ads', icon: BarChart3 },
  { key: 'diagnoses', label: 'Diagnoses', icon: Target },
  { key: 'history', label: 'History', icon: Clock },
];

export function AutopilotTabBar({ activeTab, onTabChange, diagnosisCount }: AutopilotTabBarProps) {
  return (
    <div className="flex items-center" role="tablist" aria-label="Autopilot sections">
      <div className="relative flex items-center gap-0.5 bg-glass-muted rounded-xl p-1">
        {mainTabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const count = key === 'diagnoses' ? diagnosisCount : undefined;

          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(key)}
              className="relative z-10 flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg press-scale transition-colors ease-spring"
              style={{ color: isActive ? 'var(--foreground)' : 'var(--foreground-secondary)' }}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 bg-glass-active rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
                {count !== undefined && count > 0 && (
                  <span className={`text-caption px-1.5 py-0.5 rounded-full font-semibold ${
                    isActive ? 'bg-glass-active-strong text-[var(--foreground)]' : 'bg-glass-hover text-[var(--foreground-secondary)]'
                  }`}>
                    {count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
