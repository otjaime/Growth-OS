'use client';

import { useState, useEffect } from 'react';
import { FileText, ClipboardCopy, Check, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { formatCurrency, formatPercent, formatPercentChange, changeColor, formatDays, formatMultiplier } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface WbrSummary {
  revenue: number;
  revenueChange: number;
  orders: number;
  ordersChange: number;
  spend: number;
  spendChange: number;
  cac: number;
  mer: number;
  cmPct: number;
  newCustomers: number;
  ltvCacRatio: number;
  paybackDays: number | null;
}

interface WbrAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  impactedSegment: string;
  recommendation: string;
}

interface WbrData {
  weekLabel: string;
  narrative: string;
  summary: WbrSummary;
  alerts: WbrAlert[];
  generatedAt: string;
}

export default function WbrPage() {
  const [data, setData] = useState<WbrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/wbr`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: WbrData | null) => {
        if (!d) { setError(true); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const handleCopy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.narrative);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Weekly Business Review</h1>
        <div className="card border-red-500/50 flex items-center justify-center h-64">
          <p className="text-red-400">Failed to load WBR data. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  const s = data.summary;

  /* Parse narrative into heading + body sections */
  const sections = data.narrative.split(/^(#{1,3}\s.+)$/gm).filter(Boolean);
  const rendered: { heading: string; level: number; body: string }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const raw = sections[i].trim();
    if (raw.startsWith('#')) {
      const level = raw.match(/^(#+)/)?.[1].length ?? 2;
      rendered.push({
        heading: raw.replace(/^#+\s*/, ''),
        level,
        body: sections[i + 1]?.trim() ?? '',
      });
      i++;
    }
  }

  /* Render a single markdown line with inline bold support */
  function renderLine(line: string, key: number) {
    // Numbered list: "1. Item text"
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      return (
        <div key={key} className="flex gap-3 ml-2 my-1">
          <span className="text-indigo-400 font-medium min-w-[1.25rem] text-right">{numMatch[1]}.</span>
          <span>{renderInlineBold(numMatch[2])}</span>
        </div>
      );
    }
    // Bullet list
    if (line.startsWith('- ')) {
      return (
        <div key={key} className="flex gap-2 ml-2 my-1">
          <span className="text-indigo-400">•</span>
          <span>{renderInlineBold(line.slice(2))}</span>
        </div>
      );
    }
    // Empty line
    if (!line) return <div key={key} className="h-2" />;
    // Regular paragraph
    return <p key={key} className="my-1">{renderInlineBold(line)}</p>;
  }

  /* Render inline **bold** fragments within a line */
  function renderInlineBold(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400';
      case 'warning': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-blue-500/20 text-blue-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Weekly Business Review</h1>
            <p className="text-xs text-slate-500 mt-0.5">{data.weekLabel}</p>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy Markdown'}
        </button>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">Revenue</p>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(s.revenue)}</p>
          <p className={`text-sm font-medium ${changeColor(s.revenueChange)}`}>{formatPercentChange(s.revenueChange)} WoW</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">Orders</p>
          <p className="text-2xl font-bold text-white mt-1">{s.orders.toLocaleString()}</p>
          <p className={`text-sm font-medium ${changeColor(s.ordersChange)}`}>{formatPercentChange(s.ordersChange)} WoW</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">Blended CAC</p>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(s.cac)}</p>
          <p className={`text-sm font-medium ${changeColor(s.spendChange, true)}`}>Spend {formatPercentChange(s.spendChange)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">MER</p>
          <p className="text-2xl font-bold text-white mt-1">{formatMultiplier(s.mer)}</p>
          <p className="text-sm text-slate-500">CM {formatPercent(s.cmPct)}</p>
        </div>
      </div>

      {/* Alerts Banner (if any) */}
      {data.alerts.length > 0 && (
        <div className="card border-l-4 border-l-yellow-500 space-y-3">
          <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide">
            {data.alerts.length} Active Alert{data.alerts.length !== 1 ? 's' : ''}
          </h2>
          {data.alerts.map((alert) => (
            <div key={alert.id} className="flex items-start gap-3">
              <div className="mt-0.5">{severityIcon(alert.severity)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{alert.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-medium ${severityBadge(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{alert.description}</p>
                <p className="text-xs text-slate-500 mt-1">{alert.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Narrative Sections */}
      {rendered.length > 0 ? (
        <div className="space-y-4">
          {rendered.map((section, i) => {
            // Skip the top-level title (already shown in header)
            if (section.level === 1) return null;
            return (
              <div key={i} className="card">
                <h2 className="text-lg font-semibold text-white mb-3">{section.heading}</h2>
                <div className="text-slate-300 text-sm leading-relaxed">
                  {section.body.split('\n').map((line, j) => renderLine(line, j))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">{data.narrative}</div>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-slate-600 text-right">
        Generated {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
