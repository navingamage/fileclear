/**
 * Whether FileClear is doing its job, as opposed to answering requests.
 *
 * These are different questions and only the second one used to have an
 * answer. The sweep handled a failed send correctly, leaving the reminder
 * unrecorded so it goes out again next time, but it said so only in a
 * console.log. ZeptoMail's credits expired and every send failed for an
 * unknown number of days while every other signal stayed green.
 *
 * So this reports two things that can only be known by having happened: when
 * the sweep last ran, and what happened to the mail when it did. Nothing here
 * is inferred from the absence of an error.
 */

export interface SweepRow {
  ran_at: string;
  for_date: string;
  companies: number;
  emailed: number;
  filings: number;
  failed: number;
  first_failure: string | null;
}

export interface Readiness {
  ok: boolean;
  lines: string[];
}

/**
 * A day plus enough slack that a slow run is not a false alarm.
 *
 * The same twenty six hours the monitor already uses for TradeClear's
 * overnight sweep, so the two products mean the same thing by "late".
 */
export const LATE_AFTER_HOURS = 26;

export function readiness(
  last: SweepRow | null,
  lastSend: SweepRow | null,
  now: Date,
  mailConfigured: boolean,
): Readiness {
  const lines: string[] = [];
  let ok = true;

  if (!mailConfigured) {
    ok = false;
    lines.push('mail: not configured, no reminder can be sent');
  }

  if (!last) {
    // Not treated as fine. On a product that has been live for months, no
    // recorded run means either the sweep is not running or the recording of
    // it is broken, and both of those are the thing this endpoint exists to
    // catch. Immediately after a deploy that added this table it also reads
    // red until the next morning, which is honest rather than convenient.
    ok = false;
    lines.push('sweep: no run recorded');
  } else {
    const hours = (now.getTime() - Date.parse(`${last.ran_at.replace(' ', 'T')}Z`)) / 3600_000;
    const late = hours > LATE_AFTER_HOURS;
    if (late) ok = false;
    lines.push(
      `sweep: ${last.for_date}, ${Math.floor(hours)}h ago${late ? ' (late)' : ''}, `
      + `${last.emailed}/${last.companies} companies emailed, ${last.filings} filings`,
    );

    if (last.failed > 0) {
      ok = false;
      lines.push(`mail: ${last.failed} send${last.failed === 1 ? '' : 's'} failed`
        + (last.first_failure ? `, first was ${last.first_failure}` : ''));
    }
  }

  /**
   * Said out loud rather than counted as health.
   *
   * A run where nothing was due sends nothing and fails nothing, so it proves
   * the sweep ran and proves nothing at all about whether mail works. Reading
   * that as healthy is the mistake this whole file is about. It does not force
   * a red, because a quiet fortnight is normal for a product whose deadlines
   * cluster, but it is never left unsaid.
   */
  lines.push(lastSend
    ? `mail: last actually sent ${lastSend.ran_at}`
    : 'mail: never successfully sent, so nothing here proves it can');

  return { ok, lines };
}

export async function readReadiness(db: D1Database, mailConfigured: boolean, now = new Date()): Promise<Readiness> {
  const last = await db
    .prepare('SELECT * FROM sweep_runs ORDER BY ran_at DESC LIMIT 1')
    .first<SweepRow>();
  const lastSend = await db
    .prepare('SELECT * FROM sweep_runs WHERE emailed > 0 ORDER BY ran_at DESC LIMIT 1')
    .first<SweepRow>();
  return readiness(last ?? null, lastSend ?? null, now, mailConfigured);
}
