import crypto from 'crypto';

if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  throw new Error(
    'FATAL: ENCRYPTION_KEY must be set in production. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
}
if (!process.env.ENCRYPTION_KEY) {
  console.warn('ENCRYPTION_KEY not set — using random key (dev only, connections will not persist across restarts)');
}
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? crypto.randomBytes(32).toString('hex');

export function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

export function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
