import { describe, expect, it } from 'vitest';
import { torontoNow, SEND_HOUR, sweep, type CronEnv } from '../src/cron';
import { reminderMail, formatDue, send } from '../src/email';

/**
 * The sweep is the part of the product that reaches out rather than waiting to
 * be visited, so its failure mode is silence. These tests are mostly about the
 * ways it could quietly send nothing, or send the same thing twice.
 */

describe('the Toronto clock', () => {
  /**
   * Cloudflare fires crons in UTC and Ontario changes offset twice a year, so
   * both candidate hours are scheduled and the wrong one has to return. This
   * is what makes that safe without editing the config in March and November.
   */
  it('resolves 12:00 UTC to 07:00 in winter', () => {
    const w = torontoNow(new Date('2026-01-15T12:00:00Z'));
    expect(w.hour).toBe(SEND_HOUR);
    expect(w.date).toBe('2026-01-15');
  });

  it('resolves 11:00 UTC to 07:00 in summer', () => {
    const s = torontoNow(new Date('2026-07-15T11:00:00Z'));
    expect(s.hour).toBe(SEND_HOUR);
    expect(s.date).toBe('2026-07-15');
  });

  it('makes the other hour a no-op in each season', () => {
    expect(torontoNow(new Date('2026-01-15T11:00:00Z')).hour).not.toBe(SEND_HOUR);
    expect(torontoNow(new Date('2026-07-15T12:00:00Z')).hour).not.toBe(SEND_HOUR);
  });

  it('gives the local date, not the UTC one, late in the evening', () => {
    // 03:00 UTC on the 2nd is still the 1st in Toronto.
    expect(torontoNow(new Date('2026-06-02T03:00:00Z')).date).toBe('2026-06-01');
  });
});

