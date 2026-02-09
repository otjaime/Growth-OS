import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import crypto from 'crypto';

if (!process.env.ENCRYPTION_KEY) {
  console.warn('⚠️  ENCRYPTION_KEY not set — connections routes will fail to encrypt/decrypt credentials. Set a stable 64-char hex key in .env');
}
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? crypto.randomBytes(32).toString('hex');

function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function connectionsRoutes(app: FastifyInstance) {
  // List all connections (without sensitive data)
  app.get('/connections', async () => {
    const connections = await prisma.connectorCredential.findMany({
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

    return { connections };
  });

  // Save / update a connection
  app.post('/connections/:type', async (request) => {
    const { type } = request.params as { type: string };
    const body = request.body as Record<string, unknown>;

    // Separate sensitive credentials from metadata
    const sensitiveFields: Record<string, string[]> = {
      shopify: ['accessToken'],
      google: ['accessToken', 'refreshToken', 'clientSecret'],
      meta: ['accessToken'],
    };

    const fields = sensitiveFields[type] ?? [];
    const credentials: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (fields.includes(key)) {
        credentials[key] = value;
      } else {
        metadata[key] = value;
      }
    }

    const { encrypted, iv, authTag } = encrypt(JSON.stringify(credentials));

    await prisma.connectorCredential.upsert({
      where: { connectorType: type },
      create: {
        connectorType: type,
        encryptedData: encrypted,
        iv,
        authTag,
        metadata,
      },
      update: {
        encryptedData: encrypted,
        iv,
        authTag,
        metadata,
      },
    });

    return { success: true, type };
  });

  // Test a connection
  app.post('/connections/:type/test', async (request) => {
    const { type } = request.params as { type: string };

    if (process.env.DEMO_MODE === 'true') {
      return { success: true, message: 'Demo mode — connection simulated successfully' };
    }

    const credential = await prisma.connectorCredential.findUnique({
      where: { connectorType: type },
    });

    if (!credential) {
      return { success: false, message: 'No credentials configured' };
    }

    try {
      const creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag));

      // Type-specific connection tests
      if (type === 'shopify') {
        const meta = credential.metadata as Record<string, string>;
        const resp = await fetch(`https://${meta.shopDomain}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': creds.accessToken },
        });
        if (!resp.ok) throw new Error(`Shopify responded ${resp.status}`);
        return { success: true, message: 'Shopify connection successful' };
      }

      if (type === 'meta') {
        const resp = await fetch(
          `https://graph.facebook.com/v19.0/me?access_token=${creds.accessToken}`,
        );
        if (!resp.ok) throw new Error(`Meta responded ${resp.status}`);
        return { success: true, message: 'Meta connection successful' };
      }

      if (type === 'google') {
        return { success: true, message: 'Google OAuth token stored. Use OAuth flow to validate.' };
      }

      return { success: false, message: 'Unknown connector type' };
    } catch (error) {
      return { success: false, message: `Connection failed: ${String(error)}` };
    }
  });

  // Delete a connection
  app.delete('/connections/:type', async (request) => {
    const { type } = request.params as { type: string };
    await prisma.connectorCredential.deleteMany({ where: { connectorType: type } });
    return { success: true };
  });

  // Google OAuth initiation
  app.get('/auth/google', async (_request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/auth/google/callback';

    if (!clientId) {
      return reply.status(400).send({ error: 'GOOGLE_CLIENT_ID not configured' });
    }

    const scopes = [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/analytics.readonly',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

    return reply.redirect(authUrl);
  });

  // Google OAuth callback
  app.get('/auth/google/callback', async (request, reply) => {
    const { code } = request.query as { code: string };
    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/auth/google/callback';

    try {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await resp.json() as { access_token: string; refresh_token: string };

      const { encrypted, iv, authTag } = encrypt(JSON.stringify({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        clientSecret,
      }));

      await prisma.connectorCredential.upsert({
        where: { connectorType: 'google' },
        create: {
          connectorType: 'google',
          encryptedData: encrypted,
          iv,
          authTag,
          metadata: { clientId },
        },
        update: { encryptedData: encrypted, iv, authTag },
      });

      return reply.redirect('http://localhost:3000/connections?google=connected');
    } catch (error) {
      return reply.redirect(`http://localhost:3000/connections?google=error&message=${encodeURIComponent(String(error))}`);
    }
  });
}
