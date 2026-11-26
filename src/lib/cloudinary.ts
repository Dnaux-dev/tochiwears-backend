/**
 * Tochiwears — Cloudinary image storage
 *
 * Uploads go straight from the browser to Cloudinary using a short-lived
 * signature from POST /admin/uploads/sign; the API never handles file bytes.
 * Products store the Cloudinary public_id as product_images.storage_key and
 * delivery URLs are built at read time with automatic format/quality.
 *
 * Signing: https://cloudinary.com/documentation/authentication_signatures
 */

import crypto from 'node:crypto';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export const ROOT_FOLDER = (process.env.CLOUDINARY_FOLDER || 'tochiwears').replace(/^\/+|\/+$/g, '');
export const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,avif';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const cloudinaryEnabled = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

/** Cloudinary signature: SHA-1 of sorted `key=value` pairs joined by `&`, plus the secret. */
export function sign(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + API_SECRET).digest('hex');
}

/** Parameters the browser sends with its multipart upload to `uploadUrl`. */
export function createUploadSignature(folder: string) {
  if (!cloudinaryEnabled) throw new Error('Cloudinary is not configured');
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { allowed_formats: ALLOWED_FORMATS, folder, timestamp };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    fields: {
      api_key: API_KEY!,
      timestamp,
      folder,
      allowed_formats: ALLOWED_FORMATS,
      signature: sign(params),
    },
    /** Signatures are accepted by Cloudinary for 1 hour. */
    expiresAt: new Date((timestamp + 3600) * 1000),
    maxFileBytes: MAX_FILE_BYTES,
  };
}

/** A bare public_id (no scheme), as stored in product_images.storage_key. */
export function isPublicId(storageKey: string) {
  return !/^https?:\/\//i.test(storageKey);
}

/** Optimised delivery URL for a public_id. */
export function deliveryUrl(publicId: string, transform = 'f_auto,q_auto') {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${publicId}`;
}

/** Only accept public_ids inside our folder, so admins can't attach arbitrary assets. */
export function isOwnPublicId(publicId: string) {
  return publicId.startsWith(`${ROOT_FOLDER}/`) && /^[\w\-/.]+$/.test(publicId) && !publicId.includes('..');
}

/** Delete an asset. Resolves to Cloudinary's result ("ok" | "not found"). */
export async function destroy(publicId: string): Promise<string> {
  if (!cloudinaryEnabled) throw new Error('Cloudinary is not configured');
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: API_KEY!,
    signature: sign({ public_id: publicId, timestamp }),
  });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
    method: 'POST',
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { result?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message || `Cloudinary destroy failed (${res.status})`);
  return json.result ?? 'unknown';
}
