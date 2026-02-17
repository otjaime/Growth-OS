'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Job {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  rowsLoaded: number | null;
  error: string | null;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchJobs = () => {
    const params = filter !== 'all' ? `?status=${filter}` : '';
    apiFetch(`/api/jobs${params}`)
      .then((r) => r.json())
      .then((data: { jobs: Job[] }) => {
        setJobs(data.jobs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-apple-green" />;
      case 'failed': return <XCircle className="h-4 w-4 text-apple-red" />;
      case 'running': return <Loader2 className="h-4 w-4 text-apple-blue animate-spin" />;
      default: return <Clock className="h-4 w-4 text-[var(--foreground-secondary)]" />;
    }
  };

  const statusBadge = (status: string) => {
    const cls: Record<string, string> = {
      completed: 'bg-[var(--tint-green)] text-apple-green',
      failed: 'bg-[var(--tint-red)] text-apple-red',
      running: 'bg-[var(--tint-blue)] text-apple-blue',
      pending: 'bg-white/[0.04] text-[var(--foreground-secondary)]',
    };
    return cls[status] ?? cls.pending;
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '—';
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Job Runs</h1>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.08] text-[var(--foreground)] rounded-lg text-sm transition-all ease-spring"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'running', 'completed', 'failed', 'pending'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ease-spring ${
              filter === f ? 'bg-apple-blue text-[var(--foreground)]' : 'bg-white/[0.06] text-[var(--foreground-secondary)] hover:bg-white/[0.1]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {jobs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-secondary)]">No job runs found.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--foreground-secondary)] border-b border-[var(--glass-border)]">
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Started</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4 text-right">Rows Loaded</th>
                <th className="py-3 px-4">Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {statusIcon(job.status)}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[var(--foreground)] font-medium">{job.type}</td>
                  <td className="py-3 px-4 text-[var(--foreground)]/80">
                    {new Date(job.startedAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-[var(--foreground)]/80">{formatDuration(job.durationMs)}</td>
                  <td className="py-3 px-4 text-right text-[var(--foreground)]/80">
                    {job.rowsLoaded !== null ? job.rowsLoaded.toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-apple-red text-xs max-w-xs truncate">
                    {job.error ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
