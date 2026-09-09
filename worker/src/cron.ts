import { filingsBetween, addDays, daysBetween } from './rules/engine';
import { rowToProfile, type CompanyRow } from './db';
import { send, reminderMail, type MailEnv, type ReminderItem } from './email';

/**
 * The daily sweep.
 *
 * This is the part of FileClear that earns the subscription. A calendar you
 * have to remember to open is a calendar you have already failed to use, so the
 * product reaches out before a window closes rather than waiting to be visited.
 *
 * Nothing is stored about what is due. Filings are recomputed from each
 * company's profile on every run, which means a rule correction is live for
 * everybody the next morning rather than only for companies created after it.
 */

export interface CronEnv extends MailEnv {
  DB: D1Database;
}

export interface SweepResult {
  companies: number;
  emailed: number;
  filings: number;
  skipped: string[];
}

/**
 * Ontario's clock, as a calendar date.
 *
 * Cloudflare crons fire in UTC and Ontario changes offset twice a year, so the
 * Worker is scheduled at both candidate hours and returns immediately unless
 * the local hour is the one we want. That is 12:00 UTC through the winter and
 * 11:00 through the summer, with no configuration change in March or November.
 */
export function torontoNow(at = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** The hour, local to Toronto, that reminders go out. */
export const SEND_HOUR = 7;

export async function sweep(env: CronEnv, todayIso: string): Promise<SweepResult> {
  const result: SweepResult = { companies: 0, emailed: 0, filings: 0, skipped: [] };

  const companies = await env.DB.prepare(
    `SELECT c.*, a.email AS owner_email
       FROM companies c JOIN accounts a ON a.id = c.account_id
      WHERE c.remind_email = 1`,
  ).all<CompanyRow & { owner_email: string; remind_lead_days: number }>();

  for (const row of companies.results ?? []) {
    result.companies++;

    const provinces = await env.DB.prepare(
      'SELECT jurisdiction FROM company_provinces WHERE company_id = ?',
    ).bind(row.id).all<{ jurisdiction: string }>();
    const profile = rowToProfile(row, (provinces.results ?? []).map((p) => p.jurisdiction));

    const lead = Math.max(1, Math.min(90, row.remind_lead_days || 14));
    // Overdue items are included, because the reminder that matters most is the
    // one about a date that has already gone.
    const window = filingsBetween(profile, addDays(todayIso, -30), addDays(todayIso, lead));

    const already = await env.DB.prepare(
      'SELECT filing_id FROM reminders_sent WHERE company_id = ?',
    ).bind(row.id).all<{ filing_id: string }>();
    const sentIds = new Set((already.results ?? []).map((r) => r.filing_id));

    const done = await env.DB.prepare(
      "SELECT filing_id FROM filing_states WHERE company_id = ? AND state = 'done'",
    ).bind(row.id).all<{ filing_id: string }>();
    const doneIds = new Set((done.results ?? []).map((r) => r.filing_id));

    // Filtered once. Deriving the display items and the ids to record from two
    // separate passes over the same predicate is how they drift apart.
    const pending = window
      .filter((f) => !sentIds.has(f.id) && !doneIds.has(f.id))
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));

    if (!pending.length) continue;

    const due: ReminderItem[] = pending.map((f) => ({
      title: f.title, form: f.form, due: f.due,
      daysAway: daysBetween(todayIso, f.due),
      authority: f.authority, penalty: f.penalty,
    }));

    const origin = env.FC_PUBLIC_ORIGIN ?? 'https://fileclear.ca';
    const mail = reminderMail(profile.legalName || 'Your corporation', due, origin);
    const outcome = await send(env, { to: row.owner_email, ...mail });

    if (!outcome.sent) {
      // Not recorded as sent, so it goes out on the next run once whatever was
      // wrong is fixed, rather than being silently skipped forever.
      result.skipped.push(`${row.id}: ${outcome.reason}`);
      continue;
    }

    const stmt = env.DB.prepare(
      'INSERT OR IGNORE INTO reminders_sent (company_id, filing_id) VALUES (?, ?)');
    await env.DB.batch(pending.map((f) => stmt.bind(row.id, f.id)));

    result.emailed++;
    result.filings += pending.length;
  }

  return result;
}
