import { describe, expect, it } from 'vitest';
import {
  issueReset, consumeReset, pruneResets, hashToken,
  hashPassword, verifyPassword, RESET_TOKEN_MINUTES,
} from '../src/auth';

/** Enough of D1 to hold accounts, tokens and sessions. */
function fakeDb(accounts: { id: string; email: string; password: string }[]) {
  const resets = new Map<string, { account_id: string; expires_at: string }>();
  const sessions = new Set<string>(['sess-a', 'sess-b']);
  const passwords = new Map(accounts.map((a) => [a.id, a.password]));

  const run = (sql: string, bound: unknown[]) => {
    if (sql.startsWith('DELETE FROM password_resets WHERE account_id')) {
      for (const [k, v] of [...resets]) if (v.account_id === bound[0]) resets.delete(k);
    } else if (sql.startsWith('DELETE FROM password_resets WHERE token_hash')) {
      resets.delete(String(bound[0]));
    } else if (sql.startsWith('DELETE FROM password_resets WHERE expires_at')) {
      for (const [k, v] of [...resets]) {
        if (v.expires_at < String(bound[0])) resets.delete(k);
      }
    } else if (sql.startsWith('INSERT INTO password_resets')) {
      resets.set(String(bound[0]),
        { account_id: String(bound[1]), expires_at: String(bound[2]) });
    } else if (sql.startsWith('UPDATE accounts SET password')) {
      passwords.set(String(bound[1]), String(bound[0]));
    } else if (sql.startsWith('DELETE FROM sessions')) {
      sessions.clear();
    }
    return { meta: { changes: 1 } };
  };

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        _sql: sql,
        get _bound() { return bound; },
        bind(...args: unknown[]) { bound = args; return stmt; },
        async first<T>(): Promise<T | null> {
          if (sql.includes('FROM accounts WHERE lower(email)')) {
            const a = accounts.find(
              (x) => x.email.toLowerCase() === String(bound[0]).toLowerCase());
            return (a ? { id: a.id } : null) as T | null;
          }
          if (sql.includes('FROM password_resets WHERE token_hash')) {
            return (resets.get(String(bound[0])) ?? null) as T | null;
          }
          return null;
        },
        async run() { return run(sql, bound); },
      };
      return stmt;
    },
    async batch(stmts: { _sql: string; _bound: unknown[] }[]) {
      for (const st of stmts) run(st._sql, st._bound);
      return [];
    },
  };
  return { db: db as unknown as D1Database, resets, sessions, passwords };
}

const ACCOUNT = { id: 'acc1', email: 'Director@Example.CA', password: 'old-hash' };
const at = (minutes: number) => new Date(1_700_000_000_000 + minutes * 60_000);

