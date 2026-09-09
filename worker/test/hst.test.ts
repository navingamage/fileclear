import { describe, expect, it } from 'vitest';
import {
  computeHst, gifiSummary, dollars, hstOn,
  QUICK_RATE_ON_SERVICES, type LedgerLine,
} from '../src/rules/hst';
import { ACCOUNTS, ACCOUNT_BY_ID } from '../src/rules/gifi';

/**
 * The HST return is money. A wrong figure here is a reassessment with interest,
 * so every branch that changes a number has a test naming what it is.
 */

const line = (accountId: string, amount: number, hst: number, date = '2026-03-15'): LedgerLine =>
  ({ date, accountId, amount, hst });

// $100,000 of services, HST charged, against $20,000 of taxable costs.
const year: LedgerLine[] = [
  line('sales', 100_000_00, 13_000_00),
  line('software', 6_000_00, 780_00),
  line('professional', 4_000_00, 520_00),
  line('rent', 10_000_00, 1_300_00),
];

describe('the regular method', () => {
  it('is what was collected less what was paid', () => {
    const r = computeHst(year, '2026-01-01', '2026-12-31');
    expect(r.totalRevenue).toBe(100_000_00);
    expect(r.collected).toBe(13_000_00);
    expect(r.itcs).toBe(2_600_00);
    expect(r.netTaxRegular).toBe(10_400_00);
  });

  it('claims only the HST actually on the document', () => {
    // A supplier outside Canada charges none, so there is none to claim, and
    // nothing should be imputed from the amount.
    const r = computeHst([line('sales', 1_000_00, 130_00), line('software', 500_00, 0)],
      '2026-01-01', '2026-12-31');
    expect(r.itcs).toBe(0);
  });

  it('claims half the HST on meals, because half is all that is claimable', () => {
    const r = computeHst([line('meals', 200_00, 26_00)], '2026-01-01', '2026-12-31');
    expect(r.itcs).toBe(13_00);
  });

  it('claims nothing on exempt supplies', () => {
    const r = computeHst([line('insurance', 2_000_00, 0), line('bank-charges', 300_00, 0)],
      '2026-01-01', '2026-12-31');
    expect(r.itcs).toBe(0);
  });

  it('ignores anything outside the period', () => {
    const r = computeHst([
      line('sales', 50_000_00, 6_500_00, '2025-12-31'),
      line('sales', 10_000_00, 1_300_00, '2026-06-01'),
      line('sales', 50_000_00, 6_500_00, '2027-01-01'),
    ], '2026-01-01', '2026-12-31');
    expect(r.totalRevenue).toBe(10_000_00);
  });
});

describe('the Quick Method', () => {
  /**
   * The worked example everyone quotes: $100,000 of services in Ontario is
   * $113,000 HST included, 8.8% of that is $9,944, less the 1% credit on the
   * first $30,000 which is $300, so $9,644.
   */
  it('matches the published Ontario services example', () => {
    const r = computeHst([line('sales', 100_000_00, 13_000_00)], '2026-01-01', '2026-12-31');
    expect(r.quick.rate).toBe(QUICK_RATE_ON_SERVICES);
    expect(r.quick.includedSales).toBe(113_000_00);
    expect(r.quick.credit).toBe(300_00);
    expect(r.quick.netTax).toBe(9_644_00);
  });

  it('caps the 1% credit at the first $30,000', () => {
    const small = computeHst([line('sales', 10_000_00, 1_300_00)], '2026-01-01', '2026-12-31');
    expect(small.quick.credit).toBe(113_00); // 1% of 11,300, all of it under the cap
    const big = computeHst([line('sales', 500_000_00, 65_000_00)], '2026-01-01', '2026-12-31');
    expect(big.quick.credit).toBe(300_00);
  });

  it('stops being available over the $400,000 ceiling', () => {
    const under = computeHst([line('sales', 300_000_00, 39_000_00)], '2026-01-01', '2026-12-31');
    const over = computeHst([line('sales', 400_000_00, 52_000_00)], '2026-01-01', '2026-12-31');
    expect(under.quick.eligible).toBe(true);
    expect(over.quick.eligible).toBe(false);
    expect(over.caveats.join(' ')).toMatch(/400,000/);
  });

  it('still claims ITCs on capital purchases', () => {
    const r = computeHst([
      line('sales', 100_000_00, 13_000_00),
      line('equipment', 5_000_00, 650_00),
      line('software', 5_000_00, 650_00),
    ], '2026-01-01', '2026-12-31');
    // The laptop keeps its credit; the subscription does not.
    expect(r.quick.capitalItcs).toBe(650_00);
    expect(r.quick.netTax).toBe(9_644_00 - 650_00);
  });

  it('leaves exempt revenue out of the flat rate, and says so', () => {
    const r = computeHst([
      line('sales', 100_000_00, 13_000_00),
      line('interest-income', 5_000_00, 0),
    ], '2026-01-01', '2026-12-31');
    expect(r.quick.includedSales).toBe(113_000_00);
    expect(r.caveats.join(' ')).toMatch(/[Ee]xempt/);
  });
});

