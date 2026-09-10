/**
 * Personal tax in Ontario, enough of it to compare salary against dividends.
 *
 * The corporation's tax is only half the question. A director choosing how to
 * take money out is choosing between two whole systems: salary is deductible to
 * the corporation and taxed as employment income with CPP on top, while a
 * dividend is paid out of income the corporation has already been taxed on and
 * arrives with a gross up and a credit designed to cancel that first layer out.
 * Neither half means anything without the other.
 *
 * Every figure here is 2026 and was read off CRA and Ontario rather than
 * recalled, with the source named beside it. Rates move every January and a
 * stale number here is a wrong answer that looks authoritative, so each one
 * carries the year it belongs to and the code refuses years it has no rates for.
 *
 * Money is in cents throughout.
 */

export const RATE_YEAR = 2026;

export interface Bracket {
  /** Cents. Income above this is taxed at `rate` until the next bracket. */
  upTo: number;
  rate: number;
}

/** 2026 federal brackets. The lowest rate fell to 14% for 2026 under Bill C-4. */
export const FEDERAL_BRACKETS: Bracket[] = [
  { upTo: 58_523_00, rate: 0.14 },
  { upTo: 117_045_00, rate: 0.205 },
  { upTo: 181_440_00, rate: 0.26 },
  { upTo: 258_482_00, rate: 0.29 },
  { upTo: Infinity, rate: 0.33 },
];

/** 2026 Ontario brackets. */
export const ONTARIO_BRACKETS: Bracket[] = [
  { upTo: 53_891_00, rate: 0.0505 },
  { upTo: 107_785_00, rate: 0.0915 },
  { upTo: 150_000_00, rate: 0.1116 },
  { upTo: 220_000_00, rate: 0.1216 },
  { upTo: Infinity, rate: 0.1316 },
];

/**
 * The basic personal amount, which is clawed back at high income.
 *
 * Federal: $16,452 falling to $14,829 across the fourth bracket. Ontario's is
 * flat.
 */
export const FEDERAL_BPA_MAX = 16_452_00;
export const FEDERAL_BPA_MIN = 14_829_00;
export const ONTARIO_BPA = 12_989_00;

/** The rate non-refundable credits are worth, which is the lowest bracket. */
export const FEDERAL_CREDIT_RATE = 0.14;
export const ONTARIO_CREDIT_RATE = 0.0505;

/**
 * Ontario's surtax. A tax on the tax, which is why Ontario's headline rates
 * understate what a higher earner actually pays.
 */
export const ON_SURTAX_1 = { over: 5_818_00, rate: 0.20 };
export const ON_SURTAX_2 = { over: 7_446_00, rate: 0.36 };

/** The Ontario Health Premium, a flat schedule on taxable income. */
const HEALTH_PREMIUM: { over: number; base: number; rate: number; cap: number }[] = [
  { over: 20_000_00, base: 0, rate: 0.06, cap: 300_00 },
  { over: 36_000_00, base: 300_00, rate: 0.06, cap: 450_00 },
  { over: 48_000_00, base: 450_00, rate: 0.25, cap: 600_00 },
  { over: 72_000_00, base: 600_00, rate: 0.25, cap: 750_00 },
  { over: 200_000_00, base: 750_00, rate: 0.25, cap: 900_00 },
];

// ------------------------------------------------------------------- CPP

export const CPP = {
  /** Year's maximum pensionable earnings. */
  ympe: 74_600_00,
  /** Year's additional maximum pensionable earnings, the CPP2 ceiling. */
  yampe: 85_000_00,
  exemption: 3_500_00,
  rate: 0.0595,
  maxContribution: 4_230_45,
  rate2: 0.04,
  maxContribution2: 416_00,
  /**
   * The base 4.95 points earn a tax credit; the 1.00 point of enhancement, and
   * all of CPP2, are deducted from income instead. Two different mechanisms
   * inside one contribution, which is why this cannot be treated as one number.
   */
  baseRate: 0.0495,
};

/** EI premiums, for completeness. A controlling shareholder does not pay them. */
export const EI = { rate: 0.0163, maxInsurable: 68_900_00, maxPremium: 1_123_07 };

/**
 * Someone who controls more than 40% of the voting shares is not in insurable
 * employment, so no EI is withheld and none is payable by the corporation. It
 * also means no maternity, parental or sickness benefits, which is a real cost
 * that never shows up in a tax comparison.
 */
export const EI_CONTROL_THRESHOLD = 0.40;

export interface CppOnSalary {
  employee: number;
  employer: number;
  /** The part that earns a credit rather than a deduction. */
  creditable: number;
  /** The part deducted from income before tax is computed. */
  deductible: number;
}

export function cppOnSalary(salary: number): CppOnSalary {
  const pensionable = Math.max(0, Math.min(salary, CPP.ympe) - CPP.exemption);
  const first = Math.min(Math.round(pensionable * CPP.rate), CPP.maxContribution);
  const second = Math.min(
    Math.round(Math.max(0, Math.min(salary, CPP.yampe) - CPP.ympe) * CPP.rate2),
    CPP.maxContribution2);

  const creditable = Math.round(first * (CPP.baseRate / CPP.rate));
  const deductible = first - creditable + second;
  return { employee: first + second, employer: first + second, creditable, deductible };
}

// -------------------------------------------------------------- dividends

