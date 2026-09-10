import { describe, expect, it } from 'vitest';
import { schedule1, computeTax, BUSINESS_LIMIT, INSTALMENT_THRESHOLD } from '../src/rules/t2';
import { fiscalYears, statementsFor } from '../src/rules/yearend';
import { schedule8, type AssetRecord } from '../src/rules/cca';
import { blankProfile, type CompanyProfile } from '../src/rules/profile';
import { ACCOUNT_BY_ID } from '../src/rules/gifi';
import type { LedgerLine } from '../src/rules/hst';

const isCurrent = (id: string): boolean => ACCOUNT_BY_ID.get(id)?.current !== false;

const profile = (over: Partial<CompanyProfile> = {}): CompanyProfile => ({
  ...blankProfile(), legalName: 'Test Inc.', incorporationDate: '2024-01-01', ...over,
});

const line = (
  accountId: string, amount: number, hst = 0, date = '2026-06-01',
): LedgerLine => ({ date, accountId, amount, hst, counterAccountId: 'bank' });

const EMPTY_S8 = schedule8([], []);

/** FY2026 for a calendar year corporation. */
function setup(ledger: LedgerLine[], p = profile(), assets: AssetRecord[] = []) {
  const years = fiscalYears(p, '2027-06-01');
  const year = years.find((y) => y.to === '2026-12-31')!;
  const chrono = [...years].reverse().filter((y) => y.to <= year.to);
  const s8 = assets.length ? schedule8(assets, chrono) : EMPTY_S8;
  const statements = statementsFor(ledger, year, isCurrent);
  const s1 = schedule1(statements, ledger, year, s8);
  return { year, s8, s1, tax: computeTax(p, year, s1, ledger) };
}

describe('schedule 1, books to taxable income', () => {
  it('adds back the half of a meal that is not deductible', () => {
    const { s1 } = setup([line('sales', 100_000), line('meals', 10_000, 1_300)]);
    const add = s1.additions.find((a) => a.label.includes('meals'))!;
    expect(add.amount).toBe(5_000);
    expect(add.ref).toBe('S1 line 121');
    expect(s1.netIncomeForTax).toBe(90_000 + 5_000);
  });

  it('deducts capital cost allowance, which is nowhere in the books', () => {
    const assets: AssetRecord[] = [{
      id: 'a', classNumber: 50, description: 'Laptop',
      availableForUse: '2026-03-01', costCents: 300_000,
    }];
    const { s1, s8 } = setup([line('sales', 1_000_000), line('equipment', 300_000, 39_000)],
      profile(), assets);
    expect(s8.totalCca).toBe(165_000);
    const ded = s1.deductions.find((d) => d.label.includes('Capital cost'))!;
    expect(ded.amount).toBe(165_000);
    expect(ded.ref).toBe('S1 line 403');
    // The laptop never touched the income statement, so books income is the
    // full million and the deduction exists only on the return.
    expect(s1.netIncomePerBooks).toBe(1_000_000);
    expect(s1.netIncomeForTax).toBe(1_000_000 - 165_000);
  });

  it('says nothing when there is nothing to reconcile', () => {
    const { s1 } = setup([line('sales', 100_000), line('rent', 10_000)]);
    expect(s1.additions).toEqual([]);
    expect(s1.deductions).toEqual([]);
    expect(s1.netIncomeForTax).toBe(s1.netIncomePerBooks);
  });
});

