import type { LedgerLine } from './hst';
import { balances } from './postings';
import { personalTax, cppOnSalary, DIVIDENDS, type DividendKind } from './personal';

/**
 * T4 and T5, filled in from the ledger.
 *
 * The calendar already says these are due by the last day of February. What it
 * could not say is what goes on them, which is the part people actually get
 * stuck on. Both slips are computed from what was recorded as paid, so the
 * figures agree with the books by construction rather than by retyping.
 *
 * One thing is worth stating loudly, because it catches people with a year end
 * that is not December: **T4 and T5 are calendar year slips.** A corporation
 * with a 30 June year end still reports January to December on them. The T2
 * follows the fiscal year and the slips do not, and lining the two up is a
 * mistake that produces slips CRA will not match to anything.
 */

export interface SlipBox {
  /** The box number as printed on the slip. */
  box: string;
  label: string;
  amount: number;
  note?: string;
  /**
   * Shown even at zero.
   *
   * Most empty boxes are noise and are dropped. Two are not: box 24 has to say
   * 0.00 rather than be left blank, and box 18 at zero is the only place the
   * slip explains why an owner manager pays no EI. Dropping a box because its
   * amount is zero throws away the answer to the question it raises.
   */
  keepIfZero?: boolean;
}

export interface T4 {
  /** The calendar year reported, never the fiscal year. */
  year: number;
  boxes: SlipBox[];
  /** Total remitted across the year, for the T4 Summary. */
  employerCpp: number;
  notes: string[];
}

/**
 * The T4 for one calendar year.
 *
 * Employment income comes from what was posted to the salary account. CPP and
 * income tax are recomputed from that income rather than read from the ledger,
 * because the ledger records the gross cost to the corporation and the split
 * between what was withheld and what was handed over is a calculation.
 *
 * That recomputation is also a check: if the salary account and the source
 * deductions account disagree with these numbers, something was posted wrong.
 */
export function t4For(lines: LedgerLine[], year: number): T4 {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const rows = balances(lines, to, from);
  const salary = rows.find((r) => r.accountId === 'salaries')?.amount ?? 0;

  const cpp = cppOnSalary(salary);
  const tax = personalTax({ salary }).total;

  const pensionable = Math.max(0, Math.min(salary, 74_600_00));

  const boxes: SlipBox[] = [
    { box: '14', label: 'Employment income', amount: salary },
    { box: '16', label: 'Employee CPP contributions', amount: cpp.employee - secondCpp(salary) },
    { box: '16A', label: 'Second CPP contributions (CPP2)', amount: secondCpp(salary),
      note: 'Left blank when there are none. Only earnings above the first ceiling create them.' },
    { box: '18', label: 'EI premiums', amount: 0, keepIfZero: true,
      note: 'Nil. A shareholder holding more than 40% of the voting shares is not in '
        + 'insurable employment, so no EI is withheld and none is payable by the corporation.' },
    { box: '22', label: 'Income tax deducted', amount: tax,
      note: 'What should have been withheld across the year. If the remittances differ, the difference settles on the personal return.' },
    { box: '24', label: 'EI insurable earnings', amount: 0, keepIfZero: true,
      note: 'Enter 0.00 rather than leaving it blank.' },
    { box: '26', label: 'CPP pensionable earnings', amount: pensionable,
      note: 'Required whenever box 16 has an amount.' },
  ];

  const notes: string[] = [];
  if (salary > 0) {
    notes.push('This is the calendar year, not your fiscal year. A T4 covers January to '
      + 'December whatever your year end is, and lining it up with the year end instead '
      + 'produces slips CRA cannot match.');
    notes.push('The T4 and the T4 Summary are both due by the last day of February. Late '
      + 'slips carry a penalty from the first day, starting at $100 even for a single one.');
  }

  return { year, boxes: boxes.filter((b) => b.amount !== 0 || b.keepIfZero),
    employerCpp: cpp.employer, notes };
}

function secondCpp(salary: number): number {
  const first = cppOnSalary(Math.min(salary, 74_600_00)).employee;
  return Math.max(0, cppOnSalary(salary).employee - first);
}

// ------------------------------------------------------------------- T5

export interface T5 {
  year: number;
  kind: DividendKind;
  boxes: SlipBox[];
  notes: string[];
}

/**
 * The T5 for one calendar year.
 *
 * Three boxes and all of them derived from one number, which is why a T5 is far
 * less work than a T4 and part of why owners reach for dividends. The gross up
 * and the credit are fixed percentages; nothing is withheld and nothing is
 * remitted during the year.
 */
export function t5For(
  lines: LedgerLine[], year: number, kind: DividendKind = 'nonEligible',
): T5 {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const rows = balances(lines, to, from);
  const paid = rows.find((r) => r.accountId === 'dividends-paid')?.amount ?? 0;

  const d = DIVIDENDS[kind];
  const taxable = Math.round(paid * (1 + d.grossUp));
  const credit = Math.round(taxable * d.federalCredit);

  const boxes: SlipBox[] = kind === 'eligible'
    ? [
      { box: '24', label: 'Actual amount of eligible dividends', amount: paid },
      { box: '25', label: 'Taxable amount of eligible dividends', amount: taxable,
        note: `Box 24 grossed up by ${(d.grossUp * 100).toFixed(0)}%.` },
      { box: '26', label: 'Dividend tax credit', amount: credit,
        note: `${(d.federalCredit * 100).toFixed(4)}% of box 25. Federal only; Ontario's is claimed on the personal return.` },
    ]
    : [
      { box: '10', label: 'Actual amount of dividends other than eligible', amount: paid },
      { box: '11', label: 'Taxable amount of dividends other than eligible', amount: taxable,
        note: `Box 10 grossed up by ${(d.grossUp * 100).toFixed(0)}%.` },
      { box: '12', label: 'Dividend tax credit', amount: credit,
        note: `9/13 of the gross up, which is ${(d.federalCredit * 100).toFixed(4)}% of box 11.` },
    ];

  const notes: string[] = [];
  if (paid > 0) {
    notes.push('Calendar year again, not the fiscal year, and it is the date the dividend '
      + 'was paid that counts rather than the date it was declared.');
    notes.push('A dividend needs a directors resolution behind it. Without one it is a '
      + 'shareholder loan, and a shareholder loan left outstanding past the following '
      + 'year end becomes taxable income personally.');
    if (kind === 'nonEligible') {
      notes.push('Non-eligible, which is what a corporation paying the small business rate '
        + 'pays. Designating a dividend eligible when the income behind it was taxed at the '
        + 'small business rate attracts a penalty tax.');
    }
  }

  return { year, kind, boxes, notes };
}

/**
 * Both slips are due the last day of February for the preceding calendar year,
 * which is a leap year aware date rather than a fixed one.
 */
export function slipDeadline(forYear: number): string {
  const y = forYear + 1;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-02-${leap ? 29 : 28}`;
}