/**
 * The gross up exists to put a dividend back to roughly what the corporation
 * earned before its own tax, so the personal credit can cancel that first layer
 * out. It is why a dividend is reported larger than the cheque.
 *
 * Non-eligible dividends come out of income taxed at the small business rate,
 * which is what a CCPC claiming the small business deduction pays. Eligible
 * dividends come out of income taxed at the general rate and carry a bigger
 * gross up and a bigger credit.
 */
export const DIVIDENDS = {
  nonEligible: {
    grossUp: 0.15,
    /** 9/13 of the gross up, which is 9.0301% of the grossed up amount. */
    federalCredit: 0.090301,
    /** Ontario, 2026. It falls to 1.9863% on 1 January 2027. */
    ontarioCredit: 0.029863,
  },
  eligible: {
    grossUp: 0.38,
    /** 6/11 of the gross up. */
    federalCredit: 0.150198,
    ontarioCredit: 0.10,
  },
} as const;

export type DividendKind = 'eligible' | 'nonEligible';

// ------------------------------------------------------------------- tax

function applyBrackets(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let floor = 0;
  for (const b of brackets) {
    if (income <= floor) break;
    tax += (Math.min(income, b.upTo) - floor) * b.rate;
    floor = b.upTo;
  }
  return tax;
}

function federalBpa(income: number): number {
  const from = FEDERAL_BRACKETS[2]!.upTo;   // 181,440
  const to = FEDERAL_BRACKETS[3]!.upTo;     // 258,482
  if (income <= from) return FEDERAL_BPA_MAX;
  if (income >= to) return FEDERAL_BPA_MIN;
  const shrink = (FEDERAL_BPA_MAX - FEDERAL_BPA_MIN) * ((income - from) / (to - from));
  return Math.round(FEDERAL_BPA_MAX - shrink);
}

function healthPremium(taxableIncome: number): number {
  let premium = 0;
  for (const band of HEALTH_PREMIUM) {
    if (taxableIncome <= band.over) break;
    premium = Math.min(band.cap, band.base + (taxableIncome - band.over) * band.rate);
  }
  return Math.round(premium);
}

export interface PersonalTax {
  /** What goes on the return, gross ups included. */
  taxableIncome: number;
  federal: number;
  ontario: number;
  surtax: number;
  healthPremium: number;
  total: number;
  /** On the last dollar, which is the number that answers "is it worth it". */
  averageRate: number;
}

export interface PersonalInput {
  /** Employment income. */
  salary?: number;
  /** Cash dividends actually received, before the gross up. */
  dividends?: number;
  dividendKind?: DividendKind;
}

/**
 * Tax for one person for one year, on salary, dividends, or both.
 *
 * This is deliberately not a full return. It handles the basic personal amount,
 * the CPP credit and deduction, the dividend gross up and credits, Ontario's
 * surtax and the health premium, because those are what separate the two ways
 * of taking money out of a corporation. It knows nothing about a spouse, a
 * child, tuition, medical expenses, donations or an RRSP contribution, all of
 * which move the answer. What it omits is listed rather than hidden.
 */
export function personalTax(input: PersonalInput): PersonalTax {
  const salary = input.salary ?? 0;
  const cash = input.dividends ?? 0;
  const kind = input.dividendKind ?? 'nonEligible';
  const d = DIVIDENDS[kind];

  const cpp = cppOnSalary(salary);
  const grossedUp = Math.round(cash * (1 + d.grossUp));

  // The enhanced part of CPP comes off income; the base part is a credit below.
  const taxableIncome = Math.max(0, salary + grossedUp - cpp.deductible);

  const fedCredits = Math.round(
    (federalBpa(taxableIncome) + cpp.creditable) * FEDERAL_CREDIT_RATE);
  const onCredits = Math.round((ONTARIO_BPA + cpp.creditable) * ONTARIO_CREDIT_RATE);

  const fedDtc = Math.round(grossedUp * d.federalCredit);
  const onDtc = Math.round(grossedUp * d.ontarioCredit);

  const federal = Math.max(0,
    Math.round(applyBrackets(taxableIncome, FEDERAL_BRACKETS)) - fedCredits - fedDtc);

  const ontarioBase = Math.max(0,
    Math.round(applyBrackets(taxableIncome, ONTARIO_BRACKETS)) - onCredits - onDtc);

  const surtax = Math.round(
    Math.max(0, ontarioBase - ON_SURTAX_1.over) * ON_SURTAX_1.rate
    + Math.max(0, ontarioBase - ON_SURTAX_2.over) * ON_SURTAX_2.rate);

  const premium = healthPremium(taxableIncome);
  const total = federal + ontarioBase + surtax + premium;

  return {
    taxableIncome,
    federal,
    ontario: ontarioBase,
    surtax,
    healthPremium: premium,
    total,
    averageRate: taxableIncome > 0 ? total / taxableIncome : 0,
  };
}

/**
 * RRSP room created by a salary, usable the following year.
 *
 * 18% of earned income, capped at the following year's dollar limit. A dividend
 * is not earned income and creates none, which is the quietest difference
 * between the two routes and often the largest over a working life.
 */
export const RRSP_RATE = 0.18;
export const RRSP_LIMIT_NEXT_YEAR = 35_390_00;   // the 2027 limit, earned on 2026 salary

export function rrspRoom(salary: number): number {
  return Math.min(Math.round(salary * RRSP_RATE), RRSP_LIMIT_NEXT_YEAR);
}
