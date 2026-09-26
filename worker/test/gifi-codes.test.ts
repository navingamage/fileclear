import { describe, expect, it } from 'vitest';
import { ACCOUNT_BY_ID, ACCOUNTS } from '../src/rules/gifi';
import { t2125Statement, T2125_LINE_NAMES } from '../src/rules/selfemployed';
import type { LedgerLine } from '../src/rules/hst';

/**
 * The codes a return is typed from.
 *
 * Six were wrong until they were checked against CRA's RC4088 rather than
 * recalled, and one of them would have reported a corporation's travel as a
 * government grant. These pin the corrected values to CRA's names so a future
 * edit that moves one has to explain itself to this file.
 */

const gifi = (id: string) => ACCOUNT_BY_ID.get(id)!.gifi;
const t2125 = (id: string) => ACCOUNT_BY_ID.get(id)!.t2125;

describe('GIFI codes, as RC4088 lists them', () => {
  it.each([
    ['travel', 9200, 'Travel expenses, not 8242 Subsidies and grants'],
    ['software', 9150, 'Computer-related expenses, not 8523 Meals and entertainment'],
    ['telephone', 9225, 'Telephone and telecommunications, not 8914 Equipment rental'],
    ['gst-receivable', 1066, 'Taxes receivable, not 1067 Interest receivable'],
    ['benefits', 8622, "Employer's portion of employee benefits, not 9061 Commissions"],
    ['payroll-payable', 2627, 'Employee deductions payable; 2650 is not a GIFI code'],
    ['meals', 8523, 'Meals and entertainment'],
    ['rent', 8910, 'Rental'],
    ['vehicle', 9281, 'Vehicle expenses'],
    ['bank-charges', 8710, 'Interest and bank charges'],
  ])('puts %s on %i (%s)', (id, code) => {
    expect(gifi(id)).toBe(code);
  });

  /** An expense on an income code is how travel became a subsidy. */
  it('keeps every expense out of the revenue range', () => {
    for (const a of ACCOUNTS.filter((x) => x.kind === 'expense')) {
      expect(a.gifi, a.id).not.toBe(8242);
      expect(a.gifi < 8000 || a.gifi > 8299, `${a.id} on revenue code ${a.gifi}`).toBe(true);
    }
  });
});

describe('T2125 lines, which are not GIFI codes', () => {
  it('gives every income statement account a T2125 line', () => {
    for (const a of ACCOUNTS.filter((x) => x.kind === 'revenue' || x.kind === 'expense')) {
      expect(a.t2125, a.id).toBeDefined();
    }
  });

  /** Where the two numbering systems differ, and why printing one as the
   *  other looked right until it did not. */
  it('uses the T2125 line where it differs from GIFI', () => {
    expect(t2125('telephone')).toBe(9220);
    expect(gifi('telephone')).toBe(9225);
    expect(t2125('benefits')).toBe(9060);
    expect(gifi('benefits')).toBe(8622);
    expect(t2125('interest-income')).toBe(8230);
  });

  it('names every line it can produce', () => {
    for (const a of ACCOUNTS) {
      if (a.t2125 && a.t2125 !== 8299) expect(T2125_LINE_NAMES[a.t2125], a.id).toBeDefined();
    }
  });
});

describe('the unincorporated statement', () => {
  const L = (date: string, accountId: string, amount: number): LedgerLine =>
    ({ date, accountId, amount, hst: 0 });

  const lines = [
    L('2026-02-01', 'sales', 100_000_00),
    L('2026-03-01', 'interest-income', 500_00),
    L('2026-04-01', 'meals', 1_000_00),
    L('2026-05-01', 'telephone', 1_200_00),
    L('2026-06-01', 'salaries', 30_000_00),
    L('2026-06-01', 'benefits', 2_000_00),
    L('2025-12-31', 'rent', 9_999_00),   // outside the year
  ];
  const s = t2125Statement(lines, '2026-01-01', '2026-12-31');

  /**
   * Line 8523 is "allowable part only". The corporate return handles the
   * other half with a Schedule 1 add back; this path had no equivalent and
   * deducted the whole cost.
   */
  it('puts meals on 8523 at the allowable half', () => {
    expect(s.expenses.find((r) => r.line === 8523)!.amount).toBe(500_00);
    expect(s.mealsDisallowed).toBe(500_00);
  });

  it("folds the employer's CPP and EI into 9060 with the wages", () => {
    expect(s.expenses.find((r) => r.line === 9060)!.amount).toBe(32_000_00);
  });

  it('reports telephone on 9220', () => {
    expect(s.expenses.find((r) => r.line === 9220)!.amount).toBe(1_200_00);
  });

  it('includes other income in gross revenue and shows it on 8230', () => {
    expect(s.grossRevenue).toBe(100_500_00);
    expect(s.otherIncome.find((r) => r.line === 8230)!.amount).toBe(500_00);
  });

  it('totals only what is deductible, and only inside the year', () => {
    expect(s.totalExpenses).toBe(500_00 + 1_200_00 + 32_000_00);
  });

  it('lists lines in the form order', () => {
    const order = s.expenses.map((r) => r.line);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
