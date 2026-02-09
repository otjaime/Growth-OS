'use client';

import {
  ShoppingBag,
  BarChart3,
  Facebook,
  Mail,
  CreditCard,
  Users,
  Webhook,
  Upload,
  Target,
  TrendingUp,
  Music2,
} from 'lucide-react';

const colorMap: Record<string, string> = {
  green: 'bg-green-500/15 text-green-400 ring-green-500/30',
  blue: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',
  purple: 'bg-purple-500/15 text-purple-400 ring-purple-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/30',
  orange: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
  pink: 'bg-pink-500/15 text-pink-400 ring-pink-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  violet: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/30',
  slate: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
  red: 'bg-red-500/15 text-red-400 ring-red-500/30',
};

const iconMap: Record<string, React.ReactNode> = {
  shopify: <ShoppingBag className="h-5 w-5" />,
  woocommerce: <ShoppingBag className="h-5 w-5" />,
  meta: <Facebook className="h-5 w-5" />,
  google_ads: <Target className="h-5 w-5" />,
  tiktok: <Music2 className="h-5 w-5" />,
  ga4: <TrendingUp className="h-5 w-5" />,
  hubspot: <Users className="h-5 w-5" />,
  klaviyo: <Mail className="h-5 w-5" />,
  mailchimp: <Mail className="h-5 w-5" />,
  stripe: <CreditCard className="h-5 w-5" />,
  webhook: <Webhook className="h-5 w-5" />,
  upload: <Upload className="h-5 w-5" />,
};

interface ConnectorIconProps {
  icon: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ConnectorIcon({ icon, color, size = 'md' }: ConnectorIconProps) {
  const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  const iconEl = iconMap[icon] ?? <BarChart3 className="h-5 w-5" />;
  const colorClass = colorMap[color] ?? colorMap.slate;

  return (
    <div className={`${sizeClass} rounded-xl ring-1 flex items-center justify-center ${colorClass}`}>
      {iconEl}
    </div>
  );
}
