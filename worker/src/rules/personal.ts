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
 * Every figure here was read off CRA's payroll formulas (T4127) and its
 * published limits rather than recalled, one set per tax year. Rates move
 * every January, and in 2025 the lowest federal rate moved in July as well, so
 * a slip or a return for 2025 worked out with 2026 figures is a wrong answer
 * that looks authoritative. Each calculation takes the year it is for.
 *
 * Money is in cents throughout.
 */

export interface Bracket {
  /** Cents. Income above this is taxed at `rate` until the next bracket. */
  upTo: number;
  rate: number;
}

export interface TaxTables {
  year: number;
  federalBrackets: Bracket[];
  ontarioBrackets: Bracket[];
  /**
   * The federal basic personal amount, clawed back across the fourth bracket
   * from the maximum to the minimum. Ontario's is flat.
   */
  federalBpaMax: number;
  federalBpaMin: number;
  ontarioBpa: number;
  /** The rate non-refundable credits are worth, which is the lowest bracket. */
  federalCreditRate: number;
  ontarioCreditRate: number;
  /**
   * Ontario's surtax. A tax on the tax, which is why Ontario's headline rates
   * understate what a higher earner actually pays.
   */
  onSurtax1: { over: number; rate: number };
  onSurtax2: { over: number; rate: number };
  cpp: {
    /** Year's maximum pensionable earnings. */
    ympe: number;
    /** Year's additional maximum pensionable earnings, the CPP2 ceiling. */
    yampe: number;
    exemption: number;
    rate: number;
    maxContribution: number;
    rate2: number;
    maxContribution2: number;
    /**
     * The base 4.95 points earn a tax credit; the 1.00 point of enhancement,
     * and all of CPP2, are deducted from income instead. Two different
     * mechanisms inside one contribution, which is why this cannot be treated
     * as one number.
     */
    baseRate: number;
  };
  /**
   * EI premiums.
   *
   * The employer pays 1.4 times what the employee does, which makes EI the
   * most lopsided of the payroll taxes and a real cost of hiring somebody at
   * arm's length. An owner manager pays none of it.
   */
  ei: {
    rate: number;
    maxInsurable: number;
    maxPremium: number;
    /** The employer's share is a multiple of the employee's, not a rate of its own. */
    employerMultiple: number;
  };
  /** The RRSP dollar limit for the following year, which this year's income earns room toward. */
  rrspLimitNextYear: number;
}

/** Surtax rates have not moved; the thresholds are indexed. */
const surtax = (first: number, second: number) => ({
  onSurtax1: { over: first, rate: 0.20 },
  onSurtax2: { over: second, rate: 0.36 },
});

/**
 * One set of figures per tax year.
 *
 * 2024: T4127 119th edition. 2025: T4127 120th and 121st editions, with the
 * lowest federal rate at 14.5%, which is 15% for January to June and 14% from
 * July averaged over the year, as the 2025 return applies it. 2026: T4127
 * 122nd edition, where the lowest rate is 14% for the whole year under Bill
 * C-4. RRSP limits and CPP ceilings from CRA's table of limits by year.
 */
