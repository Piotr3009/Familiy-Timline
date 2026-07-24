/**
 * Invitation tokens: 256-bit random, base64url encoded. Only the
 * SHA-256 hash is stored in the database — the raw token exists solely
 * inside the invite link. Uses Web Crypto (works in Node and Edge).
 */

export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Tokens are 43 base64url chars; reject anything else before hashing. */
export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,50}$/.test(token);
}
