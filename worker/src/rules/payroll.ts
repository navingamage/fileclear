import { personalTax, cppOnSalary, CPP, EI } from './personal';
import type { RemitterType } from './profile';

/**
 * What to withhold from a pay cheque, and what to send CRA afterwards.
 *
 * A director who pays themselves a salary is running a payroll, whether or not
 * they think of it that way. Every payment carries three obligations: income
 * tax withheld, CPP withheld, and the employer's matching CPP. All three go to
 * CRA together on a PD7A, and being late on that is one of the more expensive
 * mistakes available to a small corporation, because the penalty is a
 * percentage of the whole remittance rather than of the amount that was short.
 *
 * The obligation engine already knows when a remittance is due. This works out
 * what goes on it.
 */

export type PayFrequency = 'monthly' | 'semi-monthly' | 'biweekly' | 'weekly';

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  monthly: 12,
  'semi-monthly': 24,
  biweekly: 26,
  weekly: 52,
};

export interface PayPeriodDeductions {
  frequency: PayFrequency;
  periods: number;
  /** Gross pay for one period. */
  gross: number;
  /** Income tax withheld, federal and Ontario together, as CRA's tables do. */
  incomeTax: number;
  /** Employee CPP for the period. */
  cpp: number;
  /** Employee CPP2, once the first ceiling is passed. */
  cpp2: number;
  /** Employer's matching contribution, which is a cost rather than a withholding. */
  employerCpp: number;
  /** What the employee actually receives. */
  netPay: number;
  /** What goes to CRA for this period: tax plus both halves of CPP. */
  remittance: number;
}

/**
 * Deductions for one pay period of an annual salary.
 *
 * CRA's own payroll formula annualises a period's pay, computes the tax on the
 * year, and divides back down. That is what happens here, so the twelve
 * withholdings add up to the year's tax rather than drifting and leaving a
 * balance owing in April.
 *
 * The CPP exemption is prorated across periods, which is what makes a monthly
 * contribution slightly different from a twelfth of the annual one.
 *
 * EI is absent on purpose. Someone holding more than 40% of the voting shares
 * is not in insurable employment, and FileClear is built for owner managed
 * corporations. An arm's length employee is a different calculation and this
 * function would be wrong for one.
 */
export function deductionsFor(
  annualSalary: number, frequency: PayFrequency = 'monthly',
): PayPeriodDeductions {
  const periods = PERIODS_PER_YEAR[frequency];
  const gross = Math.round(annualSalary / periods);

  const annualTax = personalTax({ salary: annualSalary }).total;
  const incomeTax = Math.round(annualTax / periods);

  // Prorated exemption, capped at the annual maximum, exactly as payroll runs.
  const periodExemption = CPP.exemption / periods;
  const pensionable = Math.max(0, Math.min(gross, CPP.ympe / periods) - periodExemption);
  const cpp = Math.min(
    Math.round(pensionable * CPP.rate),
    Math.round(CPP.maxContribution / periods));

  const over = Math.max(0, Math.min(gross, CPP.yampe / periods) - CPP.ympe / periods);
  const cpp2 = Math.min(
    Math.round(over * CPP.rate2),
    Math.round(CPP.maxContribution2 / periods));

  const employerCpp = cpp + cpp2;

  return {
    frequency, periods, gross, incomeTax, cpp, cpp2, employerCpp,
    netPay: gross - incomeTax - cpp - cpp2,
    remittance: incomeTax + cpp + cpp2 + employerCpp,
  };
}

// ------------------------------------------------------------- remittances

/**
 * Which remitter a corporation is, from what it actually withholds.
 *
 * CRA assigns this from the average monthly withholding amount, and moves an
 * employer between categories without much warning. Working it out from the
 * numbers means a corporation can see a change coming instead of discovering it
 * from a penalty.
 */
export const AMWA_BANDS = {
  quarterly: 3_000_00,
  regular: 25_000_00,
  accelerated1: 100_000_00,
} as const;

