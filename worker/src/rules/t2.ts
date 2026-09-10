import type { CompanyProfile } from './profile';
import { CLAIMABLE_FRACTION } from './gifi';
import type { LedgerLine } from './hst';
import { balances } from './postings';
import type { FiscalYear, GifiStatements } from './yearend';
import type { Schedule8 } from './cca';

/**
 * Schedule 1 and the tax on the result.
 *
 * Schedule 1 exists because accounting profit and taxable income are different
 * numbers computed for different audiences. The financial statements say what
 * the business did. The return says what the Income Tax Act counts. Schedule 1
 * is the bridge, and it is where most of the money is: the half of a meal that
 * is not deductible, the capital cost allowance that does not appear in the
 * books at all.
 *
 * FileClear does not file. Everything here is a worksheet, and every figure
 * names the schedule and line it belongs on, so it can be typed into CRA's own
 * form or into whatever software submits it. Producing a number without saying
 * where it goes would make this a calculator rather than a return.
 */

// ------------------------------------------------------------------- rates

/** Basic Part I rate before anything is taken off it. */
export const FEDERAL_BASIC = 0.38;
/** The federal abatement for income earned in a province. */
export const FEDERAL_ABATEMENT = 0.10;
/** The small business deduction, which takes 28% down to 9%. */
export const SBD_RATE = 0.19;
/** The general rate reduction, which takes 28% down to 15%. */
export const GENERAL_REDUCTION = 0.13;

/** Ontario, lower and higher. */
export const ON_LOWER = 0.032;
export const ON_HIGHER = 0.115;

/** The federal business limit, and Ontario's, both $500,000. */
export const BUSINESS_LIMIT = 500_000_00;

/**
 * Passive income grinds the business limit away.
 *
 * Adjusted aggregate investment income over $50,000 reduces the limit by $5 for
 * every $1, so it is gone at $150,000. A corporation quietly holding investments
 * inside it can lose the small business rate without noticing.
 */
export const AAII_THRESHOLD = 50_000_00;
export const AAII_GRIND_RATE = 5;

/** Instalments are not required below this much tax payable. */
export const INSTALMENT_THRESHOLD = 3_000_00;

// -------------------------------------------------------------- schedule 1

export interface ReconciliationLine {
  /** Where it goes on the return. */
  ref: string;
  label: string;
  amount: number;
  why: string;
}

export interface Schedule1 {
  /** GIFI 9970, straight off the income statement. */
  netIncomePerBooks: number;
  additions: ReconciliationLine[];
  deductions: ReconciliationLine[];
  totalAdditions: number;
  totalDeductions: number;
  /** Schedule 1 line 300. */
  netIncomeForTax: number;
}

export function schedule1(
  statements: GifiStatements, lines: LedgerLine[], year: FiscalYear, s8: Schedule8,
): Schedule1 {
  const additions: ReconciliationLine[] = [];
  const deductions: ReconciliationLine[] = [];

  // Only half a meal is deductible. The ledger records the whole cost, because
  // the ledger is a record of what happened; the restriction is the return's.
  const period = balances(lines, year.to, year.from);
  const meals = period.find((b) => b.accountId === 'meals')?.amount ?? 0;
  const mealsFraction = CLAIMABLE_FRACTION.meals ?? 1;
  const mealsAddBack = Math.round(meals * (1 - mealsFraction));
  if (mealsAddBack) {
    additions.push({
      ref: 'S1 line 121',
      label: 'Non-deductible portion of meals and entertainment',
      amount: mealsAddBack,
      why: `Half of ${money(meals)} is not deductible for income tax.`,
    });
  }

  if (s8.totalRecapture) {
    additions.push({
      ref: 'S1 line 107',
      label: 'Recapture of capital cost allowance',
      amount: s8.totalRecapture,
      why: 'A class was sold for more than the pool held, so past deductions come back.',
    });
  }

  if (s8.totalCca) {
    deductions.push({
      ref: 'S1 line 403',
      label: 'Capital cost allowance',
      amount: s8.totalCca,
      why: 'From Schedule 8. Capital does not appear as an expense in the books, so '
        + 'this deduction exists only on the return.',
    });
  }

  if (s8.totalTerminalLoss) {
    deductions.push({
      ref: 'S1 line 404',
      label: 'Terminal loss',
      amount: s8.totalTerminalLoss,
      why: 'A class emptied with a balance left in it, so the rest is deductible now.',
    });
  }

  const totalAdditions = additions.reduce((s, a) => s + a.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    netIncomePerBooks: statements.income.netBeforeTax,
    additions, deductions, totalAdditions, totalDeductions,
    netIncomeForTax: statements.income.netBeforeTax + totalAdditions - totalDeductions,
  };
}