describe('the comparison, which is the point', () => {
  it('favours the Quick Method for a service business with few costs', () => {
    const r = computeHst(year, '2026-01-01', '2026-12-31');
    // 10,400 regular against 9,644 quick.
    expect(r.quickSaves).toBe(756_00);
    expect(r.quickSaves).toBeGreaterThan(0);
  });

  it('favours the regular method once costs are heavy', () => {
    const heavy = [
      line('sales', 100_000_00, 13_000_00),
      line('subcontract', 60_000_00, 7_800_00),
      line('rent', 12_000_00, 1_560_00),
    ];
    const r = computeHst(heavy, '2026-01-01', '2026-12-31');
    expect(r.netTaxRegular).toBe(3_640_00);
    expect(r.quickSaves).toBeLessThan(0);
  });

  it('always warns that electing is a filing rather than a switch', () => {
    const r = computeHst(year, '2026-01-01', '2026-12-31');
    expect(r.caveats.join(' ')).toMatch(/binds you/);
  });
});

describe('the chart of accounts', () => {
  it('has unique ids and a GIFI code on every account', () => {
    const ids = ACCOUNTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACCOUNTS) {
      expect(a.gifi).toBeGreaterThan(0);
      expect(a.name.trim()).not.toBe('');
    }
  });

  it('puts balance sheet accounts under 4000 and income statement over 8000', () => {
    for (const a of ACCOUNTS) {
      if (a.kind === 'revenue' || a.kind === 'expense') expect(a.gifi).toBeGreaterThanOrEqual(8000);
      else expect(a.gifi).toBeLessThan(4000);
    }
  });

  it('carries no long dashes in anything that ships', () => {
    for (const a of ACCOUNTS) {
      expect(a.name + (a.hint ?? '')).not.toContain('—');
      expect(a.name + (a.hint ?? '')).not.toContain('–');
    }
  });

  it('rolls the ledger up by GIFI code', () => {
    const summary = gifiSummary(year, '2026-01-01', '2026-12-31');
    const sales = summary.find((g) => g.gifi === 8000);
    expect(sales?.amount).toBe(100_000_00);
    expect(summary.map((g) => g.gifi)).toEqual([...summary.map((g) => g.gifi)].sort((a, b) => a - b));
  });
});

describe('money', () => {
  it('formats cents without losing any', () => {
    expect(dollars(9_644_00)).toBe('9,644.00');
    expect(dollars(5)).toBe('0.05');
    expect(dollars(-1_234_56)).toBe('-1,234.56');
  });

  it('computes 13% without floating point drift', () => {
    expect(hstOn(100_00)).toBe(13_00);
    expect(hstOn(33_33)).toBe(433);
    expect(ACCOUNT_BY_ID.get('sales')?.hst).toBe('standard');
  });
});
