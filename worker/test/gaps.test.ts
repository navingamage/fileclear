import { describe, expect, it } from 'vitest';
import { blankProfile, type CompanyProfile } from '../src/rules/profile';
import { OBLIGATIONS } from '../src/rules/obligations';
import { filingsFor, addBusinessDays } from '../src/rules/engine';
import { isBusinessDay } from '../src/rules/businessdays';

/**
 * The obligations that were reachable through the set-up form and produced
 * nothing.
 *
 * Every one of these was a profile a customer could enter, answered with an
 * empty space on the calendar. That is the worst shape for this product to be
 * wrong in: a missing deadline reads as nothing owing, and nothing about a
 * blank month announces that a rule was never written.
 *
 * The test that used to sit beside the first year work is the warning here. It
 * asserted that a newly incorporated federal corporation owed nothing in its
 * first two months, which felt obviously true and was wrong, because the
 * absence of a filing FileClear did not know about had been written down as
 * correct behaviour.
 */

function profile(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return { ...blankProfile(), legalName: 'Test Co', incorporationDate: '2024-03-15', ...over };
}

const due = (p: CompanyProfile, year: number, id: string) =>
  filingsFor(p, year).filter((f) => f.obligationId === id).map((f) => f.due);

describe('a monthly HST filer', () => {
  const monthly = profile({
    hst: { registered: true, period: 'monthly', method: 'regular', lastYearNetTax: 0 },
  });

  /** There was no rule for `monthly` at all, so this list was empty. */
  it('has twelve returns rather than none', () => {
    expect(due(monthly, 2026, 'hst-monthly')).toHaveLength(12);
  });

  it('files one month after each period, on the month end', () => {
    const dates = due(monthly, 2026, 'hst-monthly');
    expect(dates[0]).toBe('2026-02-28');   // January, due end of February
    expect(dates[1]).toBe('2026-03-31');
    expect(dates[11]).toBe('2027-01-31');  // December, due end of January
  });

  it('does not also produce the annual or quarterly return', () => {
    expect(due(monthly, 2026, 'hst-annual')).toEqual([]);
    expect(due(monthly, 2026, 'hst-quarterly')).toEqual([]);
  });
});

describe('a quarterly payroll remitter', () => {
  /**
   * The bug: quarterly payroll was being counted back from the fiscal year end
   * like an HST quarter. CRA's payroll accounts run on the calendar, so a
   * corporation with a June year end was shown four remittance dates in the
   * wrong months, every year, with no sign anything was off.
   */
  const juneYearEnd = profile({
    fiscalYearEnd: { month: 6, day: 30 },
    payroll: { hasAccount: true, remitter: 'quarterly', ontarioRemuneration: 0 },
  });

  it('remits on the calendar quarters whatever the year end is', () => {
    expect(due(juneYearEnd, 2026, 'payroll-remittance-quarterly'))
      .toEqual(['2026-04-15', '2026-07-15', '2026-10-15', '2027-01-15']);
  });

  it('gives a December year end the same four dates', () => {
    const dec = profile({
      payroll: { hasAccount: true, remitter: 'quarterly', ontarioRemuneration: 0 },
    });
    expect(due(dec, 2026, 'payroll-remittance-quarterly'))
      .toEqual(due(juneYearEnd, 2026, 'payroll-remittance-quarterly'));
  });
});

describe('the accelerated remitters', () => {
  it('gives threshold 1 twenty four dates a year', () => {
    const p = profile({
      payroll: { hasAccount: true, remitter: 'accelerated1', ontarioRemuneration: 0 },
    });
    const dates = due(p, 2026, 'payroll-remittance-accelerated1');
    expect(dates).toHaveLength(24);
    expect(dates).toContain('2026-01-25');  // first half of January
    expect(dates).toContain('2026-02-10');  // second half of January
    expect(dates).toContain('2027-01-10');  // second half of December
  });

  it('gives threshold 2 forty eight, three working days after each close', () => {
    const p = profile({
      payroll: { hasAccount: true, remitter: 'accelerated2', ontarioRemuneration: 0 },
    });
    const dates = due(p, 2026, 'payroll-remittance-accelerated2');
    expect(dates).toHaveLength(48);
    for (const d of dates) expect(isBusinessDay(d)).toBe(true);
  });

  /** Working days, not calendar days, which is CRA's own wording. */
  it('counts working days over a weekend', () => {
    // 7 August 2026 is a Friday. Three working days later is Wednesday the 12th.
    expect(addBusinessDays('2026-08-07', 3)).toBe('2026-08-12');
    // 21 December 2026 is a Monday, and Christmas week is three days short.
    expect(isBusinessDay(addBusinessDays('2026-12-21', 3))).toBe(true);
  });

  it('shows no remittance at all for an employer with no payroll account', () => {
    const p = profile({
      payroll: { hasAccount: false, remitter: 'accelerated1', ontarioRemuneration: 0 },
    });
    expect(due(p, 2026, 'payroll-remittance-accelerated1')).toEqual([]);
  });
});

