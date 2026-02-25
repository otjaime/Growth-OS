'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Cable, Loader2, AlertCircle, CheckCircle2, Unplug, Upload } from 'lucide-react';
import {
  ConnectorCatalog,
  ConnectionCard,
  SetupWizard,
  CSVUpload,
} from '@/components/connections';
import type { ConnectorDef, SavedConnection } from '@/components/connections/types';
import { apiFetch } from '@/lib/api';

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [catalog, setCatalog] = useState<ConnectorDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'catalog'>('active');
  const [wizardConnector, setWizardConnector] = useState<ConnectorDef | null>(null);
  const [wizardEditMode, setWizardEditMode] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [connRes, catRes] = await Promise.all([
        apiFetch(`/api/connections`),
        apiFetch(`/api/connectors/catalog`),
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
          <Loader2 className="h-8 w-8 text-apple-blue animate-spin" />
          <p className="text-sm text-[var(--foreground-secondary)]">Loading connectors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-[var(--tint-green)] border border-apple-green/20 rounded-xl text-sm text-apple-green shadow-xl animate-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4" />
          {toastMsg}
        </div>
      )}

      {/* API Error Banner */}
      {error && (
        <div className="flex items-center gap-3 bg-[var(--tint-red)] border border-apple-red/20 rounded-xl px-5 py-4">
          <AlertCircle className="h-5 w-5 text-apple-red flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-apple-red font-medium">Connection Error</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-[var(--tint-red)] hover:bg-apple-red/30 text-apple-red rounded-lg text-xs font-medium transition-all ease-spring"
          >
            Retry
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Data Connections</h1>
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">
            Connect your data sources to unify all your analytics in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring"
          >
            <Upload className="h-4 w-4" /> Upload CSV
          </button>
          <button
            onClick={() => setActiveTab(activeTab === 'catalog' ? 'active' : 'catalog')}
            className="flex items-center gap-2 px-4 py-2.5 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring"
          >
          {activeTab === 'catalog' ? (
            <><Cable className="h-4 w-4" /> My Connections</>
          ) : (
            <><Plus className="h-4 w-4" /> Add Source</>
          )}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {connections.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--foreground-secondary)]">Connected</p>
            <p className="text-xl font-bold text-[var(--foreground)] mt-0.5">{connections.length}</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--foreground-secondary)]">Active</p>
            <p className="text-xl font-bold text-apple-green mt-0.5">
              {connections.filter((c) => c.status === 'active' || c.status === 'pending').length}
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--foreground-secondary)]">Syncing</p>
            <p className="text-xl font-bold text-apple-yellow mt-0.5">
              {connections.filter((c) => c.status === 'syncing').length}
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--foreground-secondary)]">Errors</p>
            <p className="text-xl font-bold text-apple-red mt-0.5">
              {connections.filter((c) => c.status === 'error').length}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ease-spring ${
            activeTab === 'active' ? 'bg-white/[0.06] text-[var(--foreground)]' : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4" />
            My Connections
            {connections.length > 0 && (
              <span className="bg-[var(--tint-blue)] text-apple-blue text-xs px-1.5 py-0.5 rounded-full">
                {connections.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ease-spring ${
            activeTab === 'catalog' ? 'bg-white/[0.06] text-[var(--foreground)]' : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Source
            <span className="bg-white/[0.08] text-[var(--foreground)]/80 text-xs px-1.5 py-0.5 rounded-full">
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
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
                <Unplug className="h-8 w-8 text-[var(--foreground-secondary)]/70" />
              </div>
              <h3 className="text-[var(--foreground)] font-semibold mb-2">No connections yet</h3>
              <p className="text-sm text-[var(--foreground-secondary)] max-w-md mb-6">
                Connect your e-commerce platform, ad accounts, analytics, and other tools to start syncing data into Growth OS.
              </p>
              <button
                onClick={() => setActiveTab('catalog')}
                className="flex items-center gap-2 px-5 py-2.5 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring"
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
                className="flex flex-col items-center justify-center gap-2 min-h-[180px] border-2 border-dashed border-[var(--glass-border)] hover:border-apple-blue/50 rounded-xl text-[var(--foreground-secondary)]/70 hover:text-apple-blue transition-all"
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

      {/* CSV Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUpload(false)} />
          <div className="relative w-full max-w-2xl bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--glass-border)]">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Upload CSV Data</h2>
                <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">Import offline data — orders, spend, traffic, or custom events</p>
              </div>
              <button onClick={() => setShowUpload(false)} className="p-2 hover:bg-white/[0.1] rounded-lg transition-all ease-spring">
                <Plus className="h-5 w-5 text-[var(--foreground-secondary)] rotate-45" />
              </button>
            </div>
            <div className="p-5">
              <CSVUpload onComplete={() => { setShowUpload(false); fetchData(); setToastMsg('CSV data uploaded successfully!'); setTimeout(() => setToastMsg(null), 4000); }} />
            </div>
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="flex items-start gap-3 bg-apple-blue/5 border border-apple-blue/10 rounded-xl px-5 py-4">
        <AlertCircle className="h-5 w-5 text-apple-blue flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--foreground-secondary)]">
          <p className="text-apple-blue font-medium mb-1">Credentials are encrypted at rest</p>
          <p>All API keys and tokens are encrypted with AES-256-GCM before storage. We never expose sensitive credentials in API responses or logs.</p>
        </div>
      </div>
    </div>
  );
}
