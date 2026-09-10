import { personalTax, cppOnSalary, eiOnSalary, CPP, EI, EI_CONTROL_THRESHOLD } from './personal';
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
  /** Employee EI, zero unless the employment is insurable. */
  ei: number;
  /** The employer's EI, which is 1.4 times the employee's rather than equal to it. */
  employerEi: number;
  /** What the employee actually receives. */
  netPay: number;
  /** What goes to CRA for this period: tax, both halves of CPP, both halves of EI. */
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
 * EI depends on whether the employment is insurable, which is why it has to be
 * asked rather than assumed. An owner manager holding more than 40% of the
 * voting shares is not insurable and pays none; an arm's length employee is,
 * and the employer pays 1.4 times what they do on top.
 */
export function deductionsFor(
  annualSalary: number, frequency: PayFrequency = 'monthly', insurable = false,
): PayPeriodDeductions {
  const periods = PERIODS_PER_YEAR[frequency];
  const gross = Math.round(annualSalary / periods);

  const annualTax = personalTax({ salary: annualSalary, insurable }).total;
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

  // EI has no exemption and no proration: it is a flat rate on every insurable
  // dollar until the annual ceiling, which makes the period calculation the
  // simpler of the two.
  const annualEi = eiOnSalary(annualSalary, insurable);
  const ei = Math.round(annualEi.employee / periods);
  const employerEi = Math.round(annualEi.employer / periods);

  return {
    frequency, periods, gross, incomeTax, cpp, cpp2, employerCpp, ei, employerEi,
    netPay: gross - incomeTax - cpp - cpp2 - ei,
    remittance: incomeTax + cpp + cpp2 + employerCpp + ei + employerEi,
  };
}

// --------------------------------------------------------------- employees

export interface Employee {
  id: string;
  name: string;
  annualSalary: number;
  /**
   * Voting shares held, as a percentage.
   *
   * This is what decides insurability, and it is a fact about the share
   * register rather than a preference. Over 40% and the employment is excluded
   * from EI whatever anybody would prefer.
   */
  votingSharePct: number;
  frequency: PayFrequency;
}

/**
 * Whether a person's employment is insurable.
 *
 * The share test is the bright line and the only one FileClear applies. There
 * is a second exclusion for people who do not deal at arm's length with the
 * employer, a spouse or a child on the payroll, and it turns on whether the
 * terms of employment are substantially what they would be between strangers.
 * That is a judgement CRA makes on a ruling request, not something to infer
 * from a percentage, so it is raised as a question rather than answered.
 */
export function isInsurable(e: Employee): boolean {
  return e.votingSharePct <= EI_CONTROL_THRESHOLD * 100;
}

export interface PayrollLine {
  employee: Employee;
  insurable: boolean;
  deductions: PayPeriodDeductions;
  /** Annual figures, for the slips and the reconciliation. */
  annualSalary: number;
}

export interface PayrollRun {
  lines: PayrollLine[];
  /** Total salary cost before the employer's own contributions. */
  totalSalary: number;
  /** One period's remittance across everybody, which is what goes on the PD7A. */
  periodRemittance: number;
  /** The same across a year, which decides the remitter category. */
  annualRemittance: number;
  employerCost: number;
  questions: string[];
}

/**
 * A payroll run across everybody on the register.
 *
 * The remittance is pooled: CRA wants one PD7A per payroll account, not one per
 * person, so the numbers that matter for a due date are the totals.
 */