describe('corporate tax instalments', () => {
  /**
   * Quarterly is a concession an eligible CCPC earns, not the default. Every
   * corporation was being shown four dates, which understated a general rate
   * corporation's obligation by eight.
   */
  it('gives a non-CCPC twelve, on the last day of each month', () => {
    const p = profile({ isCCPC: false, claimsSmallBusinessDeduction: false,
      lastYearTaxPayable: 40_000 });
    const dates = due(p, 2026, 't2-instalments-monthly');
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-01-31');
    expect(dates[1]).toBe('2026-02-28');
    expect(due(p, 2026, 't2-instalments')).toEqual([]);
  });

  it('gives an eligible CCPC four', () => {
    const p = profile({ lastYearTaxPayable: 40_000 });
    expect(due(p, 2026, 't2-instalments')).toHaveLength(4);
    expect(due(p, 2026, 't2-instalments-monthly')).toEqual([]);
  });

  /**
   * A CCPC whose business limit has been used up by associated corporations is
   * not claiming the deduction, so it loses the quarterly concession along with
   * the extra month to pay.
   */
  it('puts a CCPC not claiming the deduction back on monthly', () => {
    const p = profile({ claimsSmallBusinessDeduction: false, lastYearTaxPayable: 40_000 });
    expect(due(p, 2026, 't2-instalments-monthly')).toHaveLength(12);
  });

  it('asks nobody under $3,000 for an instalment', () => {
    const p = profile({ isCCPC: false, claimsSmallBusinessDeduction: false,
      lastYearTaxPayable: 2_000 });
    expect(due(p, 2026, 't2-instalments-monthly')).toEqual([]);
    expect(due(p, 2026, 't2-instalments')).toEqual([]);
  });

  it('exempts the first tax year on both schedules', () => {
    const p = profile({ isCCPC: false, claimsSmallBusinessDeduction: false,
      incorporationDate: '2026-01-10', lastYearTaxPayable: 40_000 });
    expect(due(p, 2026, 't2-instalments-monthly')).toEqual([]);
  });
});

describe('annual returns outside Ontario and the federal registry', () => {
  it('files a BC annual report two months after the anniversary', () => {
    const p = profile({ jurisdiction: 'BC', incorporationDate: '2024-03-15' });
    expect(due(p, 2026, 'annual-return-bc')).toEqual(['2026-05-15']);
  });

  it('files an Alberta annual return by the end of the following month', () => {
    const p = profile({ jurisdiction: 'AB', incorporationDate: '2024-03-15' });
    expect(due(p, 2026, 'annual-return-ab')).toEqual(['2026-04-30']);
  });

  it('rolls an Alberta December anniversary into January', () => {
    const p = profile({ jurisdiction: 'AB', incorporationDate: '2024-12-02' });
    expect(due(p, 2026, 'annual-return-ab')).toEqual(['2027-01-31']);
  });

  it('asks for none of them in the year of incorporation', () => {
    const bc = profile({ jurisdiction: 'BC', incorporationDate: '2026-03-15' });
    expect(due(bc, 2026, 'annual-return-bc')).toEqual([]);
    const ab = profile({ jurisdiction: 'AB', incorporationDate: '2026-03-15' });
    expect(due(ab, 2026, 'annual-return-ab')).toEqual([]);
  });

  it('keeps each jurisdiction to exactly one annual return', () => {
    const ids = ['annual-return-on', 'annual-return-federal', 'annual-return-bc',
      'annual-return-ab'];
    for (const j of ['ON', 'CBCA', 'BC', 'AB'] as const) {
      const p = profile({ jurisdiction: j });
      const found = ids.filter((id) => due(p, 2026, id).length > 0);
      expect(found).toHaveLength(1);
    }
  });
});

describe('the provinces CRA does not collect for', () => {
  /**
   * src/rules/provinces.ts already knew Alberta and Quebec assess their own
   * corporate tax. The calendar did not, so a corporation operating in Calgary
   * saw a complete set of federal deadlines and no sign of the return Alberta
   * was waiting for.
   */
  it('asks an Alberta establishment for an AT1', () => {
    const p = profile({ permanentEstablishments: ['ON', 'AB'] });
    expect(due(p, 2026, 'at1-alberta')).toEqual(['2027-06-30']);
  });

  it('asks a Quebec establishment for a CO-17', () => {
    const p = profile({ permanentEstablishments: ['QC'] });
    expect(due(p, 2026, 'co17-quebec')).toEqual(['2027-06-30']);
  });

  it('turns on where the corporation operates, not where it was incorporated', () => {
    // A federal corporation with an Alberta office owes the AT1.
    const federal = profile({ jurisdiction: 'CBCA', permanentEstablishments: ['AB'] });
    expect(due(federal, 2026, 'at1-alberta')).toHaveLength(1);
    // An Alberta corporation operating only in Ontario does not.
    const elsewhere = profile({ jurisdiction: 'AB', permanentEstablishments: ['ON'] });
    expect(due(elsewhere, 2026, 'at1-alberta')).toEqual([]);
  });
});

describe('the rule set as a whole', () => {
  it('has no duplicate ids', () => {
    const ids = OBLIGATIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every obligation a source link', () => {
    for (const o of OBLIGATIONS) {
      expect(o.link.url).toMatch(/^https:\/\//);
      expect(o.link.label.length).toBeGreaterThan(0);
    }
  });

  /**
   * Every value the set-up form can produce has to reach at least one rule.
   * This is the check that would have caught the monthly HST filer and both
   * accelerated remitters before a customer did.
   */
  it('answers every HST period with a return', () => {
    for (const period of ['annual', 'quarterly', 'monthly'] as const) {
      const p = profile({ hst: { registered: true, period, method: 'regular', lastYearNetTax: 0 } });
      const hst = filingsFor(p, 2026).filter((f) => f.form === 'GST34');
      expect(hst.length, `no HST return for a ${period} filer`).toBeGreaterThan(0);
    }
  });

  it('answers every remitter type with a remittance', () => {
    for (const remitter of ['quarterly', 'regular', 'accelerated1', 'accelerated2'] as const) {
      const p = profile({ payroll: { hasAccount: true, remitter, ontarioRemuneration: 0 } });
      const pd7a = filingsFor(p, 2026).filter((f) => f.form === 'PD7A');
      expect(pd7a.length, `no remittance for a ${remitter} remitter`).toBeGreaterThan(0);
    }
  });
});
