'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, ClipboardCopy, Check, AlertTriangle, AlertCircle, Info, Sparkles, Loader2, Download, Send, Mail } from 'lucide-react';
import { formatCurrency, formatPercent, formatPercentChange, changeColor, formatMultiplier } from '@/lib/format';
import { apiFetch, API, getAuthToken } from '@/lib/api';
import { GlassSurface } from '@/components/ui/glass-surface';

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

interface WbrDrivers {
  volumeEffect: number;
  priceEffect: number;
  mixEffect: number;
  totalChange: number;
}

interface WbrData {
  weekLabel: string;
  narrative: string;
  summary: WbrSummary;
  drivers: WbrDrivers;
  alerts: WbrAlert[];
  actions: string[];
  nextLaunches: Array<{ name: string; channel: string | null; hypothesis: string | null; iceScore: number | null }>;
  aiEnabled: boolean;
  slackEnabled: boolean;
  generatedAt: string;
}

export default function WbrPage() {
  const [data, setData] = useState<WbrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [slackSending, setSlackSending] = useState(false);
  const [slackSent, setSlackSent] = useState(false);

  // AI streaming state
  const [aiNarrative, setAiNarrative] = useState('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const aiRef = useRef<HTMLDivElement>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch(`/api/wbr`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: WbrData | null) => {
        if (!d) { setError(true); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const handleCopy = async () => {
    const textToCopy = aiDone ? aiNarrative : data?.narrative;
    if (!textToCopy) return;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyEmail = async () => {
    if (!narrativeRef.current) return;
    const html = narrativeRef.current.innerHTML;
    const text = narrativeRef.current.innerText;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      // Fallback to plain text
      await navigator.clipboard.writeText(text);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  };

  const handleSendSlack = async () => {
    setSlackSending(true);
    try {
      const res = await apiFetch('/api/wbr/send-slack', { method: 'POST' });
      if (res.ok) {
        setSlackSent(true);
        setTimeout(() => setSlackSent(false), 3000);
      }
    } catch {
      // ignore
    }
    setSlackSending(false);
  };

  const handleGenerateAI = () => {
    setAiStreaming(true);
    setAiNarrative('');
    setAiDone(false);

    const token = getAuthToken();
    const url = `${API}/api/wbr/ai`;

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (response) => {
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.text) {
                setAiNarrative((prev) => prev + payload.text);
              }
              if (payload.done) {
                setAiDone(true);
                setAiStreaming(false);
              }
              if (payload.error) {
                setAiStreaming(false);
              }
            } catch {
              // ignore malformed JSON
            }
          }
        }
      }
      setAiStreaming(false);
      setAiDone(true);
    }).catch(() => {
      setAiStreaming(false);
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" /></div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Weekly Business Review</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load WBR data. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  const s = data.summary;

  // Decide which narrative to display
  const activeNarrative = (aiDone || aiStreaming) ? aiNarrative : data.narrative;

  /* Parse narrative into heading + body sections */
  const sections = activeNarrative.split(/^(#{1,3}\s.+)$/gm).filter(Boolean);
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
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      return (
        <div key={key} className="flex gap-3 ml-2 my-1">
          <span className="text-apple-blue font-medium min-w-[1.25rem] text-right">{numMatch[1]}.</span>
          <span>{renderInlineBold(numMatch[2])}</span>
        </div>
      );
    }
    if (line.startsWith('- ')) {
      return (
        <div key={key} className="flex gap-2 ml-2 my-1">
          <span className="text-apple-blue">•</span>
          <span>{renderInlineBold(line.slice(2))}</span>
        </div>
      );
    }
    if (!line) return <div key={key} className="h-2" />;
    return <p key={key} className="my-1">{renderInlineBold(line)}</p>;
  }

  function renderInlineBold(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-[var(--foreground)] font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-apple-red" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-apple-yellow" />;
      default: return <Info className="h-4 w-4 text-apple-blue" />;
    }
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-[var(--tint-red)] text-apple-red';
      case 'warning': return 'bg-[var(--tint-yellow)] text-apple-yellow';
      default: return 'bg-[var(--tint-blue)] text-apple-blue';
    }
  };

  return (
    <div className="space-y-6">
      {/* Print-Only Branded Header */}
      <div className="hidden print-only print:block border-b-2 border-black pb-4 mb-6">
        <h1 className="text-3xl font-bold">Growth OS — Weekly Business Review</h1>
        <p className="text-lg text-gray-600 mt-1">{data.weekLabel}</p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-apple-blue" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Weekly Business Review</h1>
            <p className="text-xs text-[var(--foreground-secondary)]/70 mt-0.5">{data.weekLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data.aiEnabled && (
            <button
              onClick={handleGenerateAI}
              disabled={aiStreaming}
              className="flex items-center gap-2 px-4 py-2 bg-apple-purple hover:bg-apple-purple disabled:opacity-50 text-[var(--foreground)] rounded-lg text-sm transition-all ease-spring"
            >
              {aiStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiStreaming ? 'Generating...' : aiDone ? 'Regenerate AI' : 'AI Analysis'}
            </button>
          )}
          {data.slackEnabled && (
            <button
              onClick={handleSendSlack}
              disabled={slackSending || slackSent}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.08] disabled:opacity-50 text-[var(--foreground)] rounded-lg text-sm transition-all ease-spring"
            >
              {slackSending ? <Loader2 className="h-4 w-4 animate-spin" /> : slackSent ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {slackSending ? 'Sending...' : slackSent ? 'Sent!' : 'Send to Slack'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.08] text-[var(--foreground)] rounded-lg text-sm transition-all ease-spring"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </button>
          <button
            onClick={handleCopyEmail}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.08] text-[var(--foreground)] rounded-lg text-sm transition-all ease-spring"
          >
            {emailCopied ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {emailCopied ? 'Copied!' : 'Copy for Email'}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] rounded-lg text-sm transition-all ease-spring"
          >
            {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy Markdown'}
          </button>
        </div>
      </div>

      {/* AI Badge */}
      {(aiStreaming || aiDone) && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--tint-purple)] border border-apple-purple/20 rounded-lg w-fit print:hidden">
          <Sparkles className="h-3.5 w-3.5 text-apple-purple" />
          <span className="text-xs text-apple-purple">
            {aiStreaming ? 'AI is analyzing your data...' : 'AI-generated analysis'}
          </span>
          {aiStreaming && <Loader2 className="h-3 w-3 text-apple-purple animate-spin" />}
        </div>
      )}

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Revenue</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatCurrency(s.revenue)}</p>
          <p className={`text-sm font-medium ${changeColor(s.revenueChange)}`}>{formatPercentChange(s.revenueChange)} WoW</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Orders</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{s.orders.toLocaleString()}</p>
          <p className={`text-sm font-medium ${changeColor(s.ordersChange)}`}>{formatPercentChange(s.ordersChange)} WoW</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Blended CAC</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatCurrency(s.cac)}</p>
          <p className={`text-sm font-medium ${changeColor(s.spendChange, true)}`}>Spend {formatPercentChange(s.spendChange)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">MER</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatMultiplier(s.mer)}</p>
          <p className="text-sm text-[var(--foreground-secondary)]/70">CM {formatPercent(s.cmPct)}</p>
        </div>
      </div>

      {/* Revenue Drivers Mini-Card */}
      {data.drivers && (
        <div className="card print:break-before">
          <h2 className="text-sm font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-3">Revenue Drivers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-[var(--foreground-secondary)]">Volume Effect</p>
              <p className={`text-lg font-bold ${data.drivers.volumeEffect >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                {data.drivers.volumeEffect >= 0 ? '+' : ''}{formatCurrency(data.drivers.volumeEffect)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--foreground-secondary)]">Price / AOV</p>
              <p className={`text-lg font-bold ${data.drivers.priceEffect >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                {data.drivers.priceEffect >= 0 ? '+' : ''}{formatCurrency(data.drivers.priceEffect)}
              </p>
            </div>
            {Math.abs(data.drivers.mixEffect) > 10 && (
              <div>
                <p className="text-xs text-[var(--foreground-secondary)]">Channel Mix</p>
                <p className={`text-lg font-bold ${data.drivers.mixEffect >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                  {data.drivers.mixEffect >= 0 ? '+' : ''}{formatCurrency(data.drivers.mixEffect)}
                </p>
              </div>
            )}
            {Math.abs(data.drivers.mixEffect) <= 10 && (
              <div>
                <p className="text-xs text-[var(--foreground-secondary)]">Total Change</p>
                <p className={`text-lg font-bold ${data.drivers.totalChange >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                  {data.drivers.totalChange >= 0 ? '+' : ''}{formatCurrency(data.drivers.totalChange)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerts Banner (if any) */}
      {data.alerts.length > 0 && (
        <div className="card border-l-4 border-l-apple-yellow space-y-3">
          <h2 className="text-sm font-semibold text-apple-yellow uppercase tracking-wide">
            {data.alerts.length} Active Alert{data.alerts.length !== 1 ? 's' : ''}
          </h2>
          {data.alerts.map((alert) => (
            <div key={alert.id} className="flex items-start gap-3">
              <div className="mt-0.5">{severityIcon(alert.severity)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--foreground)]">{alert.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-medium ${severityBadge(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{alert.description}</p>
                <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">{alert.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Narrative Sections */}
      <div ref={narrativeRef}>
        {rendered.length > 0 ? (
          <div className="space-y-4">
            {rendered.map((section, i) => {
              if (section.level === 1) return null;
              return (
                <GlassSurface key={i} className="card" intensity="subtle">
                  <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">{section.heading}</h2>
                  <div className="text-[var(--foreground)]/80 text-sm leading-relaxed">
                    {section.body.split('\n').map((line, j) => renderLine(line, j))}
                  </div>
                </GlassSurface>
              );
            })}
            {aiStreaming && (
              <div className="flex items-center gap-2 text-apple-purple text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing...</span>
              </div>
            )}
          </div>
        ) : (
          <GlassSurface className="card" intensity="subtle">
            <div className="text-[var(--foreground)]/80 whitespace-pre-wrap text-sm leading-relaxed">
              {activeNarrative}
              {aiStreaming && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />}
            </div>
          </GlassSurface>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-[var(--foreground-secondary)]/50 text-right print:hidden">
        Generated {new Date(data.generatedAt).toLocaleString()}
        {aiDone && ' | AI-enhanced'}
      </p>
    </div>
  );
}
