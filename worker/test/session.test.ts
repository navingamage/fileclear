import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from this file, so the test passes from the repo root and from
// worker/, which is where CI runs it.
const SCHEMA = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE, accountForRequest, createSession } from '../src/auth';

/** The real schema in Node's SQLite, with just the D1 calls auth.ts makes. */
function db(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(SCHEMA, 'utf8'));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (raw.prepare(sql).get(...(args as never[])) as object | undefined) ?? null,
    run: async () => { raw.prepare(sql).run(...(args as never[])); return { meta: {} }; },
  });
  return { d1: { prepare: (sql: string) => stmt(sql) } as unknown as D1Database, raw };
}

const request = (id: string) => new Request('https://fileclear.ca/', { headers: { Cookie: `${SESSION_COOKIE}=${id}` } });

describe('sessions', () => {
  it('lets a fresh session in', async () => {
    const { d1, raw } = db();
    raw.prepare("INSERT INTO accounts (id, email, password) VALUES ('a1', 'a@example.com', 'x')").run();
    const id = await createSession(d1, 'a1');
    expect(await accountForRequest(d1, request(id))).toEqual({ id: 'a1', email: 'a@example.com' });
  });

  // It used to be compared with datetime('now'), whose format differs from
  // the ISO string stored, and an expired session stayed valid until midnight.
  it('refuses a session an hour past its expiry, on the same day', async () => {
    const { d1, raw } = db();
    raw.prepare("INSERT INTO accounts (id, email, password) VALUES ('a1', 'a@example.com', 'x')").run();
    const expired = new Date(Date.now() - 3600_000).toISOString();
    raw.prepare("INSERT INTO sessions (id, account_id, expires_at) VALUES ('abc123', 'a1', ?)").run(expired);
    expect(await accountForRequest(d1, request('abc123'))).toBeNull();
  });
});
