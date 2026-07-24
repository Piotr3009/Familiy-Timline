import {describe, expect, it} from 'vitest';
import {
  generateInviteToken,
  hashInviteToken,
  isPlausibleToken
} from '@/lib/invitations/token';

describe('invitation tokens', () => {
  it('generates url-safe tokens of expected length', () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('generates unique tokens', () => {
    const seen = new Set(Array.from({length: 100}, () => generateInviteToken()));
    expect(seen.size).toBe(100);
  });

  it('hashes deterministically to sha-256 hex', async () => {
    const hash1 = await hashInviteToken('abc');
    const hash2 = await hashInviteToken('abc');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    // Known SHA-256 of "abc"
    expect(hash1).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('accepts generated tokens and rejects junk', () => {
    expect(isPlausibleToken(generateInviteToken())).toBe(true);
    expect(isPlausibleToken('short')).toBe(false);
    expect(isPlausibleToken('a'.repeat(100))).toBe(false);
    expect(isPlausibleToken('token with spaces and $ymbols!!'.padEnd(43, 'x'))).toBe(false);
  });
});
