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

/** Ontario, lower and higher. Kept as named constants because other files use them. */
export const ON_LOWER = 0.032;
export const ON_HIGHER = 0.115;

/** The federal business limit. Several provinces set their own, higher. */
export const BUSINESS_LIMIT = 500_000_00;

/**
 * Provincial and territorial corporate rates, from CRA's own table.
 *
 * Two things here are easy to get wrong. Three provinces set a business limit
 * above the federal $500,000, so a corporation in Nova Scotia gets the small
 * business rate provincially on income that is taxed at the general rate
 * federally. And Quebec and Alberta have no collection agreement with CRA at
 * all: they administer their own corporate tax and want their own return, so a
 * federal T2 is not the end of the job there.
 *
 * `administeredByCra` is false for those two rather than their rates being
 * guessed at. A number that looks authoritative and was never checked is worse
 * than an honest gap, and the gap is a separate return rather than a rounding
 * difference.
 */
export interface ProvincialRate {
  name: string;
  lower: number;
  higher: number;
  /** The provincial limit, which is not always the federal one. */
  businessLimit: number;
  administeredByCra: boolean;
}

export const PROVINCIAL_RATES: Record<string, ProvincialRate> = {
  BC: { name: 'British Columbia', lower: 0.02, higher: 0.12, businessLimit: 500_000_00, administeredByCra: true },
  MB: { name: 'Manitoba', lower: 0, higher: 0.12, businessLimit: 500_000_00, administeredByCra: true },
  NB: { name: 'New Brunswick', lower: 0.025, higher: 0.14, businessLimit: 500_000_00, administeredByCra: true },
  NL: { name: 'Newfoundland and Labrador', lower: 0.025, higher: 0.15, businessLimit: 500_000_00, administeredByCra: true },
  NT: { name: 'Northwest Territories', lower: 0.02, higher: 0.115, businessLimit: 500_000_00, administeredByCra: true },
  NS: { name: 'Nova Scotia', lower: 0.015, higher: 0.14, businessLimit: 700_000_00, administeredByCra: true },
  NU: { name: 'Nunavut', lower: 0.03, higher: 0.12, businessLimit: 500_000_00, administeredByCra: true },
  ON: { name: 'Ontario', lower: ON_LOWER, higher: ON_HIGHER, businessLimit: 500_000_00, administeredByCra: true },
  PE: { name: 'Prince Edward Island', lower: 0.01, higher: 0.15, businessLimit: 600_000_00, administeredByCra: true },
  SK: { name: 'Saskatchewan', lower: 0.01, higher: 0.12, businessLimit: 600_000_00, administeredByCra: true },
  YT: { name: 'Yukon', lower: 0, higher: 0.12, businessLimit: 500_000_00, administeredByCra: true },

  // No collection agreement with CRA. Rates deliberately zero: they are not
  // FileClear's to compute, and a separate return is owed.
  QC: { name: 'Quebec', lower: 0, higher: 0, businessLimit: 500_000_00, administeredByCra: false },
  AB: { name: 'Alberta', lower: 0, higher: 0, businessLimit: 500_000_00, administeredByCra: false },

  // A federal corporation is not resident anywhere by virtue of being federal;
  // its permanent establishments decide the province. Kept so a lookup never
  // returns undefined.
  CBCA: { name: 'Federal', lower: ON_LOWER, higher: ON_HIGHER, businessLimit: 500_000_00, administeredByCra: true },
};

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
  /** The province the provincial tax was computed for. */
  province: string;
  provinceName: string;
  provincialTax: number;
  /** Kept under its old name because Ontario is still the common case. */
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

  // Which province the corporation is taxed in. One establishment is the common
  // case and the only one that can be answered without Schedule 5, which splits
  // income between provinces on gross revenue and salaries. With more than one,
  // the primary is used and the allocation is flagged rather than invented.
  const primary = p.permanentEstablishments[0]
    ?? (p.jurisdiction === 'CBCA' ? 'ON' : p.jurisdiction);
  const prov = PROVINCIAL_RATES[primary] ?? PROVINCIAL_RATES.ON!;

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

  // The provincial limit is not always the federal one. Nova Scotia's is
  // $700,000 and Saskatchewan's and PEI's are $600,000, so a corporation can be
  // past the federal limit and still inside the provincial one.
  const provincialLimit = short
    ? Math.round(prov.businessLimit * (days / 365))
    : prov.businessLimit;

  // The provincial lower rate applies to income that qualifies for the federal
  // small business deduction, measured against the province's own limit. Both
  // halves of that matter. A corporation with no federal entitlement, because
  // it is not a CCPC or has used its limit up elsewhere, gets no provincial
  // lower rate either; and one that is entitled gets the provincial rate up to
  // the provincial limit even where that is above the federal one.
  const provEligible = eligible > 0 ? Math.max(0, provincialLimit - aaiiGrind) : 0;
  const provLower = Math.min(activeIncome, provEligible, taxableIncome);
  const provHigher = Math.max(0, taxableIncome - provLower);

  const provincialTax = prov.administeredByCra
    ? Math.round(provLower * prov.lower + provHigher * prov.higher)
    : 0;
  const totalTax = federalTax + provincialTax;

  if (!prov.administeredByCra) {
    notes.push(`${prov.name} has no corporation tax collection agreement with CRA and `
      + 'administers its own corporate tax, so provincial tax is not computed here and '
      + 'the federal T2 is not the end of the job. A separate provincial return is owed '
      + `to ${prov.name} on its own form.`);
  } else if (provincialLimit !== proratedLimit) {
    notes.push(`${prov.name} sets its own business limit of ${money(prov.businessLimit)}, `
      + `above the federal ${money(BUSINESS_LIMIT)}. Income between the two is taxed at the `
      + 'general rate federally and at the small business rate provincially, which is why '
      + 'the two columns do not split at the same place.');
  }

  if (p.permanentEstablishments.length > 1) {
    notes.push(`Provincial tax is computed for ${prov.name} alone. With a permanent `
      + 'establishment in more than one province, taxable income is allocated between them '
      + 'on Schedule 5 using gross revenue and salaries, and each province charges its own '
      + 'rate on its share. That allocation needs figures FileClear does not hold.');
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
    federalTax,
    province: primary, provinceName: prov.name,
    provincialTax, ontarioTax: provincialTax,
    totalTax,
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
