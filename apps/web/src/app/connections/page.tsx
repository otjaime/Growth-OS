'use client';

import { useState, useEffect } from 'react';
import { Plus, TestTube, Trash2, CheckCircle, XCircle, Loader2, ShoppingBag, BarChart3, Facebook } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Connection {
  id: string;
  source: string;
  label: string;
  status: 'active' | 'inactive' | 'error';
  lastSyncAt: string | null;
}

const sourceIcons: Record<string, React.ReactNode> = {
  shopify: <ShoppingBag className="h-5 w-5 text-green-400" />,
  google_ads: <BarChart3 className="h-5 w-5 text-yellow-400" />,
  ga4: <BarChart3 className="h-5 w-5 text-blue-400" />,
  meta: <Facebook className="h-5 w-5 text-blue-300" />,
};

const sourceLabels: Record<string, string> = {
  shopify: 'Shopify',
  google_ads: 'Google Ads',
  ga4: 'GA4',
  meta: 'Meta Ads',
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, boolean | null>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState('shopify');
  const [newLabel, setNewLabel] = useState('');
  const [newCreds, setNewCreds] = useState('');

  const fetchConnections = () => {
    fetch(`${API}/api/connections`)
      .then((r) => r.json())
      .then((data: { connections: Connection[] }) => {
        setConnections(data.connections);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleTest = async (connectorType: string) => {
    setTesting(connectorType);
    setTestResult((prev) => ({ ...prev, [connectorType]: null }));
    try {
      const res = await fetch(`${API}/api/connections/${connectorType}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [connectorType]: data.success ?? false }));
    } catch {
      setTestResult((prev) => ({ ...prev, [connectorType]: false }));
    }
    setTesting(null);
  };

  const handleDelete = async (connectorType: string) => {
    await fetch(`${API}/api/connections/${connectorType}`, { method: 'DELETE' });
    fetchConnections();
  };

  const handleAdd = async () => {
    let creds: Record<string, string>;
    try {
      creds = JSON.parse(newCreds);
    } catch {
      creds = { token: newCreds };
    }
    await fetch(`${API}/api/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: newSource, label: newLabel || sourceLabels[newSource], credentials: creds }),
    });
    setShowAdd(false);
    setNewLabel('');
    setNewCreds('');
    fetchConnections();
  };

  const handleOAuth = (source: string) => {
    window.location.href = `${API}/api/connections/oauth/${source}`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Connections</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Connection
        </button>
      </div>

      {/* Add Connection Form */}
      {showAdd && (
        <div className="card space-y-4">
          <h2 className="text-white font-semibold">New Connection</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Source</label>
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="shopify">Shopify</option>
                <option value="google_ads">Google Ads</option>
                <option value="ga4">GA4</option>
                <option value="meta">Meta Ads</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={sourceLabels[newSource]}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
          </div>

          {(newSource === 'google_ads' || newSource === 'ga4') ? (
            <div>
              <button
                onClick={() => handleOAuth(newSource)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
              >
                Connect with Google OAuth
              </button>
              <p className="text-xs text-slate-500 mt-1">You&apos;ll be redirected to Google to authorise access.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {newSource === 'shopify' ? 'Access Token' : 'Access Token'}
              </label>
              <input
                type="password"
                value={newCreds}
                onChange={(e) => setNewCreds(e.target.value)}
                placeholder="Paste your token here…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleAdd} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm">
              Save
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Connections List */}
      {connections.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400">No connections configured. Add one to start syncing data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => (
            <div key={conn.id} className="card flex items-start gap-4">
              <div className="mt-1">{sourceIcons[conn.source] ?? <BarChart3 className="h-5 w-5 text-slate-400" />}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold">{conn.label}</h3>
                  <span className={`w-2 h-2 rounded-full ${conn.status === 'active' ? 'bg-green-500' : conn.status === 'error' ? 'bg-red-500' : 'bg-slate-500'}`} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{sourceLabels[conn.source] ?? conn.source}</p>
                {conn.lastSyncAt && (
                  <p className="text-xs text-slate-500 mt-1">Last sync: {new Date(conn.lastSyncAt).toLocaleString()}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleTest(conn.source)}
                    disabled={testing === conn.source}
                    className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs transition-colors disabled:opacity-50"
                  >
                    {testing === conn.source ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                    Test
                  </button>
                  <button
                    onClick={() => handleDelete(conn.source)}
                    className="flex items-center gap-1 px-3 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-xs transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
                {testResult[conn.source] !== undefined && testResult[conn.source] !== null && (
                  <div className="flex items-center gap-1 mt-2 text-xs">
                    {testResult[conn.source] ? (
                      <><CheckCircle className="h-3 w-3 text-green-400" /><span className="text-green-400">Connection OK</span></>
                    ) : (
                      <><XCircle className="h-3 w-3 text-red-400" /><span className="text-red-400">Connection failed</span></>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