describe('asking for a link', () => {
  it('issues a token for an address that has an account', async () => {
    const { db } = fakeDb([ACCOUNT]);
    const issued = await issueReset(db, 'director@example.ca', at(0));
    expect(issued?.accountId).toBe('acc1');
    expect(issued!.issue.token).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * Answering differently for an address that has no account is a way to find
   * out who banks here, which for a product about somebody's tax affairs is
   * worth not leaking. The caller shows the same page for both.
   */
  it('returns nothing for an address that does not, rather than raising', async () => {
    const { db } = fakeDb([ACCOUNT]);
    expect(await issueReset(db, 'stranger@example.ca', at(0))).toBeNull();
  });

  it('matches the address case insensitively', async () => {
    const { db } = fakeDb([ACCOUNT]);
    expect(await issueReset(db, 'DIRECTOR@EXAMPLE.ca', at(0))).not.toBeNull();
  });

  /** The token itself must never be recoverable from the database. */
  it('stores only the hash of the token', async () => {
    const { db, resets } = fakeDb([ACCOUNT]);
    const issued = await issueReset(db, ACCOUNT.email, at(0));
    const token = issued!.issue.token;
    expect(resets.has(token)).toBe(false);
    expect(resets.has(await hashToken(token))).toBe(true);
  });

  it('replaces the previous token rather than leaving both alive', async () => {
    const { db, resets } = fakeDb([ACCOUNT]);
    const first = await issueReset(db, ACCOUNT.email, at(0));
    const second = await issueReset(db, ACCOUNT.email, at(1));
    expect(resets.size).toBe(1);
    expect((await consumeReset(db, first!.issue.token, 'a-new-password', at(2))).ok).toBe(false);
    expect((await consumeReset(db, second!.issue.token, 'a-new-password', at(2))).ok).toBe(true);
  });

  it('expires in an hour', async () => {
    const { db } = fakeDb([ACCOUNT]);
    const issued = await issueReset(db, ACCOUNT.email, at(0));
    const ttl = new Date(issued!.issue.expiresAt).getTime() - at(0).getTime();
    expect(ttl).toBe(RESET_TOKEN_MINUTES * 60_000);
  });
});

describe('spending a link', () => {
  it('sets the new password', async () => {
    const { db, passwords } = fakeDb([ACCOUNT]);
    const issued = await issueReset(db, ACCOUNT.email, at(0));
    const outcome = await consumeReset(db, issued!.issue.token, 'a-new-password', at(5));
    expect(outcome.ok).toBe(true);
    expect(await verifyPassword('a-new-password', passwords.get('acc1')!)).toBe(true);
    expect(await verifyPassword('old-hash', passwords.get('acc1')!)).toBe(false);
  });

  it('works once and not twice', async () => {
    const { db } = fakeDb([ACCOUNT]);
    const issued = await issueReset(db, ACCOUNT.email, at(0));
    expect((await consumeReset(db, issued!.issue.token, 'a-new-password', at(1))).ok).toBe(true);
    const again = await consumeReset(db, issued!.issue.token, 'another-password', at(2));
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toBe('unknown');
  });

  /**
   * Somebody resetting a password either forgot it or believes it was taken.
   * In the second case, leaving the other session alive defeats the exercise.
   */
  it('ends every other session on the account', async () => {
    const { db, sessions } = fakeDb([ACCOUNT]);
    expect(sessions.size).toBe(2);
    const issued = await issueReset(db, ACCOUNT.email, at(0));
    await consumeReset(db, issued!.issue.token, 'a-new-password', at(1));
    expect(sessions.size).toBe(0);
  });

  it('refuses a token that has expired, and clears it away', async () => {
    const { db, resets } = fakeDb([ACCOUNT]);
    const issued = await issueReset(db, ACCOUNT.email, at(0));
    const outcome = await consumeReset(
      db, issued!.issue.token, 'a-new-password', at(RESET_TOKEN_MINUTES + 1));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('expired');
    expect(resets.size).toBe(0);
  });

  it('refuses a token nobody issued', async () => {
    const { db } = fakeDb([ACCOUNT]);
    const outcome = await consumeReset(db, 'f'.repeat(64), 'a-new-password', at(0));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('unknown');
  });

  it('leaves the password alone when the token is bad', async () => {
    const { db, passwords } = fakeDb([ACCOUNT]);
    await consumeReset(db, 'bad-token', 'a-new-password', at(0));
    expect(passwords.get('acc1')).toBe('old-hash');
  });

  it('hashes the new password rather than storing it', async () => {
    const { db, passwords } = fakeDb([ACCOUNT]);
    const issued = await issueReset(db, ACCOUNT.email, at(0));
    await consumeReset(db, issued!.issue.token, 'a-new-password', at(1));
    const stored = passwords.get('acc1')!;
    expect(stored).not.toContain('a-new-password');
    expect(stored).toMatch(/^100000:/);
  });
});

describe('housekeeping', () => {
  it('clears tokens that have expired', async () => {
    const { db, resets } = fakeDb([ACCOUNT]);
    await issueReset(db, ACCOUNT.email, at(0));
    await pruneResets(db, at(RESET_TOKEN_MINUTES + 5));
    expect(resets.size).toBe(0);
  });

  it('leaves a live token alone', async () => {
    const { db, resets } = fakeDb([ACCOUNT]);
    await issueReset(db, ACCOUNT.email, at(0));
    await pruneResets(db, at(10));
    expect(resets.size).toBe(1);
  });
});

describe('the password hash itself', () => {
  it('differs for the same password, so two accounts do not look alike', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });
});
