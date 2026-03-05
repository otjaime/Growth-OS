'use client';

import { motion } from 'motion/react';
import { LayoutDashboard, Target, CreditCard, Package } from 'lucide-react';
import type { AutopilotTab } from './types';

interface AutopilotTabBarProps {
  activeTab: AutopilotTab;
  onTabChange: (tab: AutopilotTab) => void;
  actionCount: number;
}

const tabs: { key: AutopilotTab; label: string; icon: typeof Target }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'actions', label: 'Actions', icon: Target },
  { key: 'ads', label: 'Your Ads', icon: CreditCard },
  { key: 'products', label: 'Products', icon: Package },
];

export function AutopilotTabBar({ activeTab, onTabChange, actionCount }: AutopilotTabBarProps): JSX.Element {
  return (
    <div className="flex items-center" role="tablist" aria-label="Copilot sections">
      <div className="relative flex items-center gap-0.5 bg-glass-muted rounded-xl p-1">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const count = key === 'actions' ? actionCount : undefined;

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
