import { describe, expect, it } from 'vitest';
import { fiscalYears, firstYearEnd, statementsFor, GIFI } from '../src/rules/yearend';
import { blankProfile, type CompanyProfile } from '../src/rules/profile';
import { ACCOUNT_BY_ID } from '../src/rules/gifi';
import type { LedgerLine } from '../src/rules/hst';

const isCurrent = (id: string): boolean => ACCOUNT_BY_ID.get(id)?.current !== false;

const profile = (over: Partial<CompanyProfile> = {}): CompanyProfile => ({
  ...blankProfile(), legalName: 'Test Inc.', incorporationDate: '2025-03-15', ...over,
});

const line = (
  accountId: string, amount: number, hst = 0, date = '2026-06-01', counterAccountId = 'bank',
): LedgerLine => ({ date, accountId, amount, hst, counterAccountId });

describe('the first tax year', () => {
  it('runs from incorporation to the first year end after it', () => {
    expect(firstYearEnd('2025-03-15', { month: 12, day: 31 })).toBe('2025-12-31');
  });

  it('rolls into the next calendar year when the year end has already passed', () => {
    expect(firstYearEnd('2025-08-01', { month: 6, day: 30 })).toBe('2026-06-30');
  });

  /**
   * A first tax year cannot exceed 53 weeks. Incorporating just after the
   * chosen year end would otherwise produce a first year of nearly two years.
   */
  it('never exceeds 53 weeks', () => {
    const end = firstYearEnd('2025-01-02', { month: 12, day: 31 });
    const days = (Date.parse(end) - Date.parse('2025-01-02')) / 86_400_000;
    expect(days).toBeLessThanOrEqual(371);
  });
});

describe('fiscal years', () => {
  it('lists every year from incorporation, newest first', () => {
    const years = fiscalYears(profile(), '2027-02-01');
    expect(years.map((y) => `${y.from}..${y.to}`)).toEqual([
      '2027-01-01..2027-12-31',
      '2026-01-01..2026-12-31',
      '2025-03-15..2025-12-31',
    ]);
  });

  it('marks the stub period as the first year and the rest as not', () => {
    const years = fiscalYears(profile(), '2027-02-01');
    expect(years.at(-1)!.first).toBe(true);
    expect(years.filter((y) => y.first)).toHaveLength(1);
  });

  it('knows which years have finished', () => {
    const years = fiscalYears(profile(), '2027-02-01');
    expect(years.find((y) => y.to === '2027-12-31')!.ended).toBe(false);
    expect(years.find((y) => y.to === '2026-12-31')!.ended).toBe(true);
  });

  it('handles a year end that is not December', () => {
    const years = fiscalYears(
      profile({ incorporationDate: '2025-08-01', fiscalYearEnd: { month: 6, day: 30 } }),
      '2027-01-01');
    expect(years.map((y) => y.to)).toEqual(['2027-06-30', '2026-06-30']);
  });

  it('has nothing to say before an incorporation date is known', () => {
    expect(fiscalYears(profile({ incorporationDate: '' }), '2027-01-01')).toEqual([]);
  });
});

describe('the statements', () => {
  const ledger: LedgerLine[] = [
    line('share-capital', 10_000, 0, '2025-03-15'),
    line('sales', 100_000, 13_000, '2025-06-01'),
    line('rent', 20_000, 2_600, '2025-07-01'),
    line('sales', 500_000, 65_000, '2026-04-01'),
    line('rent', 120_000, 15_600, '2026-05-01'),
    line('equipment', 300_000, 39_000, '2026-03-01'),
  ];
  const years = fiscalYears(profile(), '2027-02-01');
  const fy2026 = years.find((y) => y.to === '2026-12-31')!;
  const s = statementsFor(ledger, fy2026, isCurrent);

  it('reports revenue and expenses for the year alone', () => {
    expect(s.income.totalRevenue).toBe(500_000);
    expect(s.income.totalExpenses).toBe(120_000);
    expect(s.income.netBeforeTax).toBe(380_000);
  });

  it('keeps capital out of the income statement', () => {
    // The laptop is an asset. Treating it as an expense is the commonest way a
    // small corporation overstates its deduction.
    expect(s.income.expenses.some((l) => l.name.includes('Computer'))).toBe(false);
    expect(s.balance.capitalAssets.some((l) => l.gifi === 1774)).toBe(true);
  });

  it('reports the balance sheet cumulatively rather than for the year', () => {
    // Share capital was issued in 2025 and still sits on the 2026 balance sheet.
    expect(s.balance.equity.some((l) => l.gifi === 3500 && l.amount === 10_000)).toBe(true);
  });

  it('balances', () => {
    expect(s.balance.difference).toBe(0);
    expect(s.balance.totalLiabilitiesAndEquity).toBe(s.balance.totalAssets);
  });

  it('carries earnings from every prior year into retained earnings', () => {
    // 2025 made 100,000 less 20,000. 2026 made 500,000 less 120,000.
    const retained = s.balance.equity.find((l) => l.gifi === 3600)!;
    expect(retained.amount).toBe(80_000 + 380_000);
  });

  it('separates current assets from capital ones', () => {
    expect(s.balance.currentAssets.some((l) => l.gifi === 1001)).toBe(true);   // bank
    expect(s.balance.currentAssets.some((l) => l.gifi === 1774)).toBe(false);  // equipment
    expect(s.balance.totalAssets)
      .toBe(s.balance.totalCurrentAssets
        + s.balance.capitalAssets.reduce((t, l) => t + l.amount, 0));
  });

  it('uses the GIFI subtotal codes the schedules ask for', () => {
    expect(GIFI.totalAssets).toBe(2599);
    expect(GIFI.totalLiabilities).toBe(3499);
    expect(GIFI.totalEquity).toBe(3620);
    expect(GIFI.totalRevenue).toBe(8299);
    expect(GIFI.totalExpenses).toBe(9368);
  });

  it('balances for the first year too', () => {
    const fy2025 = years.find((y) => y.to === '2025-12-31')!;
    expect(statementsFor(ledger, fy2025, isCurrent).balance.difference).toBe(0);
  });

  it('reports nothing rather than failing on an empty ledger', () => {
    const empty = statementsFor([], fy2026, isCurrent);
    expect(empty.income.totalRevenue).toBe(0);
    expect(empty.balance.difference).toBe(0);
  });
});
