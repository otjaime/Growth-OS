'use client';

import { useState, useRef, useCallback } from 'react';

interface TooltipProps {
  label: string;
  definition: string;
  children?: React.ReactNode;
}

const ACRONYMS: Record<string, string> = {
  CAC: 'Customer Acquisition Cost — total marketing spend divided by new customers acquired',
  MER: 'Marketing Efficiency Ratio — total revenue divided by total ad spend',
  AOV: 'Average Order Value — total revenue divided by number of orders',
  CM: 'Contribution Margin — revenue minus variable costs (COGS, shipping, processing)',
  'CM%': 'Contribution Margin Percentage — contribution margin as a percentage of net revenue',
  LTV: 'Lifetime Value — total revenue a customer generates over their relationship',
  ROAS: 'Return on Ad Spend — revenue generated per dollar of ad spend',
  RICE: 'Reach, Impact, Confidence, Effort — prioritization scoring framework',
  WBR: 'Weekly Business Review — structured weekly performance analysis',
  CVR: 'Conversion Rate — percentage of visitors who complete a purchase',
  CPC: 'Cost Per Click — ad spend divided by number of clicks',
  CPM: 'Cost Per Mille — ad spend per 1,000 impressions',
  CTR: 'Click-Through Rate — clicks divided by impressions',
  D7: 'Day 7 — customer retention measured 7 days after first purchase',
  D30: 'Day 30 — customer retention measured 30 days after first purchase',
  D60: 'Day 60 — customer retention measured 60 days after first purchase',
  D90: 'Day 90 — customer retention measured 90 days after first purchase',
  PDP: 'Product Detail Page — individual product page on the store',
  ATC: 'Add to Cart — action of adding a product to the shopping cart',
};

export function Tip({ label, definition, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  return (
    <span className="relative inline-flex items-center" onMouseEnter={show} onMouseLeave={hide}>
      <span className="border-b border-dotted border-slate-500 cursor-help">
        {children ?? label}
      </span>
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-3 py-2 text-xs text-slate-200 bg-slate-800 border border-slate-700 rounded-lg shadow-lg whitespace-normal max-w-xs text-center">
          <strong className="text-white">{label}</strong>
          <br />
          {definition}
        </span>
      )}
    </span>
  );
}

export function AcronymTip({ term }: { term: string }) {
  const def = ACRONYMS[term];
  if (!def) return <span>{term}</span>;
  return <Tip label={term} definition={def} />;
}
