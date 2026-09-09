/**
 * Accounts and sessions.
 *
 * PBKDF2-SHA256 through WebCrypto, because it is what Workers gives us without
 * a dependency and it is a real password hash rather than a digest. The cost is
 * stored alongside the hash so it can be raised later without invalidating
 * anybody's password.
 *
 * Sessions are opaque random ids checked against the database on every request
 * rather than signed tokens carrying claims. Signing up front looks cheaper
 * until you want to end a session, and being able to end one matters here: this
 * holds other people's tax records.
 */

/**
 * Workers refuses PBKDF2 above 100,000 iterations:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 *   supported (requested 210000).
 *
 * OWASP currently suggests 600,000 for PBKDF2-SHA256, so this is the platform
 * ceiling rather than a considered choice. The cost is stored with each hash,
 * so raising it later upgrades new passwords without invalidating old ones,
 * and existing hashes keep verifying at whatever they were made with.
 */
const ITERATIONS = 100_000;
const KEY_BITS = 256;
export const SESSION_COOKIE = 'fc_session';
const SESSION_DAYS = 30;

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function randomId(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key, KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, ITERATIONS);
  return `${ITERATIONS}:${b64(salt)}:${b64(hash)}`;
}

/** Constant time, so a wrong password cannot be found a byte at a time. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [iterStr, saltStr, hashStr] = parts as [string, string, string];
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  const expected = unb64(hashStr);
  const actual = await derive(password, unb64(saltStr), iterations);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ actual[i]!;
  return diff === 0;
}

// ------------------------------------------------------------------ sessions

export interface Account { id: string; email: string; }

export async function createSession(db: D1Database, accountId: string): Promise<string> {
  const id = randomId(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await db.prepare('INSERT INTO sessions (id, account_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, accountId, expires).run();
  return id;
}

export async function accountForRequest(db: D1Database, request: Request): Promise<Account | null> {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]+)`));
  if (!match) return null;

  const row = await db.prepare(
    `SELECT a.id AS id, a.email AS email
       FROM sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.id = ? AND s.expires_at > datetime('now')`,
  ).bind(match[1]).first<Account>();
  return row ?? null;
}

export async function endSession(db: D1Database, request: Request): Promise<void> {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]+)`));
  if (match) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(match[1]).run();
}

export function sessionCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ------------------------------------------------------------------ validation

/** Deliberately permissive. The address is checked by sending to it, not by a regex. */
export function looksLikeEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v.trim()) && v.length <= 254;
}

/**
 * Length is the only rule. Composition rules push people toward Passw0rd! and
 * a manager generates something better than any rule would demand.
 */
export function passwordProblem(v: string): string | null {
  if (v.length < 10) return 'Use at least 10 characters.';
  if (v.length > 200) return 'That is longer than 200 characters.';
  return null;
}
