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
  green: 'bg-apple-green/15 text-apple-green ring-apple-green/30',
  blue: 'bg-apple-blue/15 text-apple-blue ring-apple-blue/30',
  purple: 'bg-apple-purple/15 text-apple-purple ring-apple-purple/30',
  yellow: 'bg-apple-yellow/15 text-apple-yellow ring-apple-yellow/30',
  orange: 'bg-apple-orange/15 text-apple-orange ring-apple-orange/30',
  pink: 'bg-apple-pink/15 text-apple-pink ring-apple-pink/30',
  emerald: 'bg-apple-green/15 text-apple-green ring-apple-green/30',
  violet: 'bg-apple-purple/15 text-apple-purple ring-apple-purple/30',
  cyan: 'bg-apple-teal/15 text-apple-teal ring-apple-teal/30',
  slate: 'bg-apple-gray/15 text-apple-gray ring-apple-gray/30',
  red: 'bg-apple-red/15 text-apple-red ring-apple-red/30',
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