export const TABLES: Record<number, TaxTables> = {
  2024: {
    year: 2024,
    federalBrackets: [
      { upTo: 55_867_00, rate: 0.15 },
      { upTo: 111_733_00, rate: 0.205 },
      { upTo: 173_205_00, rate: 0.26 },
      { upTo: 246_752_00, rate: 0.29 },
      { upTo: Infinity, rate: 0.33 },
    ],
    ontarioBrackets: [
      { upTo: 51_446_00, rate: 0.0505 },
      { upTo: 102_894_00, rate: 0.0915 },
      { upTo: 150_000_00, rate: 0.1116 },
      { upTo: 220_000_00, rate: 0.1216 },
      { upTo: Infinity, rate: 0.1316 },
    ],
    federalBpaMax: 15_705_00, federalBpaMin: 14_156_00, ontarioBpa: 12_399_00,
    federalCreditRate: 0.15, ontarioCreditRate: 0.0505,
    ...surtax(5_554_00, 7_108_00),
    cpp: {
      ympe: 68_500_00, yampe: 73_200_00, exemption: 3_500_00,
      rate: 0.0595, maxContribution: 3_867_50, rate2: 0.04, maxContribution2: 188_00,
      baseRate: 0.0495,
    },
    ei: { rate: 0.0166, maxInsurable: 63_200_00, maxPremium: 1_049_12, employerMultiple: 1.4 },
    rrspLimitNextYear: 32_490_00,
  },
  2025: {
    year: 2025,
    federalBrackets: [
      { upTo: 57_375_00, rate: 0.145 },
      { upTo: 114_750_00, rate: 0.205 },
      { upTo: 177_882_00, rate: 0.26 },
      { upTo: 253_414_00, rate: 0.29 },
      { upTo: Infinity, rate: 0.33 },
    ],
    ontarioBrackets: [
      { upTo: 52_886_00, rate: 0.0505 },
      { upTo: 105_775_00, rate: 0.0915 },
      { upTo: 150_000_00, rate: 0.1116 },
      { upTo: 220_000_00, rate: 0.1216 },
      { upTo: Infinity, rate: 0.1316 },
    ],
    federalBpaMax: 16_129_00, federalBpaMin: 14_538_00, ontarioBpa: 12_747_00,
    federalCreditRate: 0.145, ontarioCreditRate: 0.0505,
    ...surtax(5_710_00, 7_307_00),
    cpp: {
      ympe: 71_300_00, yampe: 81_200_00, exemption: 3_500_00,
      rate: 0.0595, maxContribution: 4_034_10, rate2: 0.04, maxContribution2: 396_00,
      baseRate: 0.0495,
    },
    ei: { rate: 0.0164, maxInsurable: 65_700_00, maxPremium: 1_077_48, employerMultiple: 1.4 },
    rrspLimitNextYear: 33_810_00,
  },
  2026: {
    year: 2026,
    federalBrackets: [
      { upTo: 58_523_00, rate: 0.14 },
      { upTo: 117_045_00, rate: 0.205 },
      { upTo: 181_440_00, rate: 0.26 },
      { upTo: 258_482_00, rate: 0.29 },
      { upTo: Infinity, rate: 0.33 },
    ],
    ontarioBrackets: [
      { upTo: 53_891_00, rate: 0.0505 },
      { upTo: 107_785_00, rate: 0.0915 },
      { upTo: 150_000_00, rate: 0.1116 },
      { upTo: 220_000_00, rate: 0.1216 },
      { upTo: Infinity, rate: 0.1316 },
    ],
    federalBpaMax: 16_452_00, federalBpaMin: 14_829_00, ontarioBpa: 12_989_00,
    federalCreditRate: 0.14, ontarioCreditRate: 0.0505,
    ...surtax(5_818_00, 7_446_00),
    cpp: {
      ympe: 74_600_00, yampe: 85_000_00, exemption: 3_500_00,
      rate: 0.0595, maxContribution: 4_230_45, rate2: 0.04, maxContribution2: 416_00,
      baseRate: 0.0495,
    },
    ei: { rate: 0.0163, maxInsurable: 68_900_00, maxPremium: 1_123_07, employerMultiple: 1.4 },
    rrspLimitNextYear: 35_390_00,
  },
};

/** The latest year with tables, and the default for anything forward looking. */
export const RATE_YEAR = 2026;

/** Whether FileClear holds the real figures for a tax year. */
export const hasTables = (year: number): boolean => year in TABLES;

/**
 * The tables for a year, or the nearest year held when there are none.
 *
 * Nearest rather than a refusal, because a screen for 2023 is still more use
 * with 2024 figures and a warning than with nothing. The returned `year` says
 * which set was used, and every screen that shows a past year checks it and
 * says so when it differs.
 */
export function tablesFor(year: number = RATE_YEAR): TaxTables {
  const held = Object.keys(TABLES).map(Number);
  const nearest = Math.min(Math.max(year, Math.min(...held)), Math.max(...held));
  return TABLES[nearest]!;
}

// The current year's figures under their old names, for the screens that look
// forward rather than back: the salary and dividend comparison, and whether to
// incorporate.
const CURRENT = TABLES[RATE_YEAR]!;
export const FEDERAL_BRACKETS = CURRENT.federalBrackets;
export const ONTARIO_BRACKETS = CURRENT.ontarioBrackets;
export const FEDERAL_BPA_MAX = CURRENT.federalBpaMax;
export const FEDERAL_BPA_MIN = CURRENT.federalBpaMin;
export const ONTARIO_BPA = CURRENT.ontarioBpa;
export const FEDERAL_CREDIT_RATE = CURRENT.federalCreditRate;
export const ONTARIO_CREDIT_RATE = CURRENT.ontarioCreditRate;
export const ON_SURTAX_1 = CURRENT.onSurtax1;
export const ON_SURTAX_2 = CURRENT.onSurtax2;
export const CPP = CURRENT.cpp;
export const EI = CURRENT.ei;

/**
 * The Ontario Health Premium, a flat schedule on taxable income. Not indexed,
 * so one schedule serves every year.
 */
const HEALTH_PREMIUM: { over: number; base: number; rate: number; cap: number }[] = [
  { over: 20_000_00, base: 0, rate: 0.06, cap: 300_00 },
  { over: 36_000_00, base: 300_00, rate: 0.06, cap: 450_00 },
  { over: 48_000_00, base: 450_00, rate: 0.25, cap: 600_00 },
  { over: 72_000_00, base: 600_00, rate: 0.25, cap: 750_00 },
  { over: 200_000_00, base: 750_00, rate: 0.25, cap: 900_00 },
];