describe('the reminder itself', () => {
  const items = [
    { title: 'HST return and payment', form: 'GST34', due: '2026-03-31',
      daysAway: 5, authority: 'CRA', penalty: 'A penalty on the balance, plus interest.' },
    { title: 'Corporate income tax return', form: 'T2', due: '2026-06-30',
      daysAway: 96, authority: 'CRA', penalty: '5% of the unpaid tax.' },
  ];

  it('names the nearest deadline in the subject rather than counting them', () => {
    const one = reminderMail('Antipode Technologies Inc.', [items[0]!], 'https://fileclear.ca');
    expect(one.subject).toBe('HST return and payment in 5 days');
    const many = reminderMail('Antipode Technologies Inc.', items, 'https://fileclear.ca');
    expect(many.subject).toBe('HST return and payment in 5 days, and 1 more');
  });

  it('says overdue rather than a negative number of days', () => {
    const late = reminderMail('X Inc.', [{ ...items[0]!, daysAway: -3 }], 'https://fileclear.ca');
    expect(late.subject).toContain('3 days overdue');
  });

  it('handles today and tomorrow as words', () => {
    expect(reminderMail('X', [{ ...items[0]!, daysAway: 0 }], 'h').subject).toContain('due today');
    expect(reminderMail('X', [{ ...items[0]!, daysAway: 1 }], 'h').subject).toContain('due tomorrow');
  });

  it('carries the company, the form, the penalty and a way back', () => {
    const m = reminderMail('Antipode Technologies Inc.', items, 'https://fileclear.ca');
    for (const body of [m.text, m.html]) {
      expect(body).toContain('Antipode Technologies Inc.');
      expect(body).toContain('GST34');
      expect(body).toContain('https://fileclear.ca/dashboard');
    }
    expect(m.text).toContain('5% of the unpaid tax.');
  });

  it('escapes a company name that contains markup', () => {
    const m = reminderMail('<script>alert(1)</script> Inc.', items, 'https://fileclear.ca');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('writes a date a person would read', () => {
    expect(formatDue('2026-03-31')).toBe('31 March 2026');
    expect(formatDue('2026-12-01')).toBe('1 December 2026');
  });
});

describe('sending refuses rather than throwing', () => {
  /**
   * A scheduled sweep that throws on a missing secret takes every other
   * company's reminder down with it, so an unconfigured mailer is a reported
   * no-op and the run continues.
   */
  it('reports a missing token instead of raising', async () => {
    const r = await send({}, { to: 'a@b.co', subject: 's', text: 't', html: '<p>t</p>' });
    expect(r.sent).toBe(false);
    expect(r.reason).toMatch(/ZEPTOMAIL_TOKEN/);
  });

  it('reports a missing sender', async () => {
    const r = await send({ ZEPTOMAIL_TOKEN: 'x' },
      { to: 'a@b.co', subject: 's', text: 't', html: '<p>t</p>' });
    expect(r.sent).toBe(false);
    expect(r.reason).toMatch(/FC_MAIL_FROM/);
  });

  it('refuses an address that is not one', async () => {
    const r = await send({ ZEPTOMAIL_TOKEN: 'x', FC_MAIL_FROM: 'a@b.co' },
      { to: 'not-an-address', subject: 's', text: 't', html: '<p>t</p>' });
    expect(r.sent).toBe(false);
  });
});

describe('the envelope', () => {
  /** Captures the request the mailer would make, without making it. */
  async function request(env: Record<string, string>): Promise<{ url: string; body: Record<string, any> }> {
    const real = globalThis.fetch;
    let url = '', body = '';
    globalThis.fetch = (async (u: string, init: RequestInit) => {
      url = String(u);
      body = String(init.body);
      return new Response('{}', { status: 201 });
    }) as unknown as typeof fetch;
    try {
      await send(env, { to: 'a@b.co', subject: 's', text: 't', html: '<p>t</p>' });
    } finally {
      globalThis.fetch = real;
    }
    return { url, body: JSON.parse(body) };
  }

  const payload = async (env: Record<string, string>) => (await request(env)).body;

  /**
   * ZeptoMail keeps its data centres separate and a token only works in the one
   * that issued it. Antipode's account is Canadian, and the .com endpoint
   * answers a Canadian token with "Invalid API Token found", which looks like a
   * bad secret. Nothing at runtime would have caught it: an unsendable reminder
   * is recorded as skipped and quietly retried the next day.
   */
  it('posts to the Canadian data centre', async () => {
    const { url } = await request({ ZEPTOMAIL_TOKEN: 'x', FC_MAIL_FROM: 'a@b.co' });
    expect(url).toBe('https://api.zeptomail.ca/v1.1/email');
  });

  it('splits a name off the sender', async () => {
    const p = await payload({ ZEPTOMAIL_TOKEN: 'x', FC_MAIL_FROM: 'FileClear <no-reply@fileclear.ca>' });
    expect(p.from).toEqual({ address: 'no-reply@fileclear.ca', name: 'FileClear' });
  });

  it('takes a bare sender as an address', async () => {
    const p = await payload({ ZEPTOMAIL_TOKEN: 'x', FC_MAIL_FROM: 'no-reply@fileclear.ca' });
    expect(p.from.address).toBe('no-reply@fileclear.ca');
    expect(p.from.name).toBe('FileClear');
  });

  /**
   * fileclear.ca has no MX records, so a reply to the sending address is lost.
   * The reply has to be aimed at a mailbox that exists.
   */
  it('points replies at the configured mailbox', async () => {
    const p = await payload({
      ZEPTOMAIL_TOKEN: 'x',
      FC_MAIL_FROM: 'FileClear <no-reply@fileclear.ca>',
      FC_MAIL_REPLY_TO: 'FileClear <hello@antipodetech.com>',
    });
    expect(p.reply_to).toEqual([{ address: 'hello@antipodetech.com', name: 'FileClear' }]);
  });

  it('omits reply_to rather than sending an empty one', async () => {
    const p = await payload({ ZEPTOMAIL_TOKEN: 'x', FC_MAIL_FROM: 'no-reply@fileclear.ca' });
    expect('reply_to' in p).toBe(false);
  });
});

// ---------------------------------------------------------------- the sweep

/** Enough of D1 to run the sweep without a database. */
function fakeDb(rows: Record<string, unknown[]>): D1Database {
  const answer = (sql: string) => {
    if (sql.includes('FROM companies')) return rows.companies ?? [];
    if (sql.includes('company_provinces')) return rows.provinces ?? [];
    if (sql.includes('reminders_sent')) return rows.sent ?? [];
    if (sql.includes('filing_states')) return rows.done ?? [];
    return [];
  };
  const batched: unknown[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({ all: async () => ({ results: answer(sql) }), run: async () => ({}) }),
      all: async () => ({ results: answer(sql) }),
      run: async () => ({}),
    }),
    batch: async (stmts: unknown[]) => { batched.push(...stmts); return []; },
    _batched: batched,
  };
  return db as unknown as D1Database;
}

