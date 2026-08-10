import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function resolveKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY must be set in production — refusing to start with a hardcoded key.',
    );
  }

  console.warn('[encryption] ENCRYPTION_KEY not set — using an insecure dev-only fallback key.');
  return '12345678901234567890123456789012';
}

const ENCRYPTION_KEY = resolveKey();

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(hash: string): string {
  if (!hash || !hash.includes(':')) return hash;
  try {
    const parts = hash.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return hash; // If it fails to decrypt, return original (e.g. not encrypted)
  }
}

/**
 * Deterministic one-way hash for looking up an encrypted value by exact
 * match (e.g. finding a User by email). AES-256-GCM uses a random IV per
 * call, so `encrypt()` output can never be queried directly — this gives us
 * a stable, indexable column to query instead, without storing the
 * plaintext value itself.
 */
export function hashForLookup(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
