'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
    fetch(`${API}/api/jobs${params}`)
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
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-400" />;
      case 'running': return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const cls: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      running: 'bg-blue-500/20 text-blue-400',
      pending: 'bg-slate-500/20 text-slate-400',
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
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Job Runs</h1>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {jobs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400">No job runs found.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
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
                <tr key={job.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {statusIcon(job.status)}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-white font-medium">{job.type}</td>
                  <td className="py-3 px-4 text-slate-300">
                    {new Date(job.startedAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-slate-300">{formatDuration(job.durationMs)}</td>
                  <td className="py-3 px-4 text-right text-slate-300">
                    {job.rowsLoaded !== null ? job.rowsLoaded.toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-red-400 text-xs max-w-xs truncate">
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