const company = {
  id: 'c1', account_id: 'a1', owner_email: 'owner@example.com',
  legal_name: 'Antipode Technologies Inc.', jurisdiction: 'ON',
  incorporation_date: '2024-03-15', fye_month: 12, fye_day: 31,
  is_ccpc: 1, claims_sbd: 1, gross_revenue: 150000, last_year_tax_payable: 0,
  hst_registered: 1, hst_period: 'annual', hst_method: 'regular', hst_last_year_net_tax: 0,
  payroll_account: 0, payroll_remitter: 'regular', payroll_on_remuneration: 0,
  pays_dividends: 0, is_construction: 0, remind_lead_days: 30,
};

describe('the sweep', () => {
  const env = (rows: Record<string, unknown[]>): CronEnv =>
    ({ DB: fakeDb(rows) } as CronEnv);

  it('finds what is due and reports that it could not send', async () => {
    // No mail secrets, which is exactly the state this deploy is in.
    const r = await sweep(env({ companies: [company] }), '2027-03-20');
    expect(r.companies).toBe(1);
    expect(r.emailed).toBe(0);
    expect(r.skipped[0]).toMatch(/ZEPTOMAIL_TOKEN/);
  });

  it('sends nothing when there is nothing inside the lead window', async () => {
    // Nothing is due in the days after 1 August for this company.
    const r = await sweep(env({ companies: [{ ...company, remind_lead_days: 3 }] }), '2027-08-01');
    expect(r.emailed).toBe(0);
    expect(r.skipped).toEqual([]);
  });

  it('skips a company that turned reminders off, by never selecting it', async () => {
    // remind_email = 0 is filtered in SQL, so the sweep sees no rows at all.
    const r = await sweep(env({ companies: [] }), '2027-03-20');
    expect(r.companies).toBe(0);
  });

  it('does not warn again about a filing already warned about', async () => {
    const all = await sweep(env({ companies: [company] }), '2027-03-20');
    expect(all.skipped).toHaveLength(1);

    // Pretend every filing in range was already sent.
    const ids = ['t2-balance-ccpc|FY2026|2027-03-31', 'hst-annual|FY2026|2027-03-31'];
    const r = await sweep(env({
      companies: [company], sent: ids.map((filing_id) => ({ filing_id })),
    }), '2027-03-20');
    expect(r.skipped).toEqual([]);
    expect(r.emailed).toBe(0);
  });

  it('does not warn about a filing already ticked off', async () => {
    const ids = ['t2-balance-ccpc|FY2026|2027-03-31', 'hst-annual|FY2026|2027-03-31'];
    const r = await sweep(env({
      companies: [company], done: ids.map((filing_id) => ({ filing_id })),
    }), '2027-03-20');
    expect(r.emailed).toBe(0);
    expect(r.skipped).toEqual([]);
  });
});
