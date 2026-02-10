import { getAppSetting, decrypt } from '@growth-os/database';

export async function getGoogleOAuthConfig(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}> {
  // Read from DB first, fall back to env vars
  const clientId = (await getAppSetting('google_client_id')) ?? process.env.GOOGLE_CLIENT_ID ?? '';

  let clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  const secretJson = await getAppSetting('google_client_secret');
  if (secretJson) {
    try {
      const parsed = JSON.parse(secretJson) as { encrypted: string; iv: string; authTag: string };
      clientSecret = decrypt(parsed.encrypted, parsed.iv, parsed.authTag);
    } catch {
      // fall back to env
    }
  }

  const redirectUri = (await getAppSetting('google_redirect_uri'))
    ?? process.env.GOOGLE_REDIRECT_URI
    ?? `${process.env.PUBLIC_API_URL ?? 'http://localhost:4000'}/api/auth/google/callback`;

  return { clientId, clientSecret, redirectUri };
}
