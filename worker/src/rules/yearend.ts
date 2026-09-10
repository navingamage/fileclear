import type { CompanyProfile, MonthDay } from './profile';
import { addDays, daysInMonth } from './engine';
import type { LedgerLine } from './hst';
import { balances, totalOf, type Balance } from './postings';

/**
 * Fiscal years, and the financial statements the T2 asks for.
 *
 * Everything the corporate return needs starts here. Schedule 125 is an income
 * statement, Schedule 100 is a balance sheet, and both are expressed in GIFI
 * codes, which the chart of accounts has carried since the first transaction
 * precisely so this step is a rollup rather than a reconstruction.
 *
 * Nothing is stored. A fiscal year is derived from the year end on the
 * company's profile, and the statements are computed from the ledger every
 * time they are asked for, the same way filings are. That means correcting a
 * transaction corrects the financials immediately, with no close to redo.
 */

export interface FiscalYear {
  /** Stable id, and what the URL carries. */
  id: string;
  /** How an accountant says it: "FY2026". */
  label: string;
  from: string;
  to: string;
  /** Whether the period has finished. An unfinished year has no return to file. */
  ended: boolean;
  /** True for the stub period between incorporation and the first year end. */
  first: boolean;
}

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, daysInMonth(y, m))).padStart(2, '0')}`;

/**
 * The first tax year cannot exceed 53 weeks.
 *
 * A corporation incorporated in February with a December year end has a first
 * year of about eleven months, which is fine. One incorporated in December with
 * a November year end would otherwise run almost twelve months to the following
 * November, and that is still inside 53 weeks. The rule only bites when the
 * chosen year end falls within days of the incorporation date, in which case
 * the first year end is the following one.
 */
const MAX_FIRST_YEAR_DAYS = 371;

/** The first year end on or after incorporation that gives a legal first year. */
export function firstYearEnd(incorporation: string, fye: MonthDay): string {
  const year = Number(incorporation.slice(0, 4));
  let end = iso(year, fye.month, fye.day);
  if (end <= incorporation) end = iso(year + 1, fye.month, fye.day);
  // A year end one day after incorporation is legal but absurd, and CRA's own
  // limit is the other end: too long, not too short. Only the ceiling is a rule.
  if (daysApart(incorporation, end) > MAX_FIRST_YEAR_DAYS) {
    end = iso(Number(end.slice(0, 4)) - 1, fye.month, fye.day);
  }
  return end;
}

function daysApart(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Every fiscal year from incorporation to the one containing `today`.
 *
 * Newest first, because the year somebody wants is almost always the one that
 * just ended.
 */
export function fiscalYears(p: CompanyProfile, today: string): FiscalYear[] {
  if (!p.incorporationDate) return [];

  const out: FiscalYear[] = [];
  let from = p.incorporationDate;
  let end = firstYearEnd(p.incorporationDate, p.fiscalYearEnd);
  let first = true;

  // One past today, so the year in progress is offered as well as the ones that
  // have closed. A director wants to see where the current year is standing.
  for (let guard = 0; guard < 200; guard++) {
    out.push({
      id: `fy-${end}`,
      label: `FY${end.slice(0, 4)}`,
      from,
      to: end,
      ended: end < today,
      first,
    });
    if (end >= today) break;
    from = addDays(end, 1);
    end = iso(Number(end.slice(0, 4)) + 1, p.fiscalYearEnd.month, p.fiscalYearEnd.day);
    first = false;
  }
  return out.reverse();
}

// -------------------------------------------------------------- statements

export interface StatementLine {
  gifi: number;
  name: string;
  amount: number;
}

export interface GifiStatements {
  year: FiscalYear;

  /** Schedule 125, the income statement, covering the fiscal year only. */
  income: {
    revenue: StatementLine[];
    expenses: StatementLine[];
    /** GIFI 8299. */
    totalRevenue: number;
    /** GIFI 9368. */
    totalExpenses: number;
    /** GIFI 9970, before income taxes. */
    netBeforeTax: number;
  };

  /**
   * Schedule 100, the balance sheet, as at the year end.
   *
   * Cumulative from incorporation rather than covering the year, because a
   * balance sheet says what is owned and owed on one date.
   */
  balance: {
    currentAssets: StatementLine[];
    capitalAssets: StatementLine[];
    currentLiabilities: StatementLine[];
    longTermLiabilities: StatementLine[];
    equity: StatementLine[];
    /** GIFI 1599. */
    totalCurrentAssets: number;
    /** GIFI 2599. */
    totalAssets: number;
    /** GIFI 3139. */
    totalCurrentLiabilities: number;
    /** GIFI 3499. */
    totalLiabilities: number;
    /** GIFI 3620, including the year's earnings. */
    totalEquity: number;
    /** GIFI 3640. Equal to total assets when the ledger holds together. */
    totalLiabilitiesAndEquity: number;
    /**
     * Assets less liabilities and stated equity. Zero when the books balance.
     *
     * Shown rather than hidden. A balance sheet that does not balance is the
     * single most useful signal a set of books can give, and quietly plugging
     * the difference is how a wrong return gets filed with confidence.
     */
    difference: number;
  };
}

/** GIFI subtotal codes, from CRA's RC4088. Named so the schedules read clearly. */
export const GIFI = {
  totalCurrentAssets: 1599,
  totalAssets: 2599,
  totalCurrentLiabilities: 3139,
  totalLiabilities: 3499,
  totalEquity: 3620,
  totalLiabilitiesAndEquity: 3640,
  totalRevenue: 8299,
  totalExpenses: 9368,
  netBeforeTax: 9970,
  netAfterTax: 9999,
} as const;

/** Rolls balances up by GIFI code, since two accounts can share one. */
function roll(rows: Balance[]): StatementLine[] {
  const totals = new Map<number, StatementLine>();
  for (const r of rows) {
    const line = totals.get(r.gifi) ?? { gifi: r.gifi, name: r.name, amount: 0 };
    line.amount += r.amount;
    totals.set(r.gifi, line);
  }
  return [...totals.values()]
    .filter((l) => l.amount !== 0)
    .sort((a, b) => a.gifi - b.gifi);
}

const sum = (lines: StatementLine[]): number => lines.reduce((s, l) => s + l.amount, 0);

export function statementsFor(
  lines: LedgerLine[], year: FiscalYear, accountIsCurrent: (id: string) => boolean,
): GifiStatements {
  const period = balances(lines, year.to, year.from);
  const cumulative = balances(lines, year.to);

  const revenue = roll(period.filter((r) => r.kind === 'revenue'));
  const expenses = roll(period.filter((r) => r.kind === 'expense'));
  const totalRevenue = sum(revenue);
  const totalExpenses = sum(expenses);

  const assets = cumulative.filter((r) => r.kind === 'asset');
  const liabilities = cumulative.filter((r) => r.kind === 'liability');
  const statedEquity = roll(cumulative.filter((r) => r.kind === 'equity'));

  const currentAssets = roll(assets.filter((r) => accountIsCurrent(r.accountId)));
  const capitalAssets = roll(assets.filter((r) => !accountIsCurrent(r.accountId)));
  const currentLiabilities = roll(liabilities.filter((r) => accountIsCurrent(r.accountId)));
  const longTermLiabilities = roll(liabilities.filter((r) => !accountIsCurrent(r.accountId)));

  // Earnings to date, which is what makes a balance sheet balance. Retained
  // earnings is not a thing anybody posts to; it is the accumulated result of
  // every revenue and expense line since incorporation.
  const earningsToDate =
    totalOf(cumulative, 'revenue') - totalOf(cumulative, 'expense');

  const equity: StatementLine[] = [
    ...statedEquity,
    { gifi: 3600, name: 'Retained earnings', amount: earningsToDate },
  ].filter((l) => l.amount !== 0);

  const totalCurrentAssets = sum(currentAssets);
  const totalAssets = totalCurrentAssets + sum(capitalAssets);
  const totalCurrentLiabilities = sum(currentLiabilities);
  const totalLiabilities = totalCurrentLiabilities + sum(longTermLiabilities);
  const totalEquity = sum(equity);

  return {
    year,
    income: {
      revenue, expenses, totalRevenue, totalExpenses,
      netBeforeTax: totalRevenue - totalExpenses,
    },
    balance: {
      currentAssets, capitalAssets, currentLiabilities, longTermLiabilities, equity,
      totalCurrentAssets, totalAssets,
      totalCurrentLiabilities, totalLiabilities, totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      difference: totalAssets - (totalLiabilities + totalEquity),
    },
  };
}
