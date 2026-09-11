/**
 * Throttling the ways in.
 *
 * Sign in, signing up, and asking for a password reset are all endpoints where
 * an unlimited number of attempts is the attack. Without a limit, a password is
 * only as good as the time somebody is willing to spend, and PBKDF2 at the
 * platform's iteration ceiling is not much time.
 *
 * Counted in D1 rather than in memory, because a Worker has no memory worth the
 * name: isolates come and go and the next request may land anywhere. A counter
 * in a database is a write per attempt, which is the cost of the check being
 * real rather than advisory.
 *
 * Two keys are counted for every sign in attempt, and either can trip. Counting
 * only the address lets one attacker work through a list of accounts from a
 * pool of addresses. Counting only the account lets anyone lock a customer out
 * of their own product by failing their sign in on purpose, which turns the
 * protection into the attack. Counting both means a spread out attack still
 * trips the account limit and a single victim is never locked out by it: the
 * address limit catches the attacker first, and the account limit is generous
 * enough that a real person fumbling their password never reaches it.
 */

export interface Limit {
  /** Attempts allowed inside the window. */
  max: number;
  windowSeconds: number;
}

/**
 * The limits, which are deliberately different from each other.
 *
 * Sign in by address is tight, because an address making twenty failed attempts
 * in ten minutes is not a person who forgot. By account it is looser, so
 * somebody genuinely guessing at their own password has room.
 *
 * Password reset is limited hardest. Each request sends mail to an address the
 * requester has not proved they own, so an unlimited endpoint is a way to use
 * this product to post somebody else's inbox.
 */
export const LIMITS = {
  signinByIp: { max: 20, windowSeconds: 600 },
  signinByAccount: { max: 10, windowSeconds: 900 },
  signupByIp: { max: 5, windowSeconds: 3600 },
  resetByIp: { max: 5, windowSeconds: 3600 },
  resetByAccount: { max: 3, windowSeconds: 3600 },
} as const satisfies Record<string, Limit>;

export interface RateEnv { DB: D1Database; }

export interface Verdict {
  allowed: boolean;
  /** How many remain before the limit trips. */
  remaining: number;
  /** Seconds until the window rolls over, for the message and the header. */
  retryAfter: number;
}

/**
 * A fixed window rather than a sliding one.
 *
 * A sliding window is fairer and costs a row per attempt to keep. A fixed
 * window costs one row per key and lets through at most twice the limit across
 * a boundary, which for a login throttle is a rounding error against the
 * hundreds of thousands an unthrottled endpoint allows.
 */
export async function hit(
  env: RateEnv, key: string, limit: Limit, now: Date = new Date(),
): Promise<Verdict> {
  const nowMs = now.getTime();
  const windowMs = limit.windowSeconds * 1000;

  const row = await env.DB.prepare(
    'SELECT count, window_start FROM rate_limits WHERE key = ?',
  ).bind(key).first<{ count: number; window_start: number }>();

  const fresh = !row || nowMs - row.window_start >= windowMs;
  const start = fresh ? nowMs : row.window_start;
  const count = (fresh ? 0 : row.count) + 1;

  await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET count = excluded.count,
       window_start = excluded.window_start`,
  ).bind(key, count, start).run();

  const retryAfter = Math.max(1, Math.ceil((start + windowMs - nowMs) / 1000));
  return {
    allowed: count <= limit.max,
    remaining: Math.max(0, limit.max - count),
    retryAfter,
  };
}

/**
 * Forgets the attempts against a key.
 *
 * Called on a successful sign in, so that somebody who mistypes their password
 * nine times and then gets it right is not left one attempt from a lockout for
 * the next quarter of an hour.
 */
export async function clear(env: RateEnv, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}

/**
 * The address a request came from.
 *
 * CF-Connecting-IP is set by Cloudflare itself and cannot be spoofed by the
 * client, unlike X-Forwarded-For, which anybody can put anything in. Falling
 * back to a constant rather than to a header means a missing value throttles
 * everybody together instead of handing out a free pass to whoever omits it.
 */
export function addressOf(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/** Keeps the table from growing without bound. Windows are an hour at most. */
export async function prune(env: RateEnv, now: Date = new Date()): Promise<number> {
  const cutoff = now.getTime() - 24 * 3600 * 1000;
  const result = await env.DB.prepare(
    'DELETE FROM rate_limits WHERE window_start < ?',
  ).bind(cutoff).run();
  return result.meta?.changes ?? 0;
}

/** Plain words for somebody who has just been stopped. */
export function waitMessage(retryAfter: number): string {
  if (retryAfter <= 90) return 'Try again in a minute.';
  const minutes = Math.ceil(retryAfter / 60);
  return `Try again in ${minutes} minutes.`;
}
