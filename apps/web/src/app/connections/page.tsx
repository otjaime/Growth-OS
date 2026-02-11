'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Cable, Loader2, AlertCircle, CheckCircle2, Unplug } from 'lucide-react';
import {
  ConnectorCatalog,
  ConnectionCard,
  SetupWizard,
} from '@/components/connections';
import type { ConnectorDef, SavedConnection } from '@/components/connections/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [catalog, setCatalog] = useState<ConnectorDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'catalog'>('active');
  const [wizardConnector, setWizardConnector] = useState<ConnectorDef | null>(null);
  const [wizardEditMode, setWizardEditMode] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [connRes, catRes] = await Promise.all([
        fetch(`${API}/api/connections`),
        fetch(`${API}/api/connectors/catalog`),
      ]);
      if (!connRes.ok || !catRes.ok) {
        setError(`API returned ${connRes.ok ? catRes.status : connRes.status}. Check that the API is running.`);
        setLoading(false);
        return;
      }
      const connData = await connRes.json();
      const catData = await catRes.json();
      setConnections(connData.connections ?? []);
      setCatalog(catData.connectors ?? []);
    } catch (err) {
      setError('Could not connect to API. Make sure the server is running.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check URL params for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) {
      setToastMsg(`${connected} connected successfully!`);
      setActiveTab('active');
      fetchData();
      window.history.replaceState({}, '', '/connections');
      setTimeout(() => setToastMsg(null), 4000);
    }
    if (error) {
      setToastMsg(`Connection error: ${error}`);
      setTimeout(() => setToastMsg(null), 6000);
    }
  }, [fetchData]);

  const connectedIds = new Set(connections.map((c: SavedConnection) => c.connectorType));

  const handleSelectConnector = (connector: ConnectorDef) => {
    setWizardConnector(connector);
  };

  const handleWizardSaved = () => {
    fetchData();
    setActiveTab('active');
    setToastMsg(`${wizardConnector?.name} connected!`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading connectors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400 shadow-xl animate-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4" />
          {toastMsg}
        </div>
      )}

      {/* API Error Banner */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Connection Error</p>
            <p className="text-xs text-slate-400 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Connections</h1>
          <p className="text-sm text-slate-400 mt-1">
            Connect your data sources to unify all your analytics in one place.
          </p>
        </div>
        <button
          onClick={() => setActiveTab(activeTab === 'catalog' ? 'active' : 'catalog')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors self-start"
        >
          {activeTab === 'catalog' ? (
            <><Cable className="h-4 w-4" /> My Connections</>
          ) : (
            <><Plus className="h-4 w-4" /> Add Source</>
          )}
        </button>
      </div>

      {/* Stats Bar */}
      {connections.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400">Connected</p>
            <p className="text-xl font-bold text-white mt-0.5">{connections.length}</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400">Active</p>
            <p className="text-xl font-bold text-green-400 mt-0.5">
              {connections.filter((c) => c.status === 'active' || c.status === 'pending').length}
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400">Syncing</p>
            <p className="text-xl font-bold text-yellow-400 mt-0.5">
              {connections.filter((c) => c.status === 'syncing').length}
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400">Errors</p>
            <p className="text-xl font-bold text-red-400 mt-0.5">
              {connections.filter((c) => c.status === 'error').length}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'active' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4" />
            My Connections
            {connections.length > 0 && (
              <span className="bg-blue-500/20 text-blue-400 text-xs px-1.5 py-0.5 rounded-full">
                {connections.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'catalog' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Source
            <span className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0.5 rounded-full">
              {catalog.length}
            </span>
          </div>
        </button>
      </div>

      {/* Active Connections */}
      {activeTab === 'active' && (
        <>
          {connections.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
                <Unplug className="h-8 w-8 text-slate-500" />
              </div>
              <h3 className="text-white font-semibold mb-2">No connections yet</h3>
              <p className="text-sm text-slate-400 max-w-md mb-6">
                Connect your e-commerce platform, ad accounts, analytics, and other tools to start syncing data into Growth OS.
              </p>
              <button
                onClick={() => setActiveTab('catalog')}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" /> Browse Connectors
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((conn) => (
                <ConnectionCard
                  key={conn.id}
                  connection={conn}
                  onRefresh={fetchData}
                  onEdit={() => {
                    const def = catalog.find((c) => c.id === conn.connectorType);
                    if (def) {
                      setWizardEditMode(true);
                      setWizardConnector(def);
                    }
                  }}
                />
              ))}

              {/* Add more card */}
              <button
                onClick={() => setActiveTab('catalog')}
                className="flex flex-col items-center justify-center gap-2 min-h-[180px] border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-xl text-slate-500 hover:text-blue-400 transition-all"
              >
                <Plus className="h-8 w-8" />
                <span className="text-sm font-medium">Add Another Source</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Connector Catalog */}
      {activeTab === 'catalog' && (
        <ConnectorCatalog
          connectors={catalog}
          connectedIds={connectedIds}
          onSelect={handleSelectConnector}
        />
      )}

      {/* Setup Wizard Modal */}
      {wizardConnector && (
        <SetupWizard
          connector={wizardConnector}
          onClose={() => { setWizardConnector(null); setWizardEditMode(false); }}
          onSaved={handleWizardSaved}
          initialStep={wizardEditMode ? 'credentials' : undefined}
        />
      )}

      {/* Footer info */}
      <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/10 rounded-xl px-5 py-4">
        <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-slate-400">
          <p className="text-blue-300 font-medium mb-1">Credentials are encrypted at rest</p>
          <p>All API keys and tokens are encrypted with AES-256-GCM before storage. We never expose sensitive credentials in API responses or logs.</p>
        </div>
      </div>
    </div>
  );
}
