'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  impactedSegment: string;
  recommendation: string;
  metricValue: number;
  threshold: number;
}

function AlertCard({ alert }: { alert: Alert }) {
  const [expanded, setExpanded] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fetchExplanation = () => {
    if (aiExplanation) {
      setExpanded(!expanded);
      return;
    }

    setExpanded(true);
    setAiLoading(true);
    setAiError(null);

    apiFetch('/api/alerts/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert }),
    })
      .then((r) => r.json())
      .then((data: { enabled: boolean; explanation: string | null; message?: string }) => {
        if (!data.enabled) {
          setAiError('AI not configured. Set OPENAI_API_KEY.');
        } else if (data.explanation) {
          setAiExplanation(data.explanation);
        } else {
          setAiError(data.message ?? 'Failed to generate analysis.');
        }
        setAiLoading(false);
      })
      .catch(() => {
        setAiError('Network error.');
        setAiLoading(false);
      });
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-apple-red" />;
      case 'warning': return <AlertCircle className="h-5 w-5 text-apple-yellow" />;
      default: return <Info className="h-5 w-5 text-apple-blue" />;
    }
  };

  const severityBorder = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-l-apple-red';
      case 'warning': return 'border-l-apple-yellow';
      default: return 'border-l-apple-blue';
    }
  };

  return (
    <div className={`card border-l-4 ${severityBorder(alert.severity)}`}>
      <div className="flex items-start gap-4">
        <div className="mt-0.5">{severityIcon(alert.severity)}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-[var(--foreground)] font-semibold">{alert.title}</h3>
            <span className={`text-xs px-2 py-1 rounded-full uppercase font-medium ${
              alert.severity === 'critical' ? 'bg-[var(--tint-red)] text-apple-red' :
              alert.severity === 'warning' ? 'bg-[var(--tint-yellow)] text-apple-yellow' :
              'bg-[var(--tint-blue)] text-apple-blue'
            }`}>
              {alert.severity}
            </span>
          </div>
          <p className="text-[var(--foreground)]/80 mt-1">{alert.description}</p>
          <div className="mt-3 flex gap-6 text-xs text-[var(--foreground-secondary)]">
            <span>Segment: <strong className="text-[var(--foreground)]/80">{alert.impactedSegment}</strong></span>
          </div>
          <div className="mt-3 p-3 bg-white/[0.04] rounded-lg">
            <p className="text-xs text-[var(--foreground-secondary)] uppercase font-medium mb-1">Recommended Action</p>
            <p className="text-sm text-[var(--foreground)]">{alert.recommendation}</p>
          </div>

          {/* AI Analysis toggle */}
          <button
            onClick={fetchExplanation}
            className="mt-3 flex items-center gap-2 text-xs text-apple-purple hover:text-apple-purple transition-all ease-spring"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Analysis
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {expanded && (
            <div className="mt-2 p-3 bg-[var(--tint-purple)] border border-apple-purple/20 rounded-lg">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-apple-purple">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing alert...
                </div>
              ) : aiError ? (
                <p className="text-sm text-apple-yellow">{aiError}</p>
              ) : aiExplanation ? (
                <div className="text-sm text-purple-200 whitespace-pre-wrap">{aiExplanation}</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/api/alerts`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { alerts: Alert[] } | null) => {
        if (!data) { setError(true); setLoading(false); return; }
        setAlerts(data.alerts);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" /></div>;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Alerts & Recommendations</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load alerts. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Alerts & Recommendations</h1>
        <span className="text-sm text-[var(--foreground-secondary)]">
          {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-secondary)] text-lg">No alerts — all metrics within thresholds</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
