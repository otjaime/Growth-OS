// Shared types for the connections system
export interface ConnectorFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select' | 'number';
  placeholder?: string;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  sensitive?: boolean;
}

export interface ConnectorDef {
  id: string;
  name: string;
  slug: string;
  category: 'ecommerce' | 'advertising' | 'analytics' | 'crm' | 'email' | 'payments' | 'custom';
  description: string;
  icon: string;
  color: string;
  authType: 'api_key' | 'oauth2' | 'credentials' | 'webhook';
  fields: ConnectorFieldDef[];
  docsUrl?: string;
  setupGuide: string[];
}

export interface SavedConnection {
  id: string;
  connectorType: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  label: string;
  status: 'active' | 'error' | 'syncing' | 'pending';
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  ecommerce: 'E-commerce',
  advertising: 'Advertising',
  analytics: 'Analytics',
  crm: 'CRM',
  email: 'Email Marketing',
  payments: 'Payments',
  custom: 'Custom',
};

export const CATEGORY_ORDER = ['ecommerce', 'advertising', 'analytics', 'crm', 'email', 'payments', 'custom'];
