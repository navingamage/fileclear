import { describe, expect, it } from 'vitest';
import { LATE_AFTER_HOURS, readiness, type SweepRow } from '../src/health';

const NOW = new Date('2026-09-21T12:00:00Z');

function run(over: Partial<SweepRow> = {}): SweepRow {
  return {
    ran_at: '2026-09-21 11:00:00',
    for_date: '2026-09-21',
    companies: 4, emailed: 4, filings: 9, failed: 0, first_failure: null,
    ...over,
  };
}

describe('a healthy morning', () => {
  it('is ok, and says what it did', () => {
    const state = readiness(run(), run(), NOW, true);
    expect(state.ok).toBe(true);
    expect(state.lines.join('\n')).toContain('4/4 companies emailed, 9 filings');
  });
});

describe('the failure this exists for', () => {
  // ZeptoMail's credits expired and every send answered 429. The sweep handled
  // it correctly by not recording the reminders, and said so only in a log.
  it('goes red when the last run could not send, and carries the reason', () => {
    const failed = run({
      emailed: 0, failed: 4,
      first_failure: 'c-1: 429 {"error":{"code":"TM_5001"}}',
    });
    const state = readiness(failed, null, NOW, true);
    expect(state.ok).toBe(false);
    expect(state.lines.join('\n')).toContain('4 sends failed');
    expect(state.lines.join('\n')).toContain('TM_5001');
  });

  it('goes red when the mailer is not configured at all', () => {
    expect(readiness(run(), run(), NOW, false).ok).toBe(false);
  });
});

describe('the sweep itself', () => {
  it('goes red when nothing has run', () => {
    const state = readiness(null, null, NOW, true);
    expect(state.ok).toBe(false);
    expect(state.lines.join('\n')).toContain('no run recorded');
  });

  it('goes red when the last run is late', () => {
    const stale = run({ ran_at: '2026-09-20 05:00:00' }); // 31 hours
    expect(readiness(stale, stale, NOW, true).ok).toBe(false);
    expect(readiness(stale, stale, NOW, true).lines.join('\n')).toContain('(late)');
  });

  it('allows a day plus slack before calling a run late', () => {
    const justInside = new Date(NOW.getTime() - (LATE_AFTER_HOURS - 1) * 3600_000);
    const row = run({ ran_at: justInside.toISOString().slice(0, 19).replace('T', ' ') });
    expect(readiness(row, row, NOW, true).ok).toBe(true);
  });
});

describe('what a quiet day does and does not prove', () => {
  // A run with nothing due sends nothing and fails nothing. Reading that as
  // healthy is the whole mistake.
  it('stays ok on a quiet day but refuses to call it proof', () => {
    const quiet = run({ companies: 4, emailed: 0, filings: 0, failed: 0 });
    const state = readiness(quiet, null, NOW, true);
    expect(state.ok).toBe(true);
    expect(state.lines.join('\n')).toContain('never successfully sent, so nothing here proves it can');
  });

  it('names when mail last actually went out, when it has', () => {
    const state = readiness(run({ emailed: 0, filings: 0 }), run({ ran_at: '2026-09-14 11:00:00' }), NOW, true);
    expect(state.lines.join('\n')).toContain('last actually sent 2026-09-14 11:00:00');
  });
});
