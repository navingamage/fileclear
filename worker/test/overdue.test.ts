import { describe, expect, it } from 'vitest';
import { blankProfile, type CompanyProfile } from '../src/rules/profile';
import { visibleFilings } from '../src/rules/engine';

/**
 * The calendar has to keep showing a filing that was missed.
 *
 * It used to fetch from today onwards, so a missed filing vanished the morning
 * after its deadline and the overdue count could only read zero.
 */

const p: CompanyProfile = {
  ...blankProfile(),
  legalName: 'Test Co',
  incorporationDate: '2020-01-15',
  hst: { registered: true, period: 'quarterly', method: 'regular', lastYearNetTax: 0 },
};
const today = '2026-09-25';
const nothingDone = () => false;

describe('a filing that was missed', () => {
  it('stays on the calendar after its deadline', () => {
    const shown = visibleFilings(p, today, '2026-01-01', nothingDone);
    const q2 = shown.find((f) => f.obligationId === 'hst-quarterly' && f.due === '2026-07-31');
    expect(q2, 'the Q2 return, due 31 July and never ticked off').toBeDefined();
    expect(q2!.effectiveDue < today).toBe(true);
  });

  it('goes once it is ticked off', () => {
    const shown = visibleFilings(p, today, '2026-01-01', (id) => id.includes('2026-07-31'));
    expect(shown.find((f) => f.due === '2026-07-31')).toBeUndefined();
  });

  it('still shows everything coming up whether or not it is done', () => {
    const shown = visibleFilings(p, today, '2026-01-01', () => true);
    expect(shown.some((f) => f.effectiveDue >= today)).toBe(true);
    expect(shown.every((f) => f.effectiveDue >= today)).toBe(true);
  });
});

describe('before FileClear was watching', () => {
  /**
   * A business set up today with an old incorporation must not open on years
   * of "overdue" filings that were made somewhere else.
   */
  it('shows nothing that fell due before the business was added', () => {
    const shown = visibleFilings(p, today, today, nothingDone);
    expect(shown.every((f) => f.effectiveDue >= today)).toBe(true);
  });

  it('looks back only as far as the day it was added', () => {
    const shown = visibleFilings(p, today, '2026-06-01', nothingDone);
    const past = shown.filter((f) => f.effectiveDue < today);
    expect(past.length).toBeGreaterThan(0);
    expect(past.every((f) => f.effectiveDue >= '2026-06-01')).toBe(true);
  });

  it('treats a start date in the future as today', () => {
    const shown = visibleFilings(p, today, '2030-01-01', nothingDone);
    expect(shown.every((f) => f.effectiveDue >= today)).toBe(true);
  });
});
