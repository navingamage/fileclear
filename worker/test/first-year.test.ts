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

  /**
   * This assertion used to read "shows nothing at all", and it was wrong in the
   * same direction as the bug it was written alongside. A newly incorporated
   * federal corporation operating in Ontario does owe something in its first
   * two months: it has to register with the province. FileClear did not know
   * that, so the absence looked correct and got written down as a test.
   */
  it('shows only the Ontario registration in the first two months', () => {
    const early = filingsBetween(reported(), '2026-08-11', '2026-10-31');
    expect(early.map((f) => f.obligationId)).toEqual(['initial-return-on']);
    expect(early[0]!.due).toBe('2026-10-10');
  });

  it('has no tax or HST filing that early', () => {
    const early = filingsBetween(reported(), '2026-08-11', '2026-10-31');
    expect(early.some((f) => ['t2-return', 'hst-quarterly', 'annual-return-federal']
      .includes(f.obligationId))).toBe(false);
  });
});

/**
 * A federal corporation is not automatically registered in the province it
 * operates from, and nothing later in the calendar reminds anybody: there is no
 * fee and no annual return behind it, so it happens once, early, or not at all.
 */
describe('registering a federal corporation in Ontario', () => {
  it('is due 60 days after incorporation', () => {
    expect(dueDates('initial-return-on')).toEqual(['2026-10-10']);
  });

  it('happens once and never repeats', () => {
    const across = [2026, 2027, 2028, 2029]
      .flatMap((y) => filingsFor(reported(), y))
      .filter((f) => f.obligationId === 'initial-return-on');
    expect(across).toHaveLength(1);
  });

  it('does not apply to a corporation already incorporated in Ontario', () => {
    const ontario: CompanyProfile = { ...reported(), jurisdiction: 'ON' };
    expect(dueDates('initial-return-on', ontario)).toEqual([]);
  });

  it('does not apply without an Ontario establishment', () => {
    const elsewhere: CompanyProfile = {
      ...reported(), permanentEstablishments: ['BC'],
    };
    expect(dueDates('initial-return-on', elsewhere)).toEqual([]);
  });

  /** The clock runs from carrying on business, which FileClear says plainly. */
  it('says the 60 days are counted from incorporation, and when that is wrong', () => {
    const f = filingsFor(reported(), 2026)
      .find((x) => x.obligationId === 'initial-return-on')!;
    expect(f.detail).toMatch(/counts the 60 days from incorporation/);
    expect(f.detail).toMatch(/began trading in Ontario later/);
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