describe('the tax', () => {
  it('charges 12.2% in Ontario under the business limit', () => {
    const { tax } = setup([line('sales', 10_000_000)]);   // $100,000
    expect(tax.taxableIncome).toBe(10_000_000);
    expect(tax.sbdIncome).toBe(10_000_000);
    expect(tax.federalTax).toBe(900_000);      // 9%
    expect(tax.ontarioTax).toBe(320_000);      // 3.2%
    expect(tax.totalTax).toBe(1_220_000);
    expect(tax.effectiveRate).toBeCloseTo(0.122, 4);
  });

  it('charges the general rate above the business limit', () => {
    const { tax } = setup([line('sales', 60_000_000)]);   // $600,000
    expect(tax.sbdIncome).toBe(BUSINESS_LIMIT);
    expect(tax.generalIncome).toBe(10_000_000);
    // 500,000 at 12.2% plus 100,000 at 26.5%.
    expect(tax.totalTax).toBe(6_100_000 + 2_650_000);
  });

  it('gives no small business deduction to a corporation that is not a CCPC', () => {
    const { tax } = setup([line('sales', 10_000_000)], profile({ isCCPC: false }));
    expect(tax.sbdIncome).toBe(0);
    expect(tax.totalTax).toBe(Math.round(10_000_000 * 0.265));
    expect(tax.notes.join(' ')).toMatch(/not a CCPC/i);
  });

  it('gives none to a CCPC whose limit is used up elsewhere', () => {
    const { tax } = setup([line('sales', 10_000_000)],
      profile({ claimsSmallBusinessDeduction: false }));
    expect(tax.sbdIncome).toBe(0);
    expect(tax.notes.join(' ')).toMatch(/associated corporations/i);
  });

  /**
   * The grind that catches people out. Investments held inside a corporation
   * cost it the small business rate on its operating income, which is a
   * connection almost nobody makes until the assessment arrives.
   */
  it('grinds the business limit down with passive income', () => {
    const { tax } = setup([
      line('sales', 60_000_000),           // $600,000 of active income
      line('interest-income', 6_000_000),  // $60,000, ten thousand over the threshold
    ]);
    expect(tax.investmentIncome).toBe(6_000_000);
    expect(tax.aaiiGrind).toBe(1_000_000 * 5);            // $50,000 of grind
    expect(tax.sbdIncome).toBe(BUSINESS_LIMIT - 5_000_000);
    expect(tax.generalIncome).toBe(tax.taxableIncome - tax.sbdIncome);
    expect(tax.notes.join(' ')).toMatch(/passive income/i);
  });

  /**
   * The limit is a ceiling, not an entitlement. A corporation earning less than
   * it gets the small business rate on what it actually earned, and the grind
   * is invisible until active income rises past the reduced limit.
   */
  it('is bounded by active income when that is the smaller number', () => {
    const { tax } = setup([
      line('sales', 40_000_000),           // $400,000, under the ground down limit
      line('interest-income', 6_000_000),
    ]);
    expect(tax.aaiiGrind).toBe(5_000_000);
    expect(tax.sbdIncome).toBe(40_000_000);
  });

  it('leaves the limit alone below the passive income threshold', () => {
    const { tax } = setup([
      line('sales', 40_000_000), line('interest-income', 4_000_000),
    ]);
    expect(tax.aaiiGrind).toBe(0);
  });

  it('prorates the limit for a short first year', () => {
    // Incorporated in October with a December year end: 92 days.
    const p = profile({ incorporationDate: '2026-10-01' });
    const years = fiscalYears(p, '2027-06-01');
    const year = years.find((y) => y.to === '2026-12-31')!;
    const ledger = [line('sales', 60_000_000, 0, '2026-11-01')];
    const statements = statementsFor(ledger, year, isCurrent);
    const s1 = schedule1(statements, ledger, year, EMPTY_S8);
    const tax = computeTax(p, year, s1, ledger);
    expect(tax.proratedLimit).toBe(Math.round(BUSINESS_LIMIT * (92 / 365)));
    expect(tax.proratedLimit).toBeLessThan(BUSINESS_LIMIT);
    expect(tax.notes.join(' ')).toMatch(/prorated/i);
  });

  it('taxes nothing on a loss, and does not go negative', () => {
    const { tax } = setup([line('sales', 100_000), line('rent', 500_000)]);
    expect(tax.taxableIncome).toBe(0);
    expect(tax.totalTax).toBe(0);
    expect(tax.effectiveRate).toBe(0);
  });
});

describe('instalments', () => {
  it('are required once tax payable passes three thousand dollars', () => {
    const { tax } = setup([line('sales', 10_000_000)]);
    expect(tax.totalTax).toBeGreaterThan(INSTALMENT_THRESHOLD);
    expect(tax.instalmentsRequired).toBe(true);
    expect(tax.instalmentBase).toBe(tax.totalTax);
  });

  it('are not required below it', () => {
    const { tax } = setup([line('sales', 1_000_000), line('rent', 900_000)]);
    expect(tax.totalTax).toBeLessThan(INSTALMENT_THRESHOLD);
    expect(tax.instalmentsRequired).toBe(false);
  });

  /** A corporation in its first tax year never owes instalments. */
  it('are never required in the first year, but are flagged for the next', () => {
    const p = profile({ incorporationDate: '2026-01-01' });
    const years = fiscalYears(p, '2027-06-01');
    const year = years.find((y) => y.to === '2026-12-31')!;
    expect(year.first).toBe(true);
    const ledger = [line('sales', 10_000_000)];
    const s1 = schedule1(statementsFor(ledger, year, isCurrent), ledger, year, EMPTY_S8);
    const tax = computeTax(p, year, s1, ledger);
    expect(tax.instalmentsRequired).toBe(false);
    expect(tax.notes.join(' ')).toMatch(/first tax year/i);
  });
});
