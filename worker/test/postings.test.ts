import { describe, expect, it } from 'vitest';
import { postingsFor, outOfBalance, balances, totalOf } from '../src/rules/postings';
import type { LedgerLine } from '../src/rules/hst';

const line = (
  accountId: string, amount: number, hst = 0,
  counterAccountId = 'bank', date = '2026-03-15',
): LedgerLine => ({ date, accountId, amount, hst, counterAccountId });

describe('a row expands into a balanced entry', () => {
  /**
   * The whole reason postings.ts exists: a balance sheet cannot be derived from
   * one sided records, and Schedule 100 is a balance sheet.
   */
  it('puts a sale into the bank and the tax into HST payable', () => {
    const p = postingsFor(line('sales', 100_000, 13_000));
    expect(p).toEqual([
      { date: '2026-03-15', accountId: 'sales', kind: 'revenue', amount: 100_000 },
      { date: '2026-03-15', accountId: 'gst-payable', kind: 'liability', amount: 13_000 },
      { date: '2026-03-15', accountId: 'bank', kind: 'asset', amount: 113_000 },
    ]);
    expect(outOfBalance(p)).toBe(0);
  });

  it('takes an expense out of the bank and the tax into HST recoverable', () => {
    const p = postingsFor(line('rent', 200_000, 26_000));
    expect(p).toEqual([
      { date: '2026-03-15', accountId: 'rent', kind: 'expense', amount: 200_000 },
      { date: '2026-03-15', accountId: 'gst-receivable', kind: 'asset', amount: 26_000 },
      { date: '2026-03-15', accountId: 'bank', kind: 'asset', amount: -226_000 },
    ]);
    expect(outOfBalance(p)).toBe(0);
  });

  it('balances when the counter account is a liability', () => {
    // A laptop the director paid for personally: the company owes them for it.
    const p = postingsFor(line('equipment', 300_000, 39_000, 'due-shareholder'));
    expect(outOfBalance(p)).toBe(0);
    const shareholder = p.find((x) => x.accountId === 'due-shareholder')!;
    expect(shareholder.amount).toBe(339_000);   // the company owes more
  });

  it('balances a sale received into a receivable rather than the bank', () => {
    const p = postingsFor(line('sales', 50_000, 6_500, 'receivable'));
    expect(outOfBalance(p)).toBe(0);
    expect(p.find((x) => x.accountId === 'receivable')!.amount).toBe(56_500);
  });

  it('omits the tax leg when there was no tax on the document', () => {
    const p = postingsFor(line('salaries', 500_000, 0));
    expect(p.map((x) => x.accountId)).toEqual(['salaries', 'bank']);
    expect(outOfBalance(p)).toBe(0);
  });

  it('defaults a missing counter account to the bank', () => {
    const p = postingsFor({ date: '2026-01-01', accountId: 'rent', amount: 1000, hst: 0 });
    expect(p.some((x) => x.accountId === 'bank')).toBe(true);
    expect(outOfBalance(p)).toBe(0);
  });

  /**
   * A row naming an account that has left the chart must not take a year end
   * down with it. A missing row shows up in a total that does not agree, which
   * is visible; an exception thrown mid-report is not.
   */
  it('drops a row with an unknown account instead of throwing', () => {
    expect(postingsFor(line('not-an-account', 1000))).toEqual([]);
    expect(postingsFor(line('rent', 1000, 0, 'not-an-account'))).toEqual([]);
  });
});

describe('balances over a window', () => {
  const ledger: LedgerLine[] = [
    line('share-capital', 10_000, 0, 'bank', '2025-01-02'),
    line('sales', 100_000, 13_000, 'bank', '2025-06-01'),
    line('rent', 30_000, 3_900, 'bank', '2025-06-02'),
    line('sales', 200_000, 26_000, 'bank', '2026-06-01'),
    line('rent', 40_000, 5_200, 'bank', '2026-06-02'),
  ];

  it('covers only the window when one is given', () => {
    const b = balances(ledger, '2026-12-31', '2026-01-01');
    expect(totalOf(b, 'revenue')).toBe(200_000);
    expect(totalOf(b, 'expense')).toBe(40_000);
  });

  it('is cumulative when no start is given, which is what a balance sheet wants', () => {
    const b = balances(ledger, '2026-12-31');
    expect(totalOf(b, 'revenue')).toBe(300_000);
    expect(totalOf(b, 'expense')).toBe(70_000);
  });

  it('ignores anything after the reporting date', () => {
    const b = balances(ledger, '2025-12-31');
    expect(totalOf(b, 'revenue')).toBe(100_000);
  });

  it('keeps the whole ledger in balance', () => {
    const all = ledger.flatMap(postingsFor);
    expect(outOfBalance(all)).toBe(0);
  });
});

describe('a dividend', () => {
  const rows = [
    line('sales', 100_000_00, 0, 'bank', '2026-02-01'),
    line('dividends-paid', 15_000_00, 0, 'bank', '2026-03-01'),
  ];

  it('takes money out of the bank', () => {
    const bank = postingsFor(rows[1]!).find((p) => p.accountId === 'bank')!;
    expect(bank.amount).toBe(-15_000_00);
    expect(outOfBalance(postingsFor(rows[1]!))).toBe(0);
  });

  it('leaves the bank at what came in less what was paid out', () => {
    const b = balances(rows, '2026-12-31');
    expect(b.find((r) => r.accountId === 'bank')!.amount).toBe(85_000_00);
    // Recorded as a positive amount of dividends, which is what the T5 reads.
    expect(b.find((r) => r.accountId === 'dividends-paid')!.amount).toBe(15_000_00);
  });
});

describe('which way a row moved money', () => {
  it('reads direction from the posting, not the kind', async () => {
    const { rowFlow } = await import('../src/rules/postings');
    expect(rowFlow('sales', 100_00)).toBeGreaterThan(0);
    expect(rowFlow('rent', 100_00)).toBeLessThan(0);
    expect(rowFlow('dividends-paid', 100_00)).toBeLessThan(0);
    expect(rowFlow('share-capital', 100_00)).toBeGreaterThan(0);
    expect(rowFlow('due-shareholder', 100_00)).toBeGreaterThan(0);
    expect(rowFlow('due-shareholder', -100_00)).toBeLessThan(0);
  });
});
