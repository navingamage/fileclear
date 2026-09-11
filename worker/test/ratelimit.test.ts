import { describe, expect, it } from 'vitest';
import { hit, clear, addressOf, prune, waitMessage, LIMITS } from '../src/ratelimit';

/** Enough of D1 to count, with no database. */
function fakeDb() {
  const rows = new Map<string, { count: number; window_start: number }>();
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) { bound = args; return stmt; },
        async first<T>(): Promise<T | null> {
          if (sql.includes('SELECT count')) return (rows.get(String(bound[0])) ?? null) as T;
          return null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO rate_limits')) {
            rows.set(String(bound[0]),
              { count: Number(bound[1]), window_start: Number(bound[2]) });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('DELETE FROM rate_limits WHERE key')) {
            return { meta: { changes: rows.delete(String(bound[0])) ? 1 : 0 } };
          }
          if (sql.startsWith('DELETE FROM rate_limits WHERE window_start')) {
            let n = 0;
            for (const [k, v] of [...rows]) {
              if (v.window_start < Number(bound[0])) { rows.delete(k); n++; }
            }
            return { meta: { changes: n } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  };
  return { env: { DB: db as unknown as D1Database }, rows };
}

const LIMIT = { max: 3, windowSeconds: 600 };
const at = (seconds: number) => new Date(1_700_000_000_000 + seconds * 1000);

describe('counting attempts', () => {
  it('allows up to the limit and refuses after it', async () => {
    const { env } = fakeDb();
    const verdicts = [];
    for (let i = 0; i < 5; i++) verdicts.push(await hit(env, 'k', LIMIT, at(i)));
    expect(verdicts.map((v) => v.allowed)).toEqual([true, true, true, false, false]);
  });

  it('counts down what is left', async () => {
    const { env } = fakeDb();
    expect((await hit(env, 'k', LIMIT, at(0))).remaining).toBe(2);
    expect((await hit(env, 'k', LIMIT, at(1))).remaining).toBe(1);
    expect((await hit(env, 'k', LIMIT, at(2))).remaining).toBe(0);
    expect((await hit(env, 'k', LIMIT, at(3))).remaining).toBe(0);
  });

  it('keeps separate keys separate', async () => {
    const { env } = fakeDb();
    for (let i = 0; i < 4; i++) await hit(env, 'a', LIMIT, at(i));
    expect((await hit(env, 'b', LIMIT, at(5))).allowed).toBe(true);
  });

  it('starts again once the window has passed', async () => {
    const { env } = fakeDb();
    for (let i = 0; i < 4; i++) await hit(env, 'k', LIMIT, at(i));
    expect((await hit(env, 'k', LIMIT, at(100))).allowed).toBe(false);
    expect((await hit(env, 'k', LIMIT, at(601))).allowed).toBe(true);
  });

  it('reports how long until the window rolls over', async () => {
    const { env } = fakeDb();
    await hit(env, 'k', LIMIT, at(0));
    expect((await hit(env, 'k', LIMIT, at(60))).retryAfter).toBe(540);
  });

  /**
   * Somebody who mistypes their password nine times and then gets it right must
   * not be left one attempt from a lockout for the next quarter of an hour.
   */
  it('forgets the count once the attempt succeeds', async () => {
    const { env } = fakeDb();
    for (let i = 0; i < 3; i++) await hit(env, 'k', LIMIT, at(i));
    await clear(env, 'k');
    expect((await hit(env, 'k', LIMIT, at(4))).allowed).toBe(true);
  });
});

describe('the limits themselves', () => {
  /**
   * Counting only the account would let anybody lock a customer out of their
   * own product by failing their sign in on purpose. The account limit is
   * therefore looser than the address limit, so the attacker trips the address
   * one first and a real person fumbling never reaches either.
   */
  it('is tighter on the address than on the account', async () => {
    expect(LIMITS.signinByIp.max).toBeGreaterThan(LIMITS.signinByAccount.max);
  });

  it('leaves a real person enough room to fumble', () => {
    expect(LIMITS.signinByAccount.max).toBeGreaterThanOrEqual(10);
  });

  it('is hardest on password reset, which sends mail to an unproven address', () => {
    expect(LIMITS.resetByAccount.max).toBeLessThan(LIMITS.signinByAccount.max);
    expect(LIMITS.resetByIp.max).toBeLessThan(LIMITS.signinByIp.max);
  });

  it('gives every limit a real window', () => {
    for (const [name, l] of Object.entries(LIMITS)) {
      expect(l.max, name).toBeGreaterThan(0);
      expect(l.windowSeconds, name).toBeGreaterThanOrEqual(600);
    }
  });
});

describe('which address a request came from', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://fileclear.ca/signin', { headers });

  it('uses the header Cloudflare sets', () => {
    expect(addressOf(req({ 'CF-Connecting-IP': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  /**
   * X-Forwarded-For is client controlled. Trusting it would let an attacker
   * hand out a fresh identity to themselves on every request, which is the
   * throttle switched off.
   */
  it('ignores a forwarded header the client can write', () => {
    expect(addressOf(req({ 'X-Forwarded-For': '1.2.3.4' }))).toBe('unknown');
  });

  it('falls back to one shared bucket rather than to a free pass', () => {
    // Everybody unknown is throttled together. The alternative, a unique key
    // per unidentified request, is no limit at all.
    expect(addressOf(req({}))).toBe('unknown');
    expect(addressOf(req({}))).toBe(addressOf(req({})));
  });
});

describe('housekeeping', () => {
  it('removes rows older than a day and keeps the rest', async () => {
    const { env, rows } = fakeDb();
    await hit(env, 'old', LIMIT, at(0));
    await hit(env, 'new', LIMIT, at(23 * 3600));
    const removed = await prune(env, at(24 * 3600 + 60));
    expect(removed).toBe(1);
    expect(rows.has('new')).toBe(true);
    expect(rows.has('old')).toBe(false);
  });
});

describe('what the person is told', () => {
  it('says a minute rather than seconds', () => {
    expect(waitMessage(30)).toBe('Try again in a minute.');
    expect(waitMessage(90)).toBe('Try again in a minute.');
  });

  it('rounds up to whole minutes', () => {
    expect(waitMessage(300)).toBe('Try again in 5 minutes.');
    expect(waitMessage(301)).toBe('Try again in 6 minutes.');
  });
});
