import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { realDb } from './d1';

/**
 * The Worker driven through its own fetch handler, over the real schema.
 *
 * Most of FileClear's tests are about the rules. These are about the screens,
 * where a bug looks like a lost company rather than a wrong number.
 */

const ORIGIN = 'https://fileclear.ca';
let env: Parameters<typeof worker.fetch>[1];
let raw: ReturnType<typeof realDb>['raw'];
let cookie = '';
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

beforeEach(() => {
  const db = realDb();
  raw = db.raw;
  cookie = '';
  env = {
    DB: db.d1,
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
    FC_PUBLIC_ORIGIN: ORIGIN,
  } as unknown as Parameters<typeof worker.fetch>[1];
});

async function call(path: string, form?: Record<string, string>, auth = true): Promise<Response> {
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, {
    method: form ? 'POST' : 'GET',
    headers: {
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      'CF-Connecting-IP': '203.0.113.7',
    },
    body: form ? new URLSearchParams(form) : undefined,
  }), env, ctx);
  const set = res.headers.get('Set-Cookie');
  if (set) cookie = set.split(';')[0]!;
  return res;
}

async function signUpWithCompany(name: string) {
  await call('/signup', { email: 'owner@example.com', password: 'a-long-enough-password' });
  await call('/onboarding?step=1', { entityType: 'corporation', legalName: name });
  await call('/onboarding?step=2', { jurisdiction: 'ON', incorporationDate: '2024-03-15', fyeMonth: '12', fyeDay: '31' });
}

const companies = () => raw.prepare('SELECT legal_name FROM companies ORDER BY created_at').all()
  .map((r) => (r as { legal_name: string }).legal_name);

describe('adding a second business', () => {
  it('makes a new one and leaves the first, its books included, where it was', async () => {
    await signUpWithCompany('Northwind Analytics Inc.');
    const first = raw.prepare('SELECT id FROM companies').get() as { id: string };
    raw.prepare(`INSERT INTO transactions (id, company_id, txn_date, account_id, amount_cents, hst_cents, description)
      VALUES ('t1', ?, '2026-05-01', 'revenue', 100000, 13000, 'Invoice 1')`).run(first.id);

    const page = await (await call('/onboarding?new=1&step=1')).text();
    expect(page).toContain('action="/onboarding?step=1&amp;new=1"');

    const saved = await call('/onboarding?step=1&new=1', { entityType: 'soleProprietorship', legalName: 'Second Studio' });
    expect(saved.status).toBe(303);
    expect(saved.headers.get('Location')).toBe('/onboarding?step=2');
    expect(companies()).toEqual(['Northwind Analytics Inc.', 'Second Studio']);

    // The later steps edit the new one, which is now the active one.
    await call('/onboarding?step=2', { jurisdiction: 'ON', incorporationDate: '2025-01-01', fyeMonth: '12', fyeDay: '31' });
    expect(companies()).toEqual(['Northwind Analytics Inc.', 'Second Studio']);
    const books = raw.prepare('SELECT company_id FROM transactions').get() as { company_id: string };
    expect(books.company_id).toBe(first.id);
  });

  it('does not offer the new flag past the first step', async () => {
    await signUpWithCompany('Northwind Analytics Inc.');
    const page = await (await call('/onboarding?step=2')).text();
    expect(page).toContain('action="/onboarding?step=2"');
  });
});

describe('every page the Worker renders', () => {
  it('carries the security headers, and no inline script', async () => {
    await signUpWithCompany('Northwind Analytics Inc.');
    const res = await call('/dashboard');
    expect(res.status).toBe(200);
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const html = await res.text();
    expect(html).not.toMatch(/<script>|\son(change|click|load)=/);
    expect(html).toContain('<script src="/app.js" defer></script>');
  });

  it('serves the script the policy allows', async () => {
    const res = await call('/app.js', undefined, false);
    expect(res.headers.get('Content-Type')).toContain('javascript');
    expect(await res.text()).toContain('data-autosubmit');
  });

  it('only redirects the business switcher back to this site', async () => {
    await signUpWithCompany('Northwind Analytics Inc.');
    const id = (raw.prepare('SELECT id FROM companies').get() as { id: string }).id;
    for (const back of ['https://evil.example/', '//evil.example/', '/\\evil.example/']) {
      const res = await call('/companies', { id, back });
      expect(res.headers.get('Location'), back).toBe('/dashboard');
    }
    expect((await call('/companies', { id, back: '/books' })).headers.get('Location')).toBe('/books');
  });
});

describe('the calendar feed', () => {
  it('is off until asked for, then answers without a session, and stops when replaced or turned off', async () => {
    await signUpWithCompany('Northwind Analytics Inc.');
    expect(await (await call('/dashboard')).text()).toContain('Get a calendar address');

    await call('/calendar-feed', { action: 'on' });
    const page = await (await call('/dashboard')).text();
    const path = /https:\/\/fileclear\.ca(\/feed\/[a-f0-9]{48}\.ics)/.exec(page)?.[1] ?? '';
    expect(path).not.toBe('');
    expect(page).toContain('href="webcal://fileclear.ca/feed/');

    const res = await call(path, undefined, false);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    const ics = await res.text();
    expect(ics).toContain('X-WR-CALNAME:Northwind Analytics Inc.: filings');
    expect(ics).toMatch(/SUMMARY:.+\(T2\)/);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);

    await call('/calendar-feed', { action: 'new' });
    expect((await call(path, undefined, false)).status).toBe(404);
    const second = /https:\/\/fileclear\.ca(\/feed\/[a-f0-9]{48}\.ics)/.exec(await (await call('/dashboard')).text())![1]!;
    await call('/calendar-feed', { action: 'off' });
    expect((await call(second, undefined, false)).status).toBe(404);
  });

  it('leaves out a filing that has been ticked off', async () => {
    await signUpWithCompany('Northwind Analytics Inc.');
    await call('/calendar-feed', { action: 'on' });
    const path = /https:\/\/fileclear\.ca(\/feed\/[a-f0-9]{48}\.ics)/.exec(await (await call('/dashboard')).text())![1]!;
    const before = await (await call(path, undefined, false)).text();
    const uid = /UID:(.+?)@fileclear\.ca/.exec(before)![1]!.replace(/\\,/g, ',').replace(/\;/g, ';');
    const company = (raw.prepare('SELECT id FROM companies').get() as { id: string }).id;
    await call('/filing', { company, filing: uid, state: 'done' });
    const after = await (await call(path, undefined, false)).text();
    expect(after).not.toContain(`UID:${/UID:(.+?)@fileclear\.ca/.exec(before)![1]}@`);
    expect(after.split('BEGIN:VEVENT').length).toBe(before.split('BEGIN:VEVENT').length - 1);
  });
});