/** Employee EI on a year's insurable earnings. */
export function eiOnSalary(salary: number, insurable: boolean, year = RATE_YEAR): {
  employee: number; employer: number; insurableEarnings: number;
} {
  if (!insurable) return { employee: 0, employer: 0, insurableEarnings: 0 };
  const ei = tablesFor(year).ei;
  const insurableEarnings = Math.min(salary, ei.maxInsurable);
  const employee = Math.min(Math.round(insurableEarnings * ei.rate), ei.maxPremium);
  return {
    employee,
    employer: Math.round(employee * ei.employerMultiple),
    insurableEarnings,
  };
}

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

export function cppOnSalary(salary: number, year = RATE_YEAR): CppOnSalary {
  const CPP = tablesFor(year).cpp;
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

function federalBpa(income: number, t: TaxTables): number {
  const from = t.federalBrackets[2]!.upTo;   // 181,440 in 2026
  const to = t.federalBrackets[3]!.upTo;     // 258,482 in 2026
  if (income <= from) return t.federalBpaMax;
  if (income >= to) return t.federalBpaMin;
  const shrink = (t.federalBpaMax - t.federalBpaMin) * ((income - from) / (to - from));
  return Math.round(t.federalBpaMax - shrink);
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
  /**
   * Whether the employment is insurable, which decides EI.
   *
   * Defaults to false, because FileClear was built for owner managers and
   * somebody holding more than 40% of the voting shares is not in insurable
   * employment. An arm's length employee has to say so.
   */
  insurable?: boolean;
  /** The tax year. The current one when left out. */
  year?: number;
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

  const cpp = cppOnSalary(salary, input.year);
  const ei = eiOnSalary(salary, input.insurable ?? false, input.year);
  const grossedUp = Math.round(cash * (1 + d.grossUp));

  return taxOnTaxableIncome({
    // The enhanced part of CPP comes off income; the base part is a credit.
    taxableIncome: Math.max(0, salary + grossedUp - cpp.deductible),
    // EI premiums earn a credit in full, unlike CPP where only the base part does.
    creditableAmounts: cpp.creditable + ei.employee,
    grossedUpDividends: grossedUp,
    dividendKind: kind,
    year: input.year,
  });
}

/**
 * Tax on an amount of taxable income, given what else earns a credit.
 *
 * Extracted so that self-employment income goes through exactly the same
 * brackets, basic personal amount, surtax and health premium as a salary,
 * differing only in the two places it genuinely differs: the CPP contribution
 * is twice as large, and its deductible and creditable halves are split
 * differently. Computing that by running the salary calculation and then
 * unpicking its CPP was the alternative, and it was the kind of arithmetic that
 * is correct until somebody edits either end of it.
 */
export function taxOnTaxableIncome(input: {
  taxableIncome: number;
  /** Amounts that earn a non-refundable credit at the lowest rate, beyond the BPA. */
  creditableAmounts?: number;
  grossedUpDividends?: number;
  dividendKind?: DividendKind;
  year?: number;
}): PersonalTax {
  const t = tablesFor(input.year);
  const taxableIncome = Math.max(0, input.taxableIncome);
  const creditable = input.creditableAmounts ?? 0;
  const grossedUp = input.grossedUpDividends ?? 0;
  const d = DIVIDENDS[input.dividendKind ?? 'nonEligible'];

  const fedCredits = Math.round(
    (federalBpa(taxableIncome, t) + creditable) * t.federalCreditRate);
  const onCredits = Math.round((t.ontarioBpa + creditable) * t.ontarioCreditRate);

  const fedDtc = Math.round(grossedUp * d.federalCredit);
  const onDtc = Math.round(grossedUp * d.ontarioCredit);

  const federal = Math.max(0,
    Math.round(applyBrackets(taxableIncome, t.federalBrackets)) - fedCredits - fedDtc);

  const ontarioBase = Math.max(0,
    Math.round(applyBrackets(taxableIncome, t.ontarioBrackets)) - onCredits - onDtc);

  const onSurtax = Math.round(
    Math.max(0, ontarioBase - t.onSurtax1.over) * t.onSurtax1.rate
    + Math.max(0, ontarioBase - t.onSurtax2.over) * t.onSurtax2.rate);

  const premium = healthPremium(taxableIncome);
  const total = federal + ontarioBase + onSurtax + premium;

  return {
    taxableIncome,
    federal,
    ontario: ontarioBase,
    surtax: onSurtax,
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
/** The 2027 limit, earned on 2026 salary. */
export const RRSP_LIMIT_NEXT_YEAR = CURRENT.rrspLimitNextYear;

export function rrspRoom(salary: number, year = RATE_YEAR): number {
  return Math.min(Math.round(salary * RRSP_RATE), tablesFor(year).rrspLimitNextYear);
}
