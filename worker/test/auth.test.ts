import { describe, expect, it } from 'vitest';
import {
  hashPassword, verifyPassword, randomId, looksLikeEmail, passwordProblem,
  sessionCookie, clearedCookie,
} from '../src/auth';

describe('password hashing', () => {
  it('round trips', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery stapl', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('salts, so two identical passwords do not collide in storage', async () => {
    const a = await hashPassword('the same password');
    const b = await hashPassword('the same password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('the same password', a)).toBe(true);
    expect(await verifyPassword('the same password', b)).toBe(true);
  });

  /**
   * Workers caps PBKDF2 at 100,000 iterations and throws above it, which is how
   * the first deploy of signup returned a 500. The cost lives in the stored
   * string so it can be raised if the cap ever lifts.
   */
  it('stores the cost, and stays inside the Workers limit', async () => {
    const stored = await hashPassword('anything at all');
    const [iterations, salt, hash] = stored.split(':');
    expect(Number(iterations)).toBeLessThanOrEqual(100_000);
    expect(Number(iterations)).toBeGreaterThanOrEqual(100_000);
    expect(salt).toBeTruthy();
    expect(hash).toBeTruthy();
  });

  it('verifies against whatever cost the hash was made with', async () => {
    // A hash written before the cost changed still has to open.
    const stored = await hashPassword('portable');
    const [, salt, hash] = stored.split(':');
    expect(await verifyPassword('portable', `100000:${salt}:${hash}`)).toBe(true);
  });

  it('refuses malformed or absurdly cheap stored values', async () => {
    for (const bad of ['', 'nonsense', 'a:b', '1:2:3:4', '10:salt:hash']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });
});

describe('identifiers', () => {
  it('are hex, the right length, and not repeated', () => {
    const ids = new Set(Array.from({ length: 200 }, () => randomId(16)));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('input rules', () => {
  it('accepts ordinary addresses and rejects obvious rubbish', () => {
    for (const good of ['a@b.co', 'navin+fc@antipodetech.com', 'x.y@sub.example.ca']) {
      expect(looksLikeEmail(good)).toBe(true);
    }
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'a@@b.com', 'a@b.']) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });

  it('asks only for length in a password', () => {
    expect(passwordProblem('short')).toMatch(/10 characters/);
    expect(passwordProblem('exactly10!')).toBeNull();
    expect(passwordProblem('a'.repeat(201))).toMatch(/200/);
    // No composition rule: a long passphrase of plain words is fine.
    expect(passwordProblem('correct horse battery staple')).toBeNull();
  });
});

describe('session cookie', () => {
  it('is locked down', () => {
    const c = sessionCookie('abc123');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
  });

  it('clears by expiring immediately, with the same flags', () => {
    const c = clearedCookie();
    expect(c).toContain('Max-Age=0');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
  });
});