// ------------------------------------------------------------------- tax

export interface TaxComputation {
  taxableIncome: number;
  /** Income eligible for the small business rate, after every grind. */
  activeIncome: number;
  investmentIncome: number;

  businessLimit: number;
  /** Reduced for a short year, because the limit is annual. */
  proratedLimit: number;
  /** How much the limit was ground down by passive income. */
  aaiiGrind: number;
  /** What the small business rate actually applies to. */
  sbdIncome: number;
  /** What the general rate applies to. */
  generalIncome: number;

  federalTax: number;
  ontarioTax: number;
  totalTax: number;
  /** Blended, for the one number a person actually remembers. */
  effectiveRate: number;

  /** Whether instalments are required next year, and the base. */
  instalmentsRequired: boolean;
  instalmentBase: number;

  notes: string[];
}

const daysBetweenInclusive = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export function computeTax(
  p: CompanyProfile, year: FiscalYear, s1: Schedule1, lines: LedgerLine[],
): TaxComputation {
  const notes: string[] = [];
  const taxableIncome = Math.max(0, s1.netIncomeForTax);

  // Interest is passive. Everything else this chart can record is active.
  const period = balances(lines, year.to, year.from);
  const investmentIncome = period
    .filter((b) => b.accountId === 'interest-income')
    .reduce((s, b) => s + b.amount, 0);
  const activeIncome = Math.max(0, taxableIncome - investmentIncome);

  const days = daysBetweenInclusive(year.from, year.to);
  const short = days < 359;
  const proratedLimit = short
    ? Math.round(BUSINESS_LIMIT * (days / 365))
    : BUSINESS_LIMIT;
  if (short) {
    notes.push(`This year is ${days} days, so the $500,000 business limit is prorated `
      + `to ${money(proratedLimit)}. A short year does not get a full year's limit.`);
  }

  const aaiiGrind = investmentIncome > AAII_THRESHOLD
    ? Math.min(proratedLimit, (investmentIncome - AAII_THRESHOLD) * AAII_GRIND_RATE)
    : 0;
  if (aaiiGrind) {
    notes.push(`Passive income of ${money(investmentIncome)} grinds the business limit `
      + `down by ${money(aaiiGrind)}. It disappears entirely at $150,000 of passive income.`);
  }

  const eligible = !p.isCCPC ? 0
    : !p.claimsSmallBusinessDeduction ? 0
    : Math.max(0, proratedLimit - aaiiGrind);

  if (!p.isCCPC) {
    notes.push('Not a CCPC, so there is no small business deduction and the general '
      + 'rate applies to everything.');
  } else if (!p.claimsSmallBusinessDeduction) {
    notes.push('The profile says the business limit is used up elsewhere, most often by '
      + 'associated corporations, so no small business deduction is taken here.');
  }

  const sbdIncome = Math.min(activeIncome, eligible, taxableIncome);
  const generalIncome = Math.max(0, taxableIncome - sbdIncome);

  // 38 less the 10 point abatement is 28. The small business deduction takes 19
  // off that, and the general rate reduction takes 13.
  const afterAbatement = FEDERAL_BASIC - FEDERAL_ABATEMENT;
  const federalTax = Math.round(
    sbdIncome * (afterAbatement - SBD_RATE)
    + generalIncome * (afterAbatement - GENERAL_REDUCTION));

  const ontarioTax = Math.round(sbdIncome * ON_LOWER + generalIncome * ON_HIGHER);
  const totalTax = federalTax + ontarioTax;

  if (!p.permanentEstablishments.includes('ON') || p.permanentEstablishments.length > 1) {
    notes.push('Provincial tax here is Ontario only. With a permanent establishment in '
      + 'more than one province, taxable income is allocated between them on Schedule 5 '
      + 'and each province charges its own rate.');
  }

  const instalmentsRequired = totalTax > INSTALMENT_THRESHOLD && !year.first;
  if (year.first && totalTax > INSTALMENT_THRESHOLD) {
    notes.push('No instalments were required in the first tax year, but they will be '
      + 'next year now that tax payable is over $3,000.');
  }

  return {
    taxableIncome, activeIncome, investmentIncome,
    businessLimit: BUSINESS_LIMIT, proratedLimit, aaiiGrind,
    sbdIncome, generalIncome,
    federalTax, ontarioTax, totalTax,
    effectiveRate: taxableIncome > 0 ? totalTax / taxableIncome : 0,
    instalmentsRequired, instalmentBase: totalTax,
    notes,
  };
}

/** Dollars with no symbol, for prose. Kept local so rules never import a view. */
function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `$${sign}${Math.floor(abs / 100).toLocaleString('en-CA')}`;
}
