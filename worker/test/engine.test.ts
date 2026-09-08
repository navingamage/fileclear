import { describe, expect, it } from 'vitest';
import { blankProfile, type CompanyProfile } from '../src/rules/profile';
import { OBLIGATIONS } from '../src/rules/obligations';
import {
  addMonths, addDays, daysInMonth, filingsFor, filingsBetween, advisoriesFor,
} from '../src/rules/engine';

/**
 * The engine is the product. A wrong date here is worse than no software,
 * because a director who trusts it stops keeping their own list.
 */

function profile(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return { ...blankProfile(), legalName: 'Test Co', incorporationDate: '2024-03-15', ...over };
}

const due = (fs: ReturnType<typeof filingsFor>, id: string) =>
  fs.filter((f) => f.obligationId === id).map((f) => f.due);

describe('date arithmetic', () => {
  it('clamps to the end of a shorter month', () => {
    // A 31 August year end plus six months is not 31 February.
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29'); // leap
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('rolls across year boundaries', () => {
    expect(addMonths('2026-12-31', 6)).toBe('2027-06-30');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('knows February', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  /**
   * Regression. A month end stays a month end rather than keeping its day
   * number: a 30 June year end plus six months is 31 December, not 30 December.
   * The first version of this clamped only downward, which moved every deadline
   * a day early for any corporation whose period ended in a 30 day month, and
   * did it silently.
   */
  it('keeps a month end on the month end', () => {
    expect(addMonths('2026-06-30', 6)).toBe('2026-12-31');
    expect(addMonths('2025-09-30', 1)).toBe('2025-10-31');
    expect(addMonths('2026-04-30', 2)).toBe('2026-06-30');
    // A date that is not a month end keeps its day number.
    expect(addMonths('2026-06-15', 6)).toBe('2026-12-15');
    expect(addMonths('2026-01-01', 1)).toBe('2026-02-01');
  });
});

describe('income tax deadlines', () => {
  it('puts the T2 six months after the year end', () => {
    const fs = filingsFor(profile(), 2026);
    expect(due(fs, 't2-return')).toEqual(['2027-06-30']);
  });

  it('follows a non-calendar year end', () => {
    const fs = filingsFor(profile({ fiscalYearEnd: { month: 6, day: 30 } }), 2026);
    expect(due(fs, 't2-return')).toEqual(['2026-12-31']);
  });

  /**
   * The three month balance belongs only to a CCPC actually claiming the small
   * business deduction. Getting this wrong costs a month of daily compound
   * interest, so both branches are pinned.
   */
  it('gives a CCPC claiming the SBD three months to pay', () => {
    const fs = filingsFor(profile({ isCCPC: true, claimsSmallBusinessDeduction: true }), 2026);
    expect(due(fs, 't2-balance-ccpc')).toEqual(['2027-03-31']);
    expect(due(fs, 't2-balance-general')).toEqual([]);
  });

  it('gives everyone else two months', () => {
    for (const p of [
      profile({ isCCPC: false, claimsSmallBusinessDeduction: false }),
      profile({ isCCPC: true, claimsSmallBusinessDeduction: false }),
    ]) {
      const fs = filingsFor(p, 2026);
      expect(due(fs, 't2-balance-general')).toEqual(['2027-02-28']);
      expect(due(fs, 't2-balance-ccpc')).toEqual([]);
    }
  });

  it('charges no instalments in the first tax year', () => {
    const p = profile({ incorporationDate: '2026-02-01', lastYearTaxPayable: 20_000 });
    expect(due(filingsFor(p, 2026), 't2-instalments')).toEqual([]);
    expect(due(filingsFor(p, 2027), 't2-instalments')).toHaveLength(4);
  });

  it('charges no instalments under the threshold', () => {
    const p = profile({ lastYearTaxPayable: 2_999 });
    expect(due(filingsFor(p, 2027), 't2-instalments')).toEqual([]);
  });
});

describe('annual returns follow the jurisdiction', () => {
  it('sends an Ontario corporation to the provincial registry, on the fiscal year', () => {
    const fs = filingsFor(profile({ jurisdiction: 'ON' }), 2026);
    expect(due(fs, 'annual-return-on')).toEqual(['2027-06-30']);
    expect(due(fs, 'annual-return-federal')).toEqual([]);
  });

  /**
   * The federal return runs off the incorporation anniversary, not the year
   * end. This is the deadline federal corporations miss, because every other
   * date they have hangs off the year end.
   */
  it('runs a federal corporation off its incorporation anniversary', () => {
    const p = profile({ jurisdiction: 'CBCA', incorporationDate: '2024-03-15' });
    const fs = filingsFor(p, 2026);
    expect(due(fs, 'annual-return-federal')).toEqual(['2026-05-14']); // 15 Mar + 60 days
    expect(due(fs, 'annual-return-on')).toEqual([]);
  });

  it('does not move the federal return when the year end moves', () => {
    const a = filingsFor(profile({ jurisdiction: 'CBCA' }), 2026);
    const b = filingsFor(
      profile({ jurisdiction: 'CBCA', fiscalYearEnd: { month: 6, day: 30 } }), 2026);
    expect(due(a, 'annual-return-federal')).toEqual(due(b, 'annual-return-federal'));
  });
});

describe('HST', () => {
  it('gives an annual filer three months, not the individual deadline', () => {
    const fs = filingsFor(profile(), 2026);
    // Not 15 June, which is the deadline for individuals with a December year end.
    expect(due(fs, 'hst-annual')).toEqual(['2027-03-31']);
  });

  it('gives a quarterly filer four dates, counted back from the year end', () => {
    const p = profile({ hst: { ...blankProfile().hst, period: 'quarterly' } });
    expect(due(filingsFor(p, 2026), 'hst-quarterly'))
      .toEqual(['2026-04-30', '2026-07-31', '2026-10-31', '2027-01-31']);
  });

  it('counts quarters back from a non-calendar year end', () => {
    const p = profile({
      fiscalYearEnd: { month: 6, day: 30 },
      hst: { ...blankProfile().hst, period: 'quarterly' },
    });
    expect(due(filingsFor(p, 2026), 'hst-quarterly'))
      .toEqual(['2025-10-31', '2026-01-31', '2026-04-30', '2026-07-31']);
  });

  it('adds instalments once net tax reaches $3,000', () => {
    const under = profile({ hst: { ...blankProfile().hst, lastYearNetTax: 2_999 } });
    const over = profile({ hst: { ...blankProfile().hst, lastYearNetTax: 3_000 } });
    expect(due(filingsFor(under, 2027), 'hst-instalments')).toEqual([]);
    expect(due(filingsFor(over, 2027), 'hst-instalments')).toHaveLength(4);
  });

  it('produces nothing at all when the company is not registered', () => {
    const p = profile({ hst: { ...blankProfile().hst, registered: false } });
    const ids = filingsFor(p, 2026).map((f) => f.obligationId);
    expect(ids.filter((i) => i.startsWith('hst-'))).toEqual([]);
  });
});

describe('payroll and slips', () => {
  it('generates nothing for a corporation that pays only dividends', () => {
    const p = profile({ paysDividends: true });
    const ids = filingsFor(p, 2026).map((f) => f.obligationId);
    expect(ids).toContain('t5-slips');
    expect(ids).not.toContain('t4-slips');
    expect(ids).not.toContain('payroll-remittance-regular');
    expect(ids).not.toContain('eht-annual');
  });

  it('gives a regular remitter twelve dates on the fifteenth', () => {
    const p = profile({ payroll: { hasAccount: true, remitter: 'regular', ontarioRemuneration: 60_000 } });
    const dates = due(filingsFor(p, 2026), 'payroll-remittance-regular');
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-02-15'); // January pay, remitted in February
    expect(dates[11]).toBe('2027-01-15'); // December pay, remitted in January
    expect(dates.every((d) => d.endsWith('-15'))).toBe(true);
  });

  it('gives a quarterly remitter four dates instead', () => {
    const p = profile({ payroll: { hasAccount: true, remitter: 'quarterly', ontarioRemuneration: 60_000 } });
    expect(due(filingsFor(p, 2026), 'payroll-remittance-regular')).toEqual([]);
    expect(due(filingsFor(p, 2026), 'payroll-remittance-quarterly')).toHaveLength(4);
  });

  it('lands slips on the last day of February, leap year included', () => {
    const p = profile({ payroll: { hasAccount: true, remitter: 'regular', ontarioRemuneration: 1 } });
    expect(due(filingsFor(p, 2026), 't4-slips')).toEqual(['2026-02-28']);
    expect(due(filingsFor(p, 2028), 't4-slips')).toEqual(['2028-02-29']);
  });

  it('only charges Ontario EHT where there is an Ontario establishment', () => {
    const payroll = { hasAccount: true, remitter: 'regular' as const, ontarioRemuneration: 60_000 };
    const on = profile({ payroll, permanentEstablishments: ['ON'] });
    const bc = profile({ payroll, permanentEstablishments: ['BC'] });
    expect(due(filingsFor(on, 2026), 'eht-annual')).toEqual(['2026-03-15']);
    expect(due(filingsFor(bc, 2026), 'eht-annual')).toEqual([]);
  });
});

describe('the plan is specific to the company', () => {
  it('gives a dormant Ontario corporation almost nothing to do', () => {
    const p = profile({
      hst: { registered: false, period: 'annual', method: 'regular', lastYearNetTax: 0 },
      payroll: { hasAccount: false, remitter: 'regular', ontarioRemuneration: 0 },
    });
    expect(filingsFor(p, 2026).map((f) => f.obligationId).sort())
      .toEqual(['annual-return-on', 't2-balance-ccpc', 't2-return']);
  });

  it('gives a full operating company a materially longer list', () => {
    const p = profile({
      payroll: { hasAccount: true, remitter: 'regular', ontarioRemuneration: 90_000 },
      paysDividends: true,
      lastYearTaxPayable: 12_000,
      hst: { registered: true, period: 'quarterly', method: 'quick', lastYearNetTax: 8_000 },
    });
    expect(filingsFor(p, 2027).length).toBeGreaterThan(20);
  });

  it('owes nothing for a year before it existed', () => {
    const p = profile({ incorporationDate: '2026-05-01' });
    expect(filingsFor(p, 2025)).toEqual([]);
  });
});

describe('filings are stable and well formed', () => {
  it('gives every filing a unique id', () => {
    const p = profile({
      payroll: { hasAccount: true, remitter: 'regular', ontarioRemuneration: 90_000 },
      paysDividends: true, lastYearTaxPayable: 12_000,
    });
    const ids = filingsFor(p, 2027).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('regenerates identical ids, so a completed filing stays completed', () => {
    const p = profile();
    expect(filingsFor(p, 2026).map((f) => f.id)).toEqual(filingsFor(p, 2026).map((f) => f.id));
  });

  it('returns filings in date order', () => {
    const fs = filingsFor(profile({ lastYearTaxPayable: 9_000 }), 2027);
    expect(fs.map((f) => f.due)).toEqual([...fs.map((f) => f.due)].sort());
  });

  it('starts every filing before it is due', () => {
    for (const f of filingsFor(profile({ lastYearTaxPayable: 9_000 }), 2027)) {
      expect(f.actionableFrom < f.due).toBe(true);
    }
  });

  it('windows filings without dropping or duplicating any', () => {
    const p = profile();
    const window = filingsBetween(p, '2027-01-01', '2027-12-31');
    expect(window.every((f) => f.due >= '2027-01-01' && f.due <= '2027-12-31')).toBe(true);
    expect(new Set(window.map((f) => f.id)).size).toBe(window.length);
    expect(window.map((f) => f.obligationId)).toContain('t2-return');
  });
});

describe('the rule set itself', () => {
  it('has unique ids', () => {
    const ids = OBLIGATIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names an authority and links to it over https', () => {
    for (const o of OBLIGATIONS) {
      expect(o.link.url.startsWith('https://')).toBe(true);
      expect(o.link.label.trim()).not.toBe('');
      expect(o.penalty.trim()).not.toBe('');
      expect(o.leadDays).toBeGreaterThan(0);
    }
  });

  /** The house writing rule: no long dashes in anything that ships. */
  it('carries no em or en dashes in the copy', () => {
    for (const o of OBLIGATIONS) {
      const text = o.title + o.detail + o.penalty;
      expect(text).not.toContain('—');
      expect(text).not.toContain('–');
    }
  });

  it('never leaves a corporation with two conflicting balance dates', () => {
    for (const p of [
      profile({ isCCPC: true, claimsSmallBusinessDeduction: true }),
      profile({ isCCPC: true, claimsSmallBusinessDeduction: false }),
      profile({ isCCPC: false, claimsSmallBusinessDeduction: false }),
    ]) {
      const balances = filingsFor(p, 2026)
        .filter((f) => f.obligationId.startsWith('t2-balance'));
      expect(balances).toHaveLength(1);
    }
  });
});

describe('advisories', () => {
  it('flags the Quick Method to a small regular filer', () => {
    const p = profile({ grossRevenue: 180_000 });
    expect(advisoriesFor(p).map((a) => a.id)).toContain('quick-method-eligible');
  });

  it('does not offer the Quick Method above the threshold', () => {
    const p = profile({ grossRevenue: 500_000 });
    expect(advisoriesFor(p).map((a) => a.id)).not.toContain('quick-method-eligible');
  });

  it('warns an unregistered company past the small supplier threshold', () => {
    const p = profile({
      grossRevenue: 45_000,
      hst: { registered: false, period: 'annual', method: 'regular', lastYearNetTax: 0 },
    });
    expect(advisoriesFor(p).map((a) => a.id)).toContain('hst-registration-required');
  });

  it('says nothing alarming about an ordinary small corporation', () => {
    const p = profile({ grossRevenue: 120_000 });
    expect(advisoriesFor(p).filter((a) => a.severity === 'warn')).toEqual([]);
  });
});
