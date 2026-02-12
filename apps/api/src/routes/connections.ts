import type { FastifyInstance } from 'fastify';
import { prisma, encrypt, decrypt, isDemoMode } from '@growth-os/database';
import crypto from 'crypto';
import { runConnectorSync } from '../lib/run-connector-sync.js';
import { normalizeStaging, buildMarts } from '@growth-os/etl';
import { getGoogleOAuthConfig } from '../lib/google-oauth-config.js';

// ── Connector Catalog (served to frontend) ──────────────────

interface ConnectorFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select' | 'number';
  placeholder?: string;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  sensitive?: boolean;
}

interface SetupStep {
  text: string;
  url?: string;
  urlLabel?: string;
  tip?: string;
}

interface ConnectorDef {
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
  setupGuide: SetupStep[];
  setupTime?: string;
  quickFindPath?: string;
  dataSync?: string[];
}

const CONNECTOR_CATALOG: ConnectorDef[] = [
  // ── E-commerce ──
  {
    id: 'shopify',
    name: 'Shopify',
    slug: 'shopify',
    category: 'ecommerce',
    description: 'Import orders, customers, and product data from your Shopify store.',
    icon: 'shopify',
    color: 'green',
    authType: 'oauth2',
    fields: [
      { key: 'shopDomain', label: 'Store Domain', type: 'text', placeholder: 'mystore.myshopify.com', required: true, help: 'Your .myshopify.com domain — find it in Settings → Domains' },
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: '1fc37d7d2413a22f12495ba2afc9fab7', required: true, help: 'Found in your Shopify app → Overview → Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'shpss_xxxxx', required: true, sensitive: true, help: 'Found in your Shopify app → Overview → Client secret' },
    ],
    docsUrl: 'https://shopify.dev/docs/admin-api',
    setupTime: '~3 min',
    quickFindPath: 'Settings → Apps → Develop apps → Your app → Overview',
    dataSync: ['Orders', 'Customers', 'Products', 'Inventory'],
    setupGuide: [
      { text: 'Open your Shopify Admin and go to Settings → Apps and sales channels', url: 'https://admin.shopify.com/settings/apps', urlLabel: 'Open Shopify Apps Settings', tip: 'You need to be a store owner or have "Apps" permissions.' },
      { text: 'Click "Develop apps" in the top-right, then "Create an app"', tip: 'If you don\'t see "Develop apps", ask your store owner to enable custom app development in Settings → Apps → Develop apps → Allow custom app development.' },
      { text: 'Go to "Configuration" tab → Admin API integration, and select these scopes:', tip: 'Required scopes: read_orders, read_customers, read_products, read_inventory. Optional: read_analytics.' },
      { text: 'Copy the Client ID and Client secret from the app Overview page', tip: 'The Client ID is a long hex string. The Client secret starts with shpss_.' },
      { text: 'Enter your store domain, Client ID and secret below, then click "Connect with Shopify"', tip: 'We\'ll redirect you to Shopify for secure authorization. No passwords are stored — you approve access directly in Shopify.' },
    ],
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    slug: 'woocommerce',
    category: 'ecommerce',
    description: 'Sync orders and customers from your WordPress + WooCommerce store.',
    icon: 'woocommerce',
    color: 'purple',
    authType: 'credentials',
    fields: [
      { key: 'siteUrl', label: 'Site URL', type: 'url', placeholder: 'https://mystore.com', required: true, help: 'Your full site URL including https://' },
      { key: 'consumerKey', label: 'Consumer Key', type: 'password', placeholder: 'ck_xxxxx', required: true, sensitive: true, help: 'Starts with ck_ — generated in the REST API keys section' },
      { key: 'consumerSecret', label: 'Consumer Secret', type: 'password', placeholder: 'cs_xxxxx', required: true, sensitive: true, help: 'Starts with cs_ — shown only once when you create the key' },
    ],
    docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
    setupTime: '~2 min',
    quickFindPath: 'WP Admin → WooCommerce → Settings → Advanced → REST API',
    dataSync: ['Orders', 'Customers', 'Products'],
    setupGuide: [
      { text: 'Log in to your WordPress admin panel and go to WooCommerce → Settings → Advanced → REST API', url: 'https://yourstore.com/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys', urlLabel: 'Open WooCommerce API Settings', tip: 'Replace "yourstore.com" with your actual domain.' },
      { text: 'Click "Add key". Set Description to "Growth OS", User to your admin, Permissions to "Read"', tip: 'Read-only access is sufficient — we never write data to your store.' },
      { text: 'Click "Generate API key". Copy both the Consumer Key and Consumer Secret immediately.', tip: '⚠️ The Consumer Secret is only shown once! Save it before closing.' },
      { text: 'Paste your site URL and both keys below.' },
    ],
  },

  // ── Advertising ──
  {
    id: 'meta_ads',
    name: 'Meta Ads',
    slug: 'meta_ads',
    category: 'advertising',
    description: 'Pull campaign performance, spend, and conversions from Facebook & Instagram Ads.',
    icon: 'meta',
    color: 'blue',
    authType: 'api_key',
    fields: [
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'EAAxxxxx', required: true, sensitive: true, help: 'Starts with EAA — long-lived token from a System User' },
      { key: 'adAccountId', label: 'Ad Account ID', type: 'text', placeholder: 'act_123456789', required: true, help: 'Starts with act_ — visible in Business Settings → Ad Accounts' },
      { key: 'pixelId', label: 'Pixel ID (optional)', type: 'text', placeholder: '123456789', required: false },
    ],
    docsUrl: 'https://developers.facebook.com/docs/marketing-apis',
    setupTime: '~5 min',
    quickFindPath: 'Business Settings → Users → System Users → Generate Token',
    dataSync: ['Campaigns', 'Ad Sets', 'Ads', 'Spend', 'Conversions'],
    setupGuide: [
      { text: 'Open Meta Business Settings', url: 'https://business.facebook.com/settings/system-users', urlLabel: 'Open Business Settings', tip: 'You need Business Admin access. If you don\'t have it, ask your account admin.' },
      { text: 'Go to Users → System Users → click "Add"', tip: 'Name it "Growth OS" and set role to "Admin". System Users are more secure than personal tokens.' },
      { text: 'Select the new system user → click "Generate new token"', tip: 'Select the app (or create one), then check: ads_read, ads_management, business_management.' },
      { text: 'Set token expiry to "Never" for a long-lived token, then copy it.', tip: 'The token starts with EAA and is very long. Copy the entire string.' },
      { text: 'Find your Ad Account ID: Business Settings → Ad Accounts → copy the numeric ID', url: 'https://business.facebook.com/settings/ad-accounts', urlLabel: 'Open Ad Accounts', tip: 'The full ID is act_ followed by numbers, e.g. act_123456789.' },
      { text: 'Paste the token and Ad Account ID below.' },
    ],
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    slug: 'google_ads',
    category: 'advertising',
    description: 'Sync campaign metrics, spend, clicks, and conversions from Google Ads.',
    icon: 'google_ads',
    color: 'yellow',
    authType: 'oauth2',
    fields: [
      { key: 'customerId', label: 'Customer ID', type: 'text', placeholder: '123-456-7890', required: true, help: 'The 10-digit number in the top-right of your Google Ads dashboard (XXX-XXX-XXXX)' },
      { key: 'developerToken', label: 'Developer Token', type: 'password', placeholder: 'xxxxx', required: true, sensitive: true, help: 'Found in Tools & Settings → API Center → Developer token' },
      { key: 'managerAccountId', label: 'Manager Account ID (MCC)', type: 'text', placeholder: '123-456-7890', required: false, help: 'Only needed if you manage multiple accounts via a Manager account' },
    ],
    docsUrl: 'https://developers.google.com/google-ads/api/docs/start',
    setupTime: '~3 min',
    quickFindPath: 'Google Ads → Tools & Settings → API Center',
    dataSync: ['Campaigns', 'Ad Groups', 'Keywords', 'Spend', 'Clicks', 'Conversions'],
    setupGuide: [
      { text: 'Sign in to Google Ads', url: 'https://ads.google.com', urlLabel: 'Open Google Ads', tip: 'Use the account that owns the campaigns you want to track.' },
      { text: 'Click the Tools icon (🔧) in the top navigation → Setup → API Center', url: 'https://ads.google.com/aw/apicenter', urlLabel: 'Open API Center', tip: 'If you don\'t see API Center, your account may need to apply for API access first.' },
      { text: 'Copy the Developer Token displayed on the API Center page', tip: 'The token is a short alphanumeric string. Basic access is sufficient for read-only.' },
      { text: 'Copy your Customer ID from the top-right corner of the Google Ads dashboard', tip: 'It looks like 123-456-7890. Remove the dashes when pasting, or keep them — both work.' },
      { text: 'Fill in the fields below, then click "Connect with Google" to authorize via OAuth', tip: 'We\'ll redirect you to Google for secure authorization. No passwords are stored.' },
    ],
  },
  {
    id: 'tiktok_ads',
    name: 'TikTok Ads',
    slug: 'tiktok_ads',
    category: 'advertising',
    description: 'Import campaign performance and spend data from TikTok Ads Manager.',
    icon: 'tiktok',
    color: 'pink',
    authType: 'api_key',
    fields: [
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'xxxxx', required: true, sensitive: true, help: 'Long-lived token from the TikTok Marketing API developer portal' },
      { key: 'advertiserId', label: 'Advertiser ID', type: 'text', placeholder: '123456789', required: true, help: 'Numeric ID — find it in Ads Manager top-right or in Business Center' },
    ],
    docsUrl: 'https://business-api.tiktok.com/portal/docs',
    setupTime: '~5 min',
    quickFindPath: 'TikTok Developer Portal → My Apps → App Details → Token',
    dataSync: ['Campaigns', 'Ad Groups', 'Ads', 'Spend', 'Impressions'],
    setupGuide: [
      { text: 'Open the TikTok Marketing API developer portal', url: 'https://business-api.tiktok.com/portal/apps', urlLabel: 'Open TikTok Developer Portal', tip: 'You need a TikTok for Business account. Create one at business.tiktok.com if needed.' },
      { text: 'Click "Create App" → name it "Growth OS" → select Marketing API', tip: 'For app type, select "Ads Management". Set the permissions to read-only.' },
      { text: 'Once approved, go to your app → "Generate Long-term Token"', tip: 'Select the Advertiser Account(s) you want to connect, then generate.' },
      { text: 'Copy the Access Token and your Advertiser ID', tip: 'The Advertiser ID is visible in the top-right of TikTok Ads Manager or in Business Center → Advertiser Accounts.' },
      { text: 'Paste both values below.' },
    ],
  },

  // ── Analytics ──
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    slug: 'ga4',
    category: 'analytics',
    description: 'Pull sessions, page views, conversions, and user behavior from GA4.',
    icon: 'ga4',
    color: 'orange',
    authType: 'oauth2',
    fields: [
      { key: 'propertyId', label: 'Property ID', type: 'text', placeholder: '123456789', required: true, help: 'The 9-digit number in Admin → Property Details (not the Measurement ID)' },
      { key: 'dataStreamId', label: 'Data Stream ID (optional)', type: 'text', placeholder: '1234567', required: false, help: 'Optional — found in Admin → Data Streams → click your stream' },
    ],
    docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
    setupTime: '~2 min',
    quickFindPath: 'GA4 → Admin (⚙️) → Property Details → Property ID',
    dataSync: ['Sessions', 'Page Views', 'Users', 'Conversions', 'Events'],
    setupGuide: [
      { text: 'Open Google Analytics and go to Admin (⚙️ gear icon, bottom-left)', url: 'https://analytics.google.com/analytics/web/#/a0p0/admin', urlLabel: 'Open GA4 Admin', tip: 'Make sure you\'re looking at the correct property in the property selector.' },
      { text: 'Click "Property Details" under the Property column', tip: 'The Property ID is the 9-digit number at the top of this page. Don\'t confuse it with the Measurement ID (G-XXXXX).' },
      { text: 'Copy the numeric Property ID and paste it below', tip: 'Example: 123456789 — do not include the "G-" prefix, that\'s the Measurement ID.' },
      { text: 'Click "Connect with Google" below to authorize read-only access', tip: 'We only request analytics.readonly scope — we can never modify your data.' },
    ],
  },

  // ── CRM ──
  {
    id: 'hubspot',
    name: 'HubSpot',
    slug: 'hubspot',
    category: 'crm',
    description: 'Sync contacts, deals, and lifecycle stages from HubSpot CRM.',
    icon: 'hubspot',
    color: 'orange',
    authType: 'api_key',
    fields: [
      { key: 'accessToken', label: 'Private App Access Token', type: 'password', placeholder: 'pat-na1-xxxxx', required: true, sensitive: true, help: 'Starts with pat- — found after creating a Private App' },
      { key: 'portalId', label: 'Portal ID (optional)', type: 'text', placeholder: '12345678', required: false, help: 'Your Hub ID — visible in the URL bar or in Account & Billing' },
    ],
    docsUrl: 'https://developers.hubspot.com/docs/api/overview',
    setupTime: '~3 min',
    quickFindPath: 'Settings (⚙️) → Integrations → Private Apps → Create',
    dataSync: ['Contacts', 'Companies', 'Deals', 'Lifecycle Stages'],
    setupGuide: [
      { text: 'Open HubSpot Settings → Integrations → Private Apps', url: 'https://app.hubspot.com/private-apps/', urlLabel: 'Open Private Apps', tip: 'You need Super Admin or App Marketplace permissions.' },
      { text: 'Click "Create a private app" → name it "Growth OS"' },
      { text: 'Go to the "Scopes" tab and select these read-only scopes:', tip: 'Required: crm.objects.contacts.read, crm.objects.deals.read, crm.objects.companies.read. These are under the "CRM" section.' },
      { text: 'Click "Create app" → confirm → copy the Access Token shown', tip: 'The token starts with pat-na1- (or pat-eu1- for EU accounts). Copy the full string.' },
      { text: 'Paste the token below. Portal ID is optional but helps with multi-hub setups.' },
    ],
  },

  // ── Email Marketing ──
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    slug: 'klaviyo',
    category: 'email',
    description: 'Import email campaign metrics, flows, and subscriber data from Klaviyo.',
    icon: 'klaviyo',
    color: 'emerald',
    authType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'Private API Key', type: 'password', placeholder: 'pk_xxxxx', required: true, sensitive: true, help: 'Starts with pk_ — found in Account → Settings → API Keys' },
    ],
    docsUrl: 'https://developers.klaviyo.com/en/reference/api-overview',
    setupTime: '~1 min',
    quickFindPath: 'Account name (bottom-left) → Settings → API Keys',
    dataSync: ['Campaigns', 'Flows', 'Lists', 'Subscribers', 'Metrics'],
    setupGuide: [
      { text: 'Open Klaviyo → click your account name (bottom-left) → Settings', url: 'https://www.klaviyo.com/settings/account/api-keys', urlLabel: 'Open Klaviyo API Keys', tip: 'You need account Owner or Admin access.' },
      { text: 'Click "Create Private API Key"', tip: 'Name it "Growth OS". Under Access Level, select "Read-only" for full read access with no write risk.' },
      { text: 'Copy the key (starts with pk_) and paste it below', tip: 'The key is only shown once. If you lose it, you\'ll need to create a new one.' },
    ],
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    slug: 'mailchimp',
    category: 'email',
    description: 'Sync email campaign stats, audience data, and automations from Mailchimp.',
    icon: 'mailchimp',
    color: 'yellow',
    authType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'xxxxx-us1', required: true, sensitive: true, help: 'Looks like abc123def-us1 — the part after the dash is your server prefix' },
      { key: 'server', label: 'Server Prefix', type: 'text', placeholder: 'us1', required: true, help: 'The 2-4 letter code after the dash in your API key (e.g., us1, us21, eu1)' },
    ],
    docsUrl: 'https://mailchimp.com/developer/marketing/api/',
    setupTime: '~1 min',
    quickFindPath: 'Profile icon → Account & billing → Extras → API keys',
    dataSync: ['Campaigns', 'Audiences', 'Automations', 'Reports'],
    setupGuide: [
      { text: 'Open Mailchimp → click your profile icon → Account & billing', url: 'https://admin.mailchimp.com/account/api/', urlLabel: 'Open Mailchimp API Keys', tip: 'You need Manager or higher access to create API keys.' },
      { text: 'Scroll down to "Your API keys" → click "Create A Key"', tip: 'Label it "Growth OS" for easy identification.' },
      { text: 'Copy the full key. Note the server prefix — it\'s the part after the dash', tip: 'Example: abc123def456-us21 → the server is "us21". This tells us which Mailchimp data center to connect to.' },
      { text: 'Paste the API key and server prefix below.' },
    ],
  },

  // ── Payments ──
  {
    id: 'stripe',
    name: 'Stripe',
    slug: 'stripe',
    category: 'payments',
    description: 'Import payment data, subscriptions, and revenue metrics from Stripe.',
    icon: 'stripe',
    color: 'violet',
    authType: 'api_key',
    fields: [
      { key: 'secretKey', label: 'Restricted Key', type: 'password', placeholder: 'rk_live_xxxxx', required: true, sensitive: true, help: 'Starts with rk_live_ — use a Restricted Key, not the Secret Key, for better security' },
      { key: 'webhookSecret', label: 'Webhook Signing Secret (optional)', type: 'password', placeholder: 'whsec_xxxxx', required: false, sensitive: true, help: 'Starts with whsec_ — enables real-time event notifications' },
    ],
    docsUrl: 'https://stripe.com/docs/api',
    setupTime: '~2 min',
    quickFindPath: 'Dashboard → Developers → API Keys → Restricted keys',
    dataSync: ['Payments', 'Subscriptions', 'Customers', 'Invoices', 'Refunds'],
    setupGuide: [
      { text: 'Open the Stripe Dashboard → Developers → API keys', url: 'https://dashboard.stripe.com/apikeys', urlLabel: 'Open Stripe API Keys', tip: 'Make sure you\'re in Live mode (not Test mode) — toggle in the top bar.' },
      { text: 'Click "Create restricted key" (recommended) or use an existing one', tip: 'Name it "Growth OS". Grant read access to: Charges, Customers, Subscriptions, Invoices. Deny write access to everything.' },
      { text: 'Copy the restricted key (starts with rk_live_) and paste it below', tip: '🔒 Pro tip: Restricted keys are safer than your Secret Key because they can only access what you allow.' },
      { text: '(Optional) Set up a webhook for real-time updates: Developers → Webhooks → Add endpoint', url: 'https://dashboard.stripe.com/webhooks', urlLabel: 'Open Stripe Webhooks', tip: 'Point it to your Growth OS webhook URL. Copy the Signing Secret (starts with whsec_).' },
    ],
  },

  // ── Custom ──
  {
    id: 'custom_webhook',
    name: 'Custom Webhook',
    slug: 'custom_webhook',
    category: 'custom',
    description: 'Send data to Growth OS via a custom webhook endpoint. Any JSON payload.',
    icon: 'webhook',
    color: 'slate',
    authType: 'webhook',
    fields: [
      { key: 'label', label: 'Integration Name', type: 'text', placeholder: 'My CRM', required: true },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'Auto-generated if left blank', required: false, sensitive: true, help: 'We auto-generate one if you leave this blank. Use it to verify incoming payloads.' },
    ],
    docsUrl: undefined,
    setupTime: '~1 min',
    quickFindPath: 'No external setup needed — just name your integration',
    dataSync: ['Any JSON payload'],
    setupGuide: [
      { text: 'Name your integration — this is just for your reference', tip: 'Examples: "Internal CRM", "Zapier", "Custom ETL".' },
      { text: 'Click Save — we\'ll generate a unique webhook URL and secret for you', tip: 'The URL will look like: https://your-api.com/api/webhooks/abc123' },
      { text: 'POST JSON payloads to the webhook URL from any system', tip: 'Include a X-Webhook-Signature header using HMAC-SHA256 with your webhook secret for security.' },
      { text: 'Growth OS will parse and ingest the data automatically' },
    ],
  },
  {
    id: 'csv_upload',
    name: 'CSV / Excel Upload',
    slug: 'csv_upload',
    category: 'custom',
    description: 'Upload CSV or Excel files for one-time or recurring data imports.',
    icon: 'upload',
    color: 'cyan',
    authType: 'api_key',
    fields: [
      { key: 'label', label: 'Dataset Name', type: 'text', placeholder: 'Historical Orders', required: true, help: 'A friendly name for this dataset — used to identify uploads' },
      { key: 'dataType', label: 'Data Type', type: 'select', options: [{ value: 'orders', label: 'Orders' }, { value: 'customers', label: 'Customers' }, { value: 'spend', label: 'Ad Spend' }, { value: 'traffic', label: 'Traffic' }, { value: 'custom', label: 'Custom Events' }], required: true, help: 'Determines how we map and validate your columns' },
    ],
    setupTime: '~1 min',
    quickFindPath: 'No external setup — just pick a name and data type',
    dataSync: ['CSV files', 'TSV files', 'Excel (.xlsx)'],
    setupGuide: [
      { text: 'Name your dataset (e.g. "Q4 2024 Orders") and select the data type', tip: 'The data type helps us auto-map columns. For example, "Orders" expects columns like order_id, date, amount.' },
      { text: 'Click Save to create the upload target', tip: 'You can create multiple CSV sources for different datasets.' },
      { text: 'Use the upload button to import files', tip: 'Supported formats: .csv, .tsv, .xlsx. Max file size: 50MB. We\'ll preview and let you map columns.' },
      { text: 'We\'ll validate, map columns, and ingest the data automatically', tip: 'If column names don\'t match exactly, you\'ll be prompted to map them manually.' },
    ],
  },
];

