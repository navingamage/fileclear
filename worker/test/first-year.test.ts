import { describe, expect, it } from 'vitest';
import { filingsFor, filingsBetween } from '../src/rules/engine';
import { blankProfile, type CompanyProfile } from '../src/rules/profile';

/**
 * The reported case, exactly as it was entered.
 *
 * Federally incorporated on 11 August 2026, quarterly HST, and a 31 July year
 * end chosen when the GST/HST account was opened. Two things were wrong on the
 * calendar it produced, and both came from treating the year of incorporation
 * as a year in which obligations had already accrued.
 */
const reported = (): CompanyProfile => ({
  ...blankProfile(),
  legalName: 'Reported Case Inc.',
  jurisdiction: 'CBCA',
  incorporationDate: '2026-08-11',
  fiscalYearEnd: { month: 7, day: 31 },
  hst: { registered: true, period: 'quarterly', method: 'regular', lastYearNetTax: 0 },
});

const dueDates = (id: string, p = reported()) =>
  [2026, 2027, 2028].flatMap((y) => filingsFor(p, y))
    .filter((f) => f.obligationId === id)
    .map((f) => f.due)
    .sort();

describe('the year a corporation was incorporated in', () => {
  /**
   * Corporations Canada: "you do not file for the year the corporation was
   * incorporated", and "if you file the annual return before the anniversary
   * date, it will not be accepted". The calendar was asking for a filing the
   * registry would have refused.
   */
  it('has no federal annual return in it', () => {
    const dues = dueDates('annual-return-federal');
    expect(dues).not.toContain('2026-10-10');
    expect(dues[0]).toBe('2027-10-10');
  });

  it('puts the first annual return 60 days after the first anniversary', () => {
    // Incorporated 11 August 2026, so the first anniversary is 11 August 2027.
    expect(dueDates('annual-return-federal')[0]).toBe('2027-10-10');
  });

  /**
   * The subtler one. A 31 July year end and an 11 August incorporation fall in
   * the same calendar year, so a check on year numbers passed and the engine
   * produced a T2 for a year that ended eleven days before the corporation
   * existed.
   */
  it('has no T2 for a year end that precedes incorporation', () => {
    const dues = dueDates('t2-return');
    expect(dues).not.toContain('2027-01-31');   // six months after 2026-07-31
    expect(dues[0]).toBe('2028-01-31');         // six months after 2027-07-31
  });

  it('has no tax balance owing for that year either', () => {
    const balances = [...dueDates('t2-balance-ccpc'), ...dueDates('t2-balance-general')];
    expect(balances).not.toContain('2026-10-31');   // three months after 2026-07-31
  });

  /** The HST quarters were already right, and must stay right. */
  it('keeps the HST quarters that closed after incorporation', () => {
    const dues = dueDates('hst-quarterly');
    expect(dues).toContain('2026-11-30');   // quarter ended 2026-10-31
    expect(dues).toContain('2027-02-28');
    expect(dues).toContain('2027-05-31');
    expect(dues).toContain('2027-08-31');
  });

  it('drops the HST quarters that closed before it', () => {
    // FY2026's quarters all ended on or before 2026-07-31.
    expect(dueDates('hst-quarterly')).not.toContain('2026-08-31');
  });

  it('shows nothing at all in the first two months', () => {
    // Between incorporating and the first quarter end there is genuinely
    // nothing to do, and saying so is more useful than inventing something.
    const early = filingsBetween(reported(), '2026-08-11', '2026-10-31');
    expect(early).toEqual([]);
  });
});

describe('the same rules for a calendar year corporation', () => {
  const december = (): CompanyProfile => ({
    ...reported(),
    fiscalYearEnd: { month: 12, day: 31 },
  });

  it('keeps the first year end, which falls after incorporation', () => {
    // Incorporated August 2026 with a December year end: 2026-12-31 is a real
    // first year end, so its T2 is due six months later.
    expect(dueDates('t2-return', december())).toContain('2027-06-30');
  });

  it('still has no annual return in the incorporation year', () => {
    expect(dueDates('annual-return-federal', december())[0]).toBe('2027-10-10');
  });
});

describe('a provincial corporation is unaffected', () => {
  const ontario = (): CompanyProfile => ({
    ...reported(),
    jurisdiction: 'ON',
  });

  it('files its annual return on the fiscal year, not the anniversary', () => {
    expect(dueDates('annual-return-federal', ontario())).toEqual([]);
    expect(dueDates('annual-return-on', ontario()).length).toBeGreaterThan(0);
  });

  it('and still skips the year end that precedes incorporation', () => {
    expect(dueDates('annual-return-on', ontario())).not.toContain('2026-12-31');
  });
});
