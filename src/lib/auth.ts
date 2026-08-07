import crypto from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
    });
  });
}

export function generateSessionToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  // 30 days validity
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return { token, expiresAt };
}

export function generatePasswordResetToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  // 1 hour validity
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  return { token, expiresAt };
}

export function generateEmailVerificationToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  // 24 hours validity
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { token, expiresAt };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+234' + cleaned.slice(1);
  }
  return cleaned;
}