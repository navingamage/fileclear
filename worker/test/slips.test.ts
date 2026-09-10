import { describe, expect, it } from 'vitest';
import { t4For, t5For, slipDeadline } from '../src/rules/slips';
import { cppOnSalary, personalTax, DIVIDENDS } from '../src/rules/personal';
import type { LedgerLine } from '../src/rules/hst';

const line = (
  accountId: string, amount: number, date: string, counterAccountId = 'bank',
): LedgerLine => ({ date, accountId, amount, hst: 0, counterAccountId });

const box = (boxes: { box: string; amount: number }[], n: string): number =>
  boxes.find((b) => b.box === n)?.amount ?? 0;

describe('the T4', () => {
  const ledger: LedgerLine[] = [
    line('salaries', 30_000_00, '2026-06-30'),
    line('salaries', 30_000_00, '2026-12-31'),
    line('salaries', 90_000_00, '2027-06-30'),   // a different calendar year
  ];
  const t4 = t4For(ledger, 2026);

  it('reports employment income in box 14', () => {
    expect(box(t4.boxes, '14')).toBe(60_000_00);
  });

  /**
   * The trap for anyone whose year end is not December. A T4 covers January to
   * December whatever the fiscal year is, and lining the two up produces slips
   * CRA cannot match to a remittance account.
   */
  it('covers the calendar year and nothing else', () => {
    expect(box(t4For(ledger, 2027).boxes, '14')).toBe(90_000_00);
    expect(t4.notes.join(' ')).toMatch(/calendar year, not your fiscal year/i);
  });

  it('agrees with the CPP calculation on that income', () => {
    const cpp = cppOnSalary(60_000_00);
    expect(box(t4.boxes, '16')).toBe(cpp.employee);   // no CPP2 at this level
    expect(t4.employerCpp).toBe(cpp.employer);
  });

  it('reports income tax in box 22', () => {
    expect(box(t4.boxes, '22')).toBe(personalTax({ salary: 60_000_00 }).total);
  });

  it('reports pensionable earnings whenever box 16 has an amount', () => {
    expect(box(t4.boxes, '16')).toBeGreaterThan(0);
    expect(box(t4.boxes, '26')).toBe(60_000_00);
  });

  it('caps pensionable earnings at the first ceiling', () => {
    const big = t4For([line('salaries', 120_000_00, '2026-03-01')], 2026);
    expect(box(big.boxes, '26')).toBe(74_600_00);
  });

  it('splits CPP2 out into box 16A above the first ceiling', () => {
    const big = t4For([line('salaries', 120_000_00, '2026-03-01')], 2026);
    const cpp = cppOnSalary(120_000_00);
    expect(box(big.boxes, '16A')).toBe(416_00);
    expect(box(big.boxes, '16') + box(big.boxes, '16A')).toBe(cpp.employee);
  });

  it('leaves box 16A off entirely when there is no CPP2', () => {
    expect(t4.boxes.some((b) => b.box === '16A')).toBe(false);
  });

  /**
   * Box 24 is the one box that has to say 0.00 rather than be left empty, so it
   * survives the filter that drops zero amounts.
   */
  it('keeps box 24 at zero rather than dropping it', () => {
    const b24 = t4.boxes.find((b) => b.box === '24')!;
    expect(b24.amount).toBe(0);
    expect(b24.note).toMatch(/0\.00/);
  });

  /**
   * A zero box is usually noise, but box 18 at zero is the only place the slip
   * says why an owner manager pays no EI. Filtering it out for being empty
   * throws away the answer to the question it raises.
   */
  it('keeps the empty EI boxes, because they carry the explanation', () => {
    const b18 = t4.boxes.find((b) => b.box === '18')!;
    expect(b18.amount).toBe(0);
    expect(b18.note).toMatch(/40%/);
    expect(t4.boxes.find((b) => b.box === '24')).toBeDefined();
  });

  it('still drops boxes that are empty and say nothing', () => {
    expect(t4.boxes.every((b) => b.amount !== 0 || b.keepIfZero)).toBe(true);
  });

  it('has nothing to report when no salary was paid', () => {
    const none = t4For([line('rent', 5_000_00, '2026-04-01')], 2026);
    expect(box(none.boxes, '14')).toBe(0);
    expect(none.notes).toEqual([]);
  });
});

describe('the T5', () => {
  const ledger: LedgerLine[] = [
    line('dividends-paid', 40_000_00, '2026-03-01', 'bank'),
    line('dividends-paid', 20_000_00, '2026-09-01', 'bank'),
    line('dividends-paid', 15_000_00, '2027-03-01', 'bank'),
  ];
  const t5 = t5For(ledger, 2026);

  it('reports the cash dividend in box 10', () => {
    expect(box(t5.boxes, '10')).toBe(60_000_00);
  });

  it('grosses it up by 15% into box 11', () => {
    expect(box(t5.boxes, '11')).toBe(69_000_00);
    expect(DIVIDENDS.nonEligible.grossUp).toBe(0.15);
  });

  it('computes box 12 as 9/13 of the gross up', () => {
    // CRA states it both ways: 9/13 of the gross up, or 9.0301% of box 11.
    const byFraction = Math.round((9 / 13) * (60_000_00 * 0.15));
    expect(box(t5.boxes, '12')).toBeCloseTo(byFraction, -2);
    expect(box(t5.boxes, '12'))
      .toBe(Math.round(69_000_00 * DIVIDENDS.nonEligible.federalCredit));
  });

  it('uses the 24, 25 and 26 boxes for eligible dividends', () => {
    const e = t5For(ledger, 2026, 'eligible');
    expect(box(e.boxes, '24')).toBe(60_000_00);
    expect(box(e.boxes, '25')).toBe(82_800_00);          // grossed up 38%
    expect(e.boxes.some((b) => b.box === '10')).toBe(false);
  });

  it('covers the calendar year, on the date paid', () => {
    expect(box(t5For(ledger, 2027).boxes, '24' )).toBe(0);
    expect(box(t5For(ledger, 2027).boxes, '10')).toBe(15_000_00);
    expect(t5.notes.join(' ')).toMatch(/date the dividend was paid/i);
  });

  it('warns that a dividend needs a resolution behind it', () => {
    expect(t5.notes.join(' ')).toMatch(/directors resolution/i);
    expect(t5.notes.join(' ')).toMatch(/shareholder loan/i);
  });

  it('warns against designating a small business dividend eligible', () => {
    expect(t5.notes.join(' ')).toMatch(/penalty tax/i);
  });

  it('says nothing when no dividend was paid', () => {
    expect(t5For([line('rent', 100_00, '2026-01-01')], 2026).notes).toEqual([]);
  });
});

describe('the deadline', () => {
  it('is the last day of February in the following year', () => {
    expect(slipDeadline(2026)).toBe('2027-02-28');
  });

  it('is the 29th when the following year is a leap year', () => {
    expect(slipDeadline(2027)).toBe('2028-02-29');
  });

  it('handles a century that is not a leap year', () => {
    expect(slipDeadline(2099)).toBe('2100-02-28');
  });
});
