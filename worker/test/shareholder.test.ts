import { describe, expect, it } from 'vitest';
import { shareholderLoans, fiscalYears } from '../src/rules/yearend';
import { blankProfile } from '../src/rules/profile';
import type { LedgerLine } from '../src/rules/hst';

const p = { ...blankProfile(), legalName: 'Test Inc.', incorporationDate: '2024-01-01' };
const years = (today: string) => fiscalYears(p, today);

const line = (
  accountId: string, amount: number, date: string, counterAccountId = 'bank',
): LedgerLine => ({ date, accountId, amount, hst: 0, counterAccountId });

/**
 * The direction is the thing to get right and easy to reverse.
 * `due-shareholder` is a liability: positive means the corporation owes the
 * director, which is money they put in and carries no problem at all. Only a
 * negative balance, the liability turned around, is a loan to a shareholder.
 */
describe('which direction matters', () => {
  it('says nothing when the director has put money in', () => {
    // Lending the company money increases what it owes: the safe direction.
    const ledger = [line('due-shareholder', 20_000_00, '2026-03-01')];
    expect(shareholderLoans(ledger, years('2027-06-01'), '2027-06-01')).toEqual([]);
  });

  it('raises it when the director has taken money out', () => {
    // Paying a personal expense from the company turns the liability around.
    const ledger = [line('due-shareholder', -20_000_00, '2026-03-01')];
    const found = shareholderLoans(ledger, years('2027-06-01'), '2027-06-01');
    expect(found).toHaveLength(1);
    expect(found[0]!.owed).toBe(20_000_00);
  });

  it('nets the year out before deciding', () => {
    const ledger = [
      line('due-shareholder', -30_000_00, '2026-03-01'),
      line('due-shareholder', 30_000_00, '2026-09-01'),
    ];
    expect(shareholderLoans(ledger, years('2027-06-01'), '2027-06-01')).toEqual([]);
  });
});

describe('the clock', () => {
  const ledger = [line('due-shareholder', -20_000_00, '2026-03-01')];

  it('is one year after the year end, not one year after the loan', () => {
    const found = shareholderLoans(ledger, years('2027-06-01'), '2027-06-01');
    expect(found[0]!.yearEnd).toBe('2026-12-31');
    expect(found[0]!.repayBy).toBe('2027-12-31');
  });

  it('counts the days remaining', () => {
    const found = shareholderLoans(ledger, years('2027-12-01'), '2027-12-01');
    expect(found[0]!.daysLeft).toBe(30);
    expect(found[0]!.overdue).toBe(false);
  });

  /**
   * The expensive part: the inclusion lands in the year the money was taken,
   * so the assessment arrives against a return that has already been filed.
   */
  it('says the income lands in the year it was taken, once the date passes', () => {
    const found = shareholderLoans(ledger, years('2028-03-01'), '2028-03-01');
    expect(found[0]!.overdue).toBe(true);
    expect(found[0]!.message).toMatch(/personal income in 2026/);
    expect(found[0]!.message).toMatch(/already been filed may need amending/);
  });

  it('warns that repaying and re-borrowing does not restart it', () => {
    const found = shareholderLoans(ledger, years('2027-06-01'), '2027-06-01');
    expect(found[0]!.message).toMatch(/does not restart the clock/);
  });

  /** One year after 29 February is 28 February, not a date that does not exist. */
  it('handles a year end on the leap day', () => {
    const feb = { ...blankProfile(), incorporationDate: '2024-01-01',
      fiscalYearEnd: { month: 2, day: 29 } };
    const found = shareholderLoans(
      [line('due-shareholder', -5_000_00, '2024-02-01')],
      fiscalYears(feb, '2026-06-01'), '2026-06-01');
    expect(found[0]!.yearEnd).toBe('2024-02-29');
    expect(found[0]!.repayBy).toBe('2025-02-28');
  });

  /**
   * The same money outstanding at two year ends is one problem, not two.
   * Reporting a fresh clock per year would say it is at risk twice over.
   */
  it('reports the earliest year end once, not every one it survived', () => {
    const ledger = [line('due-shareholder', -20_000_00, '2026-03-01')];
    const found = shareholderLoans(ledger, years('2029-01-01'), '2029-01-01');
    expect(found).toHaveLength(1);
    expect(found[0]!.yearEnd).toBe('2026-12-31');
  });
});

describe('when it stops mattering', () => {
  it('says nothing once it has been repaid and the date has not passed', () => {
    const ledger = [
      line('due-shareholder', -20_000_00, '2026-03-01'),
      line('due-shareholder', 20_000_00, '2027-06-01'),
    ];
    expect(shareholderLoans(ledger, years('2027-08-01'), '2027-08-01')).toEqual([]);
  });

  /** Repaying after the deadline does not undo an inclusion that already happened. */
  it('still raises it when the repayment came too late', () => {
    const ledger = [
      line('due-shareholder', -20_000_00, '2026-03-01'),
      line('due-shareholder', 20_000_00, '2028-02-01'),
    ];
    const found = shareholderLoans(ledger, years('2028-06-01'), '2028-06-01');
    expect(found.some((f) => f.overdue)).toBe(true);
  });

  it('ignores a year that has not finished', () => {
    const ledger = [line('due-shareholder', -20_000_00, '2027-03-01')];
    const found = shareholderLoans(ledger, years('2027-06-01'), '2027-06-01');
    expect(found.every((f) => f.yearEnd < '2027-06-01')).toBe(true);
  });

  it('says nothing about a ledger with no shareholder account in it', () => {
    expect(shareholderLoans([line('rent', 5_000_00, '2026-03-01')],
      years('2027-06-01'), '2027-06-01')).toEqual([]);
  });
});