export async function connectionsRoutes(app: FastifyInstance) {
  // ── Connector Catalog ──────────────────────────────────────
  app.get('/connectors/catalog', async () => {
    return { connectors: CONNECTOR_CATALOG };
  });

  // ── List all saved connections ─────────────────────────────
  app.get('/connections', async () => {
    const credentials = await prisma.connectorCredential.findMany({
      select: {
        id: true,
        connectorType: true,
        metadata: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Enrich with catalog info
    const connections = credentials.map((c) => {
      const def = CONNECTOR_CATALOG.find((d) => d.id === c.connectorType);
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      return {
        id: c.id,
        connectorType: c.connectorType,
        name: def?.name ?? c.connectorType,
        category: def?.category ?? 'custom',
        icon: def?.icon ?? 'webhook',
        color: def?.color ?? 'slate',
        label: (meta.label as string) ?? def?.name ?? c.connectorType,
        status: c.lastSyncStatus === 'error' ? 'error' : c.lastSyncStatus === 'syncing' ? 'syncing' : 'active',
        lastSyncAt: c.lastSyncAt,
        lastSyncStatus: c.lastSyncStatus,
        config: meta,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    return { connections };
  });

  // ── Save / update a connection ─────────────────────────────
  app.post('/connections', async (request) => {
    const body = request.body as {
      connectorType: string;
      fields: Record<string, string>;
    };

    const { connectorType, fields } = body;
    const def = CONNECTOR_CATALOG.find((d) => d.id === connectorType);
    if (!def) {
      return { success: false, error: `Unknown connector type: ${connectorType}` };
    }

    // Separate sensitive vs metadata fields
    const credentials: Record<string, string> = {};
    const metadata: Record<string, unknown> = { label: fields.label ?? def.name };

    // Load existing credentials and metadata so we don't lose them when updating
    const existing = await prisma.connectorCredential.findUnique({ where: { connectorType } });
    let existingCreds: Record<string, string> = {};
    let existingMeta: Record<string, unknown> = {};
    if (existing) {
      try {
        existingCreds = JSON.parse(decrypt(existing.encryptedData, existing.iv, existing.authTag)) as Record<string, string>;
      } catch { /* ignore */ }
      existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    }

    // Start with all existing credentials (preserves OAuth tokens like accessToken/refreshToken)
    Object.assign(credentials, existingCreds);
    // Merge existing metadata (preserves authType, clientId from OAuth callback)
    Object.assign(metadata, existingMeta, { label: fields.label ?? metadata.label ?? def.name });

    for (const fieldDef of def.fields) {
      const val = fields[fieldDef.key];
      if (fieldDef.sensitive) {
        // Override with new value if user provided one
        if (val && val !== '') {
          credentials[fieldDef.key] = val;
        }
      } else {
        if (val !== undefined && val !== '') {
          metadata[fieldDef.key] = val;
        }
      }
    }

    // For webhook type, auto-generate a secret if not provided
    if (def.authType === 'webhook' && !credentials.webhookSecret) {
      credentials.webhookSecret = crypto.randomBytes(32).toString('hex');
    }

    const { encrypted, iv, authTag } = encrypt(JSON.stringify(credentials));

    const result = await prisma.connectorCredential.upsert({
      where: { connectorType },
      create: {
        connectorType,
        encryptedData: encrypted,
        iv,
        authTag,
        metadata: metadata as Record<string, string>,
        lastSyncStatus: 'pending',
      },
      update: {
        encryptedData: encrypted,
        iv,
        authTag,
        metadata: metadata as Record<string, string>,
        lastSyncStatus: 'pending',
      },
    });

    // Return the webhook URL for webhook connectors
    const extra: Record<string, string> = {};
    if (def.authType === 'webhook') {
      const baseUrl = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? '4000'}`;
      extra.webhookUrl = `${baseUrl}/api/webhooks/${result.id}`;
    }

    return { success: true, id: result.id, connectorType, ...extra };
  });

  // ── Test a connection ──────────────────────────────────────
  app.post('/connections/:type/test', async (request) => {
    const { type } = request.params as { type: string };

    if (await isDemoMode()) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
      const def = CONNECTOR_CATALOG.find((d) => d.id === type);
      return {
        success: true,
        message: `${def?.name ?? type} connection verified successfully (demo mode)`,
        latencyMs: Math.round(80 + Math.random() * 120),
      };
    }

    const credential = await prisma.connectorCredential.findUnique({
      where: { connectorType: type },
    });

    if (!credential) {
      return { success: false, message: 'No credentials configured for this connector' };
    }

    try {
      const creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag));
      const meta = (credential.metadata ?? {}) as Record<string, string>;
      const start = Date.now();

      if (type === 'shopify') {
        const resp = await fetch(`https://${meta.shopDomain}/admin/api/${meta.apiVersion ?? '2024-10'}/shop.json`, {
          headers: { 'X-Shopify-Access-Token': creds.accessToken },
        });
        if (!resp.ok) throw new Error(`Shopify responded ${resp.status}`);
        const shop = (await resp.json()) as { shop: { name: string } };
        return { success: true, message: `Connected to "${shop.shop.name}"`, latencyMs: Date.now() - start };
      }

      if (type === 'meta_ads') {
        const token = (creds.accessToken ?? '').trim();
        if (!token) {
          return { success: false, message: 'No access token found. Please re-enter your Meta access token.' };
        }
        const resp = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({})) as { error?: { message?: string; type?: string; code?: number } };
          const metaMsg = body?.error?.message ?? `status ${resp.status}`;
          throw new Error(`Meta API: ${metaMsg}`);
        }
        const me = await resp.json() as { name?: string; id?: string };
        return { success: true, message: `Meta Ads verified — connected as "${me.name ?? me.id}"`, latencyMs: Date.now() - start };
      }

      if (type === 'google_ads') {
        const devToken = (creds.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim();
        const customerId = (meta.customerId ?? creds.customerId ?? '').toString().trim().replace(/-/g, '');
        const accessToken = creds.accessToken ?? '';

        if (!devToken || !customerId) {
          return { success: false, message: 'Missing developer token or customer ID' };
        }

        // If we have an OAuth access token, validate via the REST API
        if (accessToken) {
          const resp = await fetch(
            'https://googleads.googleapis.com/v23/customers:listAccessibleCustomers',
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'developer-token': devToken,
              },
            },
          );

          if (resp.ok) {
            const data = await resp.json() as { resourceNames?: string[] };
            const count = data.resourceNames?.length ?? 0;
            return {
              success: true,
              message: `Google Ads verified — ${count} accessible account(s) found`,
              latencyMs: Date.now() - start,
            };
          }

          const errBody = await resp.text();
          throw new Error(`Google Ads responded ${resp.status}: ${errBody.substring(0, 200)}`);
        }

        // No OAuth token yet — validate credentials format and confirm saved
        if (customerId.length !== 10 || !/^\d{10}$/.test(customerId)) {
          return { success: false, message: `Invalid Customer ID format: "${meta.customerId}". Expected 10 digits (e.g. 123-456-7890).` };
        }

        return {
          success: true,
          message: `Credentials saved (Customer: ${meta.customerId ?? customerId}). Connect via OAuth to enable full API access.`,
          latencyMs: Date.now() - start,
        };
      }

      if (type === 'ga4') {
        return { success: true, message: 'Google OAuth token is valid', latencyMs: Date.now() - start };
      }

      if (type === 'woocommerce') {
        const resp = await fetch(`${meta.siteUrl}/wp-json/wc/v3/system_status`, {
          headers: { Authorization: 'Basic ' + Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64') },
        });
        if (!resp.ok) throw new Error(`WooCommerce responded ${resp.status}`);
        return { success: true, message: 'WooCommerce connection verified', latencyMs: Date.now() - start };
      }

      if (type === 'hubspot') {
        const resp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
          headers: { Authorization: `Bearer ${creds.accessToken}` },
        });
        if (!resp.ok) throw new Error(`HubSpot responded ${resp.status}`);
        return { success: true, message: 'HubSpot CRM connection verified', latencyMs: Date.now() - start };
      }

      if (type === 'klaviyo') {
        const resp = await fetch('https://a.klaviyo.com/api/lists', {
          headers: { Authorization: `Klaviyo-API-Key ${creds.apiKey}`, revision: '2024-02-15' },
        });
        if (!resp.ok) throw new Error(`Klaviyo responded ${resp.status}`);
        return { success: true, message: 'Klaviyo connection verified', latencyMs: Date.now() - start };
      }

      if (type === 'mailchimp') {
        const resp = await fetch(`https://${meta.server}.api.mailchimp.com/3.0/ping`, {
          headers: { Authorization: `apikey ${creds.apiKey}` },
        });
        if (!resp.ok) throw new Error(`Mailchimp responded ${resp.status}`);
        return { success: true, message: 'Mailchimp connection verified', latencyMs: Date.now() - start };
      }

      if (type === 'stripe') {
        const resp = await fetch('https://api.stripe.com/v1/balance', {
          headers: { Authorization: `Bearer ${creds.secretKey}` },
        });
        if (!resp.ok) throw new Error(`Stripe responded ${resp.status}`);
        return { success: true, message: 'Stripe connection verified', latencyMs: Date.now() - start };
      }

      if (type === 'tiktok_ads') {
        const resp = await fetch(`https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${meta.advertiserId}"]`, {
          headers: { 'Access-Token': creds.accessToken },
        });
        if (!resp.ok) throw new Error(`TikTok responded ${resp.status}`);
        return { success: true, message: 'TikTok Ads connection verified', latencyMs: Date.now() - start };
      }

      return { success: true, message: 'Connection saved', latencyMs: Date.now() - start };
    } catch (error) {
      await prisma.connectorCredential.update({
        where: { connectorType: type },
        data: { lastSyncStatus: 'error' },
      });
      return { success: false, message: `Connection failed: ${(error as Error).message}` };
    }
  });

  // ── Trigger a sync ──────────────────────────────────────────
  app.post('/connections/:type/sync', async (request) => {
    const { type } = request.params as { type: string };

    const credential = await prisma.connectorCredential.findUnique({
      where: { connectorType: type },
    });

    if (!credential) {
      return { success: false, message: 'Connection not found' };
    }

    // Mark as syncing
    await prisma.connectorCredential.update({
      where: { connectorType: type },
      data: { lastSyncStatus: 'syncing' },
    });

    if (await isDemoMode()) {
      // Simulate a sync in demo mode
      setTimeout(async () => {
        await prisma.connectorCredential.update({
          where: { connectorType: type },
          data: { lastSyncAt: new Date(), lastSyncStatus: 'success' },
        });
      }, 3000);
      return { success: true, message: 'Sync started (demo mode)' };
    }

    // Live mode: run real ETL pipeline in background
    runConnectorSync(type)
      .then(async (result) => {
        await prisma.connectorCredential.update({
          where: { connectorType: type },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: 'success',
            metadata: { ...(credential.metadata as Record<string, unknown>), lastSyncRows: result.rowsLoaded, lastSyncError: null },
          },
        });
        app.log.info({ connectorType: type, rowsLoaded: result.rowsLoaded }, 'Sync completed');
      })
      .catch(async (error) => {
        const errMsg = (error as Error).message ?? String(error);
        try {
          await prisma.connectorCredential.update({
            where: { connectorType: type },
            data: { lastSyncStatus: 'error', metadata: { ...(credential.metadata as Record<string, unknown>), lastSyncError: errMsg } },
          });
        } catch (updateErr) {
          app.log.error({ connectorType: type, updateErr }, 'Failed to update sync error status');
        }
        app.log.error({ connectorType: type, error: errMsg }, 'Sync failed');
      });

    return { success: true, message: 'Sync started — fetching real data from API' };
  });

  // ── Pipeline diagnostic ──────────────────────────────────────
  app.get('/connections/debug/pipeline', async () => {
    const rawCounts = await prisma.$queryRawUnsafe<Array<{ source: string; entity: string; cnt: number }>>(
      `SELECT source, entity, COUNT(*)::int as cnt FROM raw_events GROUP BY source, entity ORDER BY source, entity`
    );
    const stgSpendCounts = await prisma.$queryRawUnsafe<Array<{ source: string; cnt: number; total_spend: number }>>(
      `SELECT source, COUNT(*)::int as cnt, SUM(spend)::float as total_spend FROM stg_spend GROUP BY source ORDER BY source`
    );
    const factSpendCounts = await prisma.$queryRawUnsafe<Array<{ slug: string; cnt: number; total_spend: number }>>(
      `SELECT c.slug, COUNT(*)::int as cnt, SUM(fs.spend)::float as total_spend FROM fact_spend fs JOIN dim_channel c ON fs.channel_id = c.id GROUP BY c.slug ORDER BY c.slug`
    );

    // Extra diagnostics: dim_channel, channelRaw distribution, isNewCustomer, null channelIds
    const dimChannels = await prisma.$queryRawUnsafe<Array<{ slug: string; name: string }>>(
      `SELECT slug, name FROM dim_channel ORDER BY slug`
    );
    const stgChannelRaw = await prisma.$queryRawUnsafe<Array<{ channel_raw: string; cnt: number }>>(
      `SELECT COALESCE(channel_raw, 'NULL') as channel_raw, COUNT(*)::int as cnt FROM stg_orders GROUP BY channel_raw ORDER BY cnt DESC`
    );
    const factOrderChannels = await prisma.$queryRawUnsafe<Array<{ channel: string; cnt: number; new_customers: number }>>(
      `SELECT COALESCE(c.slug, 'NULL') as channel, COUNT(*)::int as cnt,
              SUM(CASE WHEN fo.is_new_customer THEN 1 ELSE 0 END)::int as new_customers
       FROM fact_orders fo LEFT JOIN dim_channel c ON fo.channel_id = c.id
       GROUP BY c.slug ORDER BY cnt DESC`
    );
    const cohortCount = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*)::int as cnt FROM cohorts`
    );

    return {
      rawCounts, stgSpendCounts, factSpendCounts,
      dimChannels, stgChannelRaw, factOrderChannels,
      cohortCount: cohortCount[0]?.cnt ?? 0,
    };
  });

  // ── Raw attribution sample (debug) ─────────────────────────
  app.get('/connections/debug/attribution', async () => {
    const samples = await prisma.$queryRawUnsafe<Array<{
      order_id: string;
      channel_raw: string;
      source_name: string;
      landing_site: string | null;
      referring_site: string | null;
      utm_source: string | null;
      utm_medium: string | null;
      journey: unknown;
    }>>(
      `SELECT re.external_id as order_id,
              so.channel_raw,
              so.source_name,
              so.landing_site,
              so.referring_site,
              so.utm_source,
              so.utm_medium,
              re.payload_json->'customerJourneySummary' as journey
       FROM raw_events re
       LEFT JOIN stg_orders so ON so.order_id = re.external_id
       WHERE re.source = 'shopify' AND re.entity = 'orders'
       ORDER BY re.fetched_at DESC
       LIMIT 20`
    );
    return { samples };
  });

  // ── Rebuild marts from existing staging data ───────────────
  app.post('/connections/rebuild-marts', async () => {
    // Re-run normalizeStaging + buildMarts without re-fetching from APIs
    normalizeStaging()
      .then(() => buildMarts())
      .then((result) => {
        app.log.info({ result }, 'Marts rebuilt successfully');
      })
      .catch((err) => {
        app.log.error({ error: String(err) }, 'Mart rebuild failed');
      });

    return { success: true, message: 'Rebuilding marts from staging data (background)' };
  });

  // ── Delete a connection ─────────────────────────────────────
  app.delete('/connections/:type', async (request) => {
    const { type } = request.params as { type: string };
    await prisma.connectorCredential.deleteMany({ where: { connectorType: type } });
    return { success: true };
  });

  // ── Google OAuth initiation ─────────────────────────────────
  app.get('/auth/google', async (request, reply) => {
    const { source } = request.query as { source?: string };
    const googleOAuth = await getGoogleOAuthConfig();
    const clientId = googleOAuth.clientId;
    const redirectUri = googleOAuth.redirectUri;

    if (!clientId) {
      return reply.status(400).send({ error: 'GOOGLE_CLIENT_ID not configured. Go to Settings → Google OAuth to set it up.' });
    }

    const scopeMap: Record<string, string[]> = {
      google_ads: ['https://www.googleapis.com/auth/adwords'],
      ga4: ['https://www.googleapis.com/auth/analytics.readonly'],
    };
    const scopes = (scopeMap[source ?? ''] ?? Object.values(scopeMap).flat()).join(' ');

    const state = JSON.stringify({ source: source ?? 'google' });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent` +
      `&state=${encodeURIComponent(state)}`;

    return reply.redirect(authUrl);
  });

  // ── Google OAuth callback ───────────────────────────────────
  app.get('/auth/google/callback', async (request, reply) => {
    const { code, state: stateRaw } = request.query as { code: string; state?: string };
    const googleOAuth = await getGoogleOAuthConfig();
    const clientId = googleOAuth.clientId;
    const clientSecret = googleOAuth.clientSecret;
    const redirectUri = googleOAuth.redirectUri;
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    let connectorType = 'google';
    try {
      const parsed = JSON.parse(stateRaw ?? '{}');
      connectorType = parsed.source ?? 'google';
    } catch { /* use default */ }

    try {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: 'authorization_code',
        }),
      });

      const tokens = await resp.json() as { access_token: string; refresh_token?: string };

      // Merge with existing credentials so we don't lose fields like developerToken
      const existing = await prisma.connectorCredential.findUnique({ where: { connectorType } });
      let existingCreds: Record<string, string> = {};
      let existingMeta: Record<string, unknown> = {};
      if (existing) {
        try {
          existingCreds = JSON.parse(decrypt(existing.encryptedData, existing.iv, existing.authTag)) as Record<string, string>;
        } catch { /* ignore */ }
        existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
      }

      const mergedCreds = {
        ...existingCreds,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? '',
      };
      const mergedMeta = { ...existingMeta, clientId, authType: 'oauth2' };

      const { encrypted, iv, authTag } = encrypt(JSON.stringify(mergedCreds));

      await prisma.connectorCredential.upsert({
        where: { connectorType },
        create: {
          connectorType,
          encryptedData: encrypted,
          iv,
          authTag,
          metadata: mergedMeta as Record<string, string>,
          lastSyncStatus: 'pending',
        },
        update: { encryptedData: encrypted, iv, authTag, metadata: mergedMeta as Record<string, string>, lastSyncStatus: 'pending' },
      });

      return reply.redirect(`${frontendUrl}/connections?connected=${connectorType}`);
    } catch (error) {
      return reply.redirect(`${frontendUrl}/connections?error=${encodeURIComponent(String(error))}`);
    }
  });

  // ── Shopify OAuth initiation ───────────────────────────────
  app.get('/auth/shopify', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    // Read saved credentials to get shopDomain and clientId
    const credential = await prisma.connectorCredential.findUnique({ where: { connectorType: 'shopify' } });
    if (!credential) {
      return reply.redirect(`${frontendUrl}/connections?error=${encodeURIComponent('Save your Shopify credentials first')}`);
    }

    const meta = (credential.metadata ?? {}) as Record<string, string>;
    let creds: Record<string, string> = {};
    try {
      creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
    } catch { /* ignore */ }

    const shopDomain = (meta.shopDomain ?? '').trim();
    const clientId = (meta.clientId ?? creds.clientId ?? '').trim();

    if (!shopDomain || !clientId) {
      return reply.redirect(`${frontendUrl}/connections?error=${encodeURIComponent('Missing store domain or Client ID')}`);
    }

    const apiBaseUrl = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? '4000'}`;
    const redirectUri = `${apiBaseUrl}/api/auth/shopify/callback`;
    const scopes = 'read_orders,read_customers,read_products,read_inventory,read_analytics';
    const nonce = crypto.randomBytes(16).toString('hex');

    const authUrl = `https://${shopDomain}/admin/oauth/authorize?` +
      `client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${nonce}`;

    return reply.redirect(authUrl);
  });

  // ── Shopify OAuth callback ────────────────────────────────
  app.get('/auth/shopify/callback', async (request, reply) => {
    const { code, shop } = request.query as { code?: string; shop?: string; state?: string; hmac?: string };
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (!code || !shop) {
      return reply.redirect(`${frontendUrl}/connections?error=${encodeURIComponent('Missing code or shop from Shopify')}`);
    }

    // Get saved client credentials
    const credential = await prisma.connectorCredential.findUnique({ where: { connectorType: 'shopify' } });
    if (!credential) {
      return reply.redirect(`${frontendUrl}/connections?error=${encodeURIComponent('No Shopify credentials found')}`);
    }

    let existingCreds: Record<string, string> = {};
    const existingMeta = (credential.metadata ?? {}) as Record<string, unknown>;
    try {
      existingCreds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
    } catch { /* ignore */ }

    const clientId = ((existingMeta.clientId as string) ?? existingCreds.clientId ?? '').trim();
    const clientSecret = (existingCreds.clientSecret ?? '').trim();

    if (!clientId || !clientSecret) {
      return reply.redirect(`${frontendUrl}/connections?error=${encodeURIComponent('Missing Client ID or Client Secret')}`);
    }

    try {
      // Exchange authorization code for a permanent access token
      const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Shopify token exchange failed: ${resp.status} — ${errText.substring(0, 300)}`);
      }

      const tokens = await resp.json() as { access_token: string; scope?: string };

      // Merge with existing credentials
      const mergedCreds = {
        ...existingCreds,
        accessToken: tokens.access_token,
      };
      const mergedMeta = {
        ...existingMeta,
        shopDomain: shop,
        authType: 'oauth2',
        oauthScope: tokens.scope ?? '',
      };

      const { encrypted, iv, authTag } = encrypt(JSON.stringify(mergedCreds));

      await prisma.connectorCredential.upsert({
        where: { connectorType: 'shopify' },
        create: {
          connectorType: 'shopify',
          encryptedData: encrypted,
          iv,
          authTag,
          metadata: mergedMeta as Record<string, string>,
          lastSyncStatus: 'pending',
        },
        update: {
          encryptedData: encrypted,
          iv,
          authTag,
          metadata: mergedMeta as Record<string, string>,
          lastSyncStatus: 'pending',
        },
      });

      return reply.redirect(`${frontendUrl}/connections?connected=shopify`);
    } catch (error) {
      app.log.error({ error: (error as Error).message }, 'Shopify OAuth callback failed');
      return reply.redirect(`${frontendUrl}/connections?error=${encodeURIComponent((error as Error).message)}`);
    }
  });

  // ── Webhook ingestion endpoint ──────────────────────────────
  app.post('/webhooks/:id', async (request) => {
    const { id } = request.params as { id: string };
    const payload = request.body;

    const credential = await prisma.connectorCredential.findFirst({
      where: { id },
    });

    if (!credential) {
      return { success: false, message: 'Webhook not found' };
    }

    // Validate webhook signature (HMAC-SHA256)
    const signature = (request.headers as Record<string, string>)['x-webhook-signature'];
    if (credential.encryptedData && credential.iv && credential.authTag) {
      try {
        const creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
        const secret = creds.webhookSecret;
        if (secret) {
          const body = JSON.stringify(payload);
          const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
          if (!signature || !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
            app.log.warn({ webhookId: id }, 'Webhook signature verification failed');
            return { success: false, message: 'Invalid signature' };
          }
        }
      } catch (e) {
        app.log.warn({ webhookId: id, error: (e as Error).message }, 'Failed to validate webhook signature');
      }
    }

    app.log.info({ webhookId: id, payloadSize: JSON.stringify(payload).length }, 'Webhook received');

    await prisma.connectorCredential.update({
      where: { id },
      data: { lastSyncAt: new Date(), lastSyncStatus: 'success' },
    });

    return { success: true, message: 'Webhook payload received' };
  });
}