export function payrollRun(employees: Employee[]): PayrollRun {
  const lines: PayrollLine[] = employees.map((employee) => {
    const insurable = isInsurable(employee);
    return {
      employee,
      insurable,
      deductions: deductionsFor(employee.annualSalary, employee.frequency, insurable),
      annualSalary: employee.annualSalary,
    };
  });

  const totalSalary = lines.reduce((t, l) => t + l.annualSalary, 0);
  const periodRemittance = lines.reduce((t, l) => t + l.deductions.remittance, 0);
  const annualRemittance = lines.reduce(
    (t, l) => t + l.deductions.remittance * l.deductions.periods, 0);
  const employerCost = lines.reduce(
    (t, l) => t + (l.deductions.employerCpp + l.deductions.employerEi) * l.deductions.periods, 0);

  const questions: string[] = [];
  const related = lines.filter((l) => l.insurable && l.employee.votingSharePct > 0);
  if (related.length) {
    questions.push('Somebody on this payroll holds shares and is still being treated as '
      + 'insurable. That is right below 40% of the voting shares, but employment between '
      + 'people who do not deal at arm\'s length can be excluded from EI anyway, on '
      + 'whether the terms are what they would be between strangers. CRA decides that on '
      + 'a ruling request rather than from a percentage.');
  }
  if (lines.some((l) => !l.insurable)) {
    questions.push('Anyone shown as not insurable pays no EI and cannot claim maternity, '
      + 'parental or sickness benefits. That is the trade, and it is not optional.');
  }

  return { lines, totalSalary, periodRemittance, annualRemittance, employerCost, questions };
}

// ------------------------------------------------------- employer health tax

/**
 * Ontario's employer health tax.
 *
 * A payroll tax nobody expects, because it is provincial and has nothing to do
 * with CRA. Most small corporations owe nothing: the first million of
 * remuneration is exempt. The exemption disappears entirely for a group over
 * five million, which is a cliff rather than a taper, and the rate itself
 * climbs in steps up to 1.95%.
 */
export const EHT_EXEMPTION = 1_000_000_00;
export const EHT_EXEMPTION_CUTOFF = 5_000_000_00;
export const EHT_INSTALMENT_THRESHOLD = 1_200_000_00;

const EHT_RATES: { upTo: number; rate: number }[] = [
  { upTo: 200_000_00, rate: 0.0098 },
  { upTo: 230_000_00, rate: 0.01101 },
  { upTo: 260_000_00, rate: 0.01223 },
  { upTo: 290_000_00, rate: 0.01344 },
  { upTo: 320_000_00, rate: 0.01465 },
  { upTo: 350_000_00, rate: 0.01586 },
  { upTo: 380_000_00, rate: 0.01708 },
  { upTo: 400_000_00, rate: 0.01829 },
  { upTo: Infinity, rate: 0.0195 },
];

export interface Eht {
  remuneration: number;
  exemptionClaimed: number;
  taxable: number;
  rate: number;
  tax: number;
  instalmentsRequired: boolean;
  note: string;
}

/**
 * The rate is chosen on total remuneration before the exemption is taken off,
 * and then applied to what is left after it. Applying the rate band to the
 * post exemption figure is the obvious mistake and it understates the tax.
 */
export function ontarioEht(remuneration: number): Eht {
  const eligible = remuneration <= EHT_EXEMPTION_CUTOFF;
  const exemptionClaimed = eligible ? Math.min(EHT_EXEMPTION, remuneration) : 0;
  const taxable = Math.max(0, remuneration - exemptionClaimed);
  const rate = EHT_RATES.find((b) => remuneration <= b.upTo)!.rate;
  const tax = Math.round(taxable * rate);

  const note = eligible
    ? (taxable === 0
      ? `The first ${money(EHT_EXEMPTION)} of Ontario remuneration is exempt, so nothing `
        + 'is owed. The return is still filed, showing nil.'
      : `Remuneration of ${money(remuneration)} sets the rate at ${(rate * 100).toFixed(3)}%, `
        + `applied to what is left after the ${money(EHT_EXEMPTION)} exemption.`)
    : `Over ${money(EHT_EXEMPTION_CUTOFF)} of payroll across the associated group, so no `
      + 'exemption at all. It is a cliff rather than a taper: one dollar over and the whole '
      + 'million goes.';

  return {
    remuneration, exemptionClaimed, taxable, rate, tax,
    instalmentsRequired: remuneration > EHT_INSTALMENT_THRESHOLD,
    note,
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
