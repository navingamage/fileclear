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
  /** Where the rate watch reports. See src/watch.ts. */
  FC_WATCH_TO?: string;
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

type CompanyForSweep = CompanyRow & { owner_email: string; remind_lead_days: number };

const COMPANY_SQL = `SELECT c.*, a.email AS owner_email
       FROM companies c JOIN accounts a ON a.id = c.account_id
      WHERE c.remind_email = 1`;

export async function sweep(env: CronEnv, todayIso: string): Promise<SweepResult> {
  const result: SweepResult = { companies: 0, emailed: 0, filings: 0, skipped: [] };

  const companies = await env.DB.prepare(COMPANY_SQL).all<CompanyForSweep>();

  for (const row of companies.results ?? []) {
    result.companies++;
    addOutcome(result, row.id, await remindRow(env, row, todayIso));
  }

  return result;
}

/** What one company's turn did: nothing due, mail sent, or mail refused. */
export type Outcome =
  | { kind: 'quiet' }
  | { kind: 'sent'; filings: number }
  | { kind: 'failed'; reason: string };

export function addOutcome(result: SweepResult, companyId: string, o: Outcome): void {
  if (o.kind === 'sent') { result.emailed++; result.filings += o.filings; }
  if (o.kind === 'failed') result.skipped.push(`${companyId}: ${o.reason}`);
}

/**
 * One company, by id, for the queue. A company deleted, or switched to no
 * reminders, between the cron and the message is simply quiet.
 */
export async function remindCompany(env: CronEnv, companyId: string, todayIso: string): Promise<Outcome> {
  const row = await env.DB.prepare(`${COMPANY_SQL} AND c.id = ?`).bind(companyId).first<CompanyForSweep>();
  return row ? remindRow(env, row, todayIso) : { kind: 'quiet' };
}

async function remindRow(env: CronEnv, row: CompanyForSweep, todayIso: string): Promise<Outcome> {
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
    .sort((a, b) => (a.effectiveDue < b.effectiveDue ? -1
      : a.effectiveDue > b.effectiveDue ? 1 : 0));

  if (!pending.length) return { kind: 'quiet' };

  const due: ReminderItem[] = pending.map((f) => ({
    // The date in the mail is the one somebody has to act on, not the
    // statutory one. Telling a director a payment is due on a Sunday is
    // either a lost weekend or a day of unnecessary worry.
    title: f.title, form: f.form, due: f.effectiveDue,
    daysAway: daysBetween(todayIso, f.effectiveDue),
    authority: f.authority, penalty: f.penalty,
  }));

  const origin = env.FC_PUBLIC_ORIGIN ?? 'https://fileclear.ca';
  const mail = reminderMail(profile.legalName || 'Your corporation', due, origin);
  const outcome = await send(env, { to: row.owner_email, ...mail });

  // Not recorded as sent, so it goes out on the next run once whatever was
  // wrong is fixed, rather than being silently skipped forever.
  if (!outcome.sent) return { kind: 'failed', reason: outcome.reason ?? 'unknown' };

  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO reminders_sent (company_id, filing_id) VALUES (?, ?)');
  await env.DB.batch(pending.map((f) => stmt.bind(row.id, f.id)));
  return { kind: 'sent', filings: pending.length };
}

// ------------------------------------------------------------- off the queue

/**
 * One company's reminder, as a queue message.
 *
 * The Workers Free plan allows fifty outside requests in an invocation and
 * every reminder email is one, so a sweep that sent from the cron alone would
 * have the fifty-first company's mail refused by the platform, and every one
 * after it, every morning. Off the queue each batch of REMIND_BATCH companies
 * runs in an invocation of its own. `runId` is the sweep_runs row the batch
 * adds its counts to, so /readyz still reads one row per morning.
 */
export interface RemindMessage {
  companyId: string;
  forDate: string;
  runId: number;
}

/** Companies per queue batch, and so emails per invocation. Matches wrangler.toml. */
export const REMIND_BATCH = 40;

/**
 * The morning's run, handed to the queue: the row that the batches will fill
 * in, then one message per company.
 */
export async function enqueueSweep(
  env: CronEnv, queue: Queue<RemindMessage>, todayIso: string,
): Promise<{ companies: number; runId: number }> {
  const { results } = await env.DB.prepare(
    'SELECT c.id FROM companies c JOIN accounts a ON a.id = c.account_id WHERE c.remind_email = 1',
  ).all<{ id: string }>();
  const ids = (results ?? []).map((r) => r.id);
  const run = await env.DB.prepare(
    `INSERT INTO sweep_runs (for_date, companies, emailed, filings, failed)
     VALUES (?1, ?2, 0, 0, 0) RETURNING id`,
  ).bind(todayIso, ids.length).first<{ id: number }>();
  const runId = run!.id;
  // The same ninety days recordSweep keeps.
  await env.DB.prepare("DELETE FROM sweep_runs WHERE ran_at < datetime('now', '-90 days')").run();
  // A hundred messages a call, so a thousand companies is ten calls.
  for (let i = 0; i < ids.length; i += 100) {
    await queue.sendBatch(ids.slice(i, i + 100).map((companyId) => ({
      body: { companyId, forDate: todayIso, runId },
    })));
  }
  return { companies: ids.length, runId };
}

/**
 * A batch of companies off the queue.
 *
 * A send that fails is counted and acknowledged, not retried: the reminder is
 * left unrecorded and tomorrow's run sends it, which is how the inline sweep
 * always behaved. Only an error, a database that did not answer, is retried,
 * and a message on its last attempt is counted as a failure rather than lost,
 * so /readyz shows it.
 */
export async function remindBatch(env: CronEnv, batch: MessageBatch<RemindMessage>, maxAttempts = 3): Promise<void> {
  const byRun = new Map<number, SweepResult>();
  for (const message of batch.messages) {
    const { companyId, forDate, runId } = message.body;
    const result = byRun.get(runId) ?? { companies: 0, emailed: 0, filings: 0, skipped: [] };
    byRun.set(runId, result);
    try {
      addOutcome(result, companyId, await remindCompany(env, companyId, forDate));
      message.ack();
    } catch (err) {
      if (message.attempts >= maxAttempts) {
        result.skipped.push(`${companyId}: ${err instanceof Error ? err.message : String(err)}`);
        message.ack();
      } else {
        message.retry();
      }
    }
  }
  for (const [runId, r] of byRun) {
    await env.DB.prepare(
      `UPDATE sweep_runs SET emailed = emailed + ?2, filings = filings + ?3, failed = failed + ?4,
         first_failure = COALESCE(first_failure, ?5) WHERE id = ?1`,
    ).bind(runId, r.emailed, r.filings, r.skipped.length, r.skipped[0] ?? null).run();
  }
}

/**
 * Write down what the run did.
 *
 * Separate from sweep() so the sweep stays a pure-ish function over the
 * database it already reads, and so a failure to record cannot take the
 * sending with it. Called by the scheduled handler.
 *
 * Old rows are dropped: this answers "is it working now", and a table that
 * only ever grows to answer that is a slow leak. Ninety days is long enough
 * to see a pattern in a gap.
 */
export async function recordSweep(
  env: CronEnv,
  forDate: string,
  result: SweepResult,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO sweep_runs (for_date, companies, emailed, filings, failed, first_failure)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(
    forDate, result.companies, result.emailed, result.filings,
    result.skipped.length, result.skipped[0] ?? null,
  ).run();

  await env.DB.prepare(
    "DELETE FROM sweep_runs WHERE ran_at < datetime('now', '-90 days')",
  ).run();
}