export function remitterFrom(averageMonthlyWithholding: number): RemitterType {
  if (averageMonthlyWithholding < AMWA_BANDS.quarterly) return 'quarterly';
  if (averageMonthlyWithholding < AMWA_BANDS.regular) return 'regular';
  if (averageMonthlyWithholding < AMWA_BANDS.accelerated1) return 'accelerated1';
  return 'accelerated2';
}

export interface RemitterAdvice {
  current: RemitterType;
  /** What the numbers say it should be. */
  indicated: RemitterType;
  averageMonthlyWithholding: number;
  /** Set when the two disagree, which is a change worth expecting. */
  warning?: string;
}

const REMITTER_LABEL: Record<RemitterType, string> = {
  quarterly: 'quarterly',
  regular: 'regular, monthly',
  accelerated1: 'accelerated threshold 1, twice a month',
  accelerated2: 'accelerated threshold 2, four times a month',
};

export function remitterAdvice(
  current: RemitterType, annualWithholding: number, monthsWithPayroll = 12,
): RemitterAdvice {
  const amwa = monthsWithPayroll > 0
    ? Math.round(annualWithholding / Math.min(12, monthsWithPayroll))
    : 0;
  const indicated = remitterFrom(amwa);

  const advice: RemitterAdvice = {
    current, indicated, averageMonthlyWithholding: amwa,
  };

  if (indicated !== current) {
    // Quarterly is the one category a corporation cannot simply fall into: it
    // needs a clean compliance history as well as small numbers.
    advice.warning = indicated === 'quarterly'
      ? 'These numbers would qualify for quarterly remitting, which also needs twelve '
        + 'months of history and a perfect compliance record. CRA decides, and it will '
        + 'write to you rather than the other way round.'
      : `Withholding averages ${money(amwa)} a month, which is ${REMITTER_LABEL[indicated]} `
        + `territory rather than ${REMITTER_LABEL[current]}. CRA reassigns remitters on `
        + 'its own schedule, so expect a letter and do not change the frequency until it '
        + 'arrives.';
  }
  return advice;
}

/**
 * When a remittance for a payment made on `payDate` is due.
 *
 * Only the two categories a small corporation is actually in are computed.
 * Accelerated remitters are told to check rather than given a date that might
 * be wrong: at that size the payroll is not being run out of this product.
 */
export function remittanceDue(payDate: string, remitter: RemitterType): string | null {
  const [y, m, d] = payDate.split('-').map(Number) as [number, number, number];

  if (remitter === 'regular') {
    return iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 15);
  }

  if (remitter === 'quarterly') {
    // Quarters end March, June, September and December; each is due the
    // fifteenth of the following month.
    const quarterEndMonth = Math.ceil(m / 3) * 3;
    return iso(quarterEndMonth === 12 ? y + 1 : y,
      quarterEndMonth === 12 ? 1 : quarterEndMonth + 1, 15);
  }

  if (remitter === 'accelerated1') {
    // Paid in the first half, due the twenty fifth of the same month; paid in
    // the second half, due the tenth of the next.
    return d <= 15 ? iso(y, m, 25) : iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 10);
  }

  return null;   // threshold 2 is three working days after each quarter month
}

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * The penalty for remitting late, which is why this matters more than it looks.
 *
 * It is a percentage of the whole remittance, not of any shortfall, so being a
 * day late on a $4,000 remittance costs $120 rather than a few dollars of
 * interest.
 */
export const LATE_REMITTANCE_PENALTY = [
  { lateDays: 3, rate: 0.03 },
  { lateDays: 5, rate: 0.05 },
  { lateDays: 7, rate: 0.07 },
  { lateDays: Infinity, rate: 0.10 },
];

export function latePenalty(remittance: number, daysLate: number): number {
  if (daysLate <= 0) return 0;
  const band = LATE_REMITTANCE_PENALTY.find((b) => daysLate <= b.lateDays)!;
  return Math.round(remittance * band.rate);
}

/** EI, kept here so a future arm's length employee has somewhere to start. */
export const EI_RATES = EI;

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `$${sign}${Math.floor(abs / 100).toLocaleString('en-CA')}`;
}

/** Re-exported so a caller does not need two imports to reconcile a year. */
export { cppOnSalary };
