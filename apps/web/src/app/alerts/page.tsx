'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/alerts`)
      .then((r) => r.json())
      .then((data: { alerts: Alert[] }) => {
        setAlerts(data.alerts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'warning': return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const severityBorder = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-l-red-500';
      case 'warning': return 'border-l-yellow-500';
      default: return 'border-l-blue-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Alerts & Recommendations</h1>
        <span className="text-sm text-slate-400">
          {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-lg">🎉 No alerts — all metrics within thresholds</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`card border-l-4 ${severityBorder(alert.severity)}`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5">{severityIcon(alert.severity)}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-semibold">{alert.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full uppercase font-medium ${
                      alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      alert.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-slate-300 mt-1">{alert.description}</p>
                  <div className="mt-3 flex gap-6 text-xs text-slate-400">
                    <span>Segment: <strong className="text-slate-300">{alert.impactedSegment}</strong></span>
                  </div>
                  <div className="mt-3 p-3 bg-slate-800/50 rounded-lg">
                    <p className="text-xs text-slate-400 uppercase font-medium mb-1">Recommended Action</p>
                    <p className="text-sm text-slate-200">{alert.recommendation}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
