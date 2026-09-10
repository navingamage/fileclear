import type { CompanyProfile } from './profile';
import {
  personalTax, cppOnSalary, rrspRoom, CPP, EI, RATE_YEAR, DIVIDENDS,
  type DividendKind,
} from './personal';
import { ON_LOWER, FEDERAL_ABATEMENT, FEDERAL_BASIC, SBD_RATE } from './t2';

/**
 * Salary against dividends, with the arithmetic for both.
 *
 * This is the question every owner of a small corporation asks and almost
 * nobody answers with numbers. The usual answers are folklore: "dividends are
 * cheaper", "salary builds RRSP room". Both are sometimes true. Which one is
 * true for a particular person in a particular year depends on how much is
 * being taken out, and the only way to know is to compute both.
 *
 * FileClear computes both and stops. It does not print a recommendation,
 * because the difference is often small enough that the things tax arithmetic
 * cannot see decide it: whether you want CPP in thirty years, whether you need
 * RRSP room, whether a mortgage lender wants to see employment income. Showing
 * the numbers is a tool. Printing an answer is advice, and advice is what this
 * product deliberately does not give.
 */

export interface Route {
  /** What the corporation gives up in total, its own tax included. */
  costToCorporation: number;
  /** Corporate tax paid on the way. */
  corporateTax: number;
  /** Salary paid, if this is the salary route. */
  salary: number;
  /** Employer CPP, which is a real cost of paying a salary. */
  employerCpp: number;
  /** Cash dividend declared, if this is the dividend route. */
  dividend: number;
  /** Employee CPP withheld. */
  employeeCpp: number;
  /** Personal tax on it. */
  personalTax: number;
  /** What actually reaches the person's bank account. */
  netToPerson: number;
  /**
   * Tax proper: corporate plus personal, and nothing else.
   *
   * CPP is kept out of this on purpose. It leaves the same bank account on the
   * same day, but it buys a pension rather than paying for roads, and folding
   * it into a tax rate makes salary look worse than it is. It is reported
   * beside this, not inside it.
   */
  totalTax: number;
  /** Both halves of CPP. Money out, but not tax. */
  cppTotal: number;
  /** Tax and CPP together, which is what actually leaves. */
  totalOut: number;
  /** Tax proper as a share of what the corporation gave up. */
  effectiveRate: number;
  /** RRSP room created, usable next year. */
  rrspRoom: number;
}

export interface Comparison {
  year: number;
  /** What the corporation has available to distribute, before any tax. */
  available: number;
  salary: Route;
  dividend: Route;
  /** Positive when salary leaves more in the person's hands. */
  salaryAdvantage: number;
  /**
   * Positive when salary costs less in tax proper.
   *
   * This routinely points the opposite way to the cash gap, and that is the
   * most useful thing on the page: salary is often cheaper in tax while
   * dividends still leave more cash, because CPP came out of the salary. One
   * number without the other tells half the story.
   */
  salaryTaxAdvantage: number;
  /**
   * How much of the cash gap is CPP rather than tax.
   *
   * Without this the comparison reads as "dividends win", when a good part of
   * the difference is a pension contribution the salary route made and the
   * dividend route did not.
   */
  gapFromCpp: number;
  /** What the arithmetic cannot see. */
  considerations: string[];
  caveats: string[];
}

/** The corporate rate on income that is not paid out as salary. */
function corporateRate(p: CompanyProfile): number {
  const federal = p.isCCPC && p.claimsSmallBusinessDeduction
    ? FEDERAL_BASIC - FEDERAL_ABATEMENT - SBD_RATE   // 9%
    : FEDERAL_BASIC - FEDERAL_ABATEMENT - 0.13;      // 15%
  const ontario = p.isCCPC && p.claimsSmallBusinessDeduction ? ON_LOWER : 0.115;
  return federal + ontario;
}

/**
 * A salary and its employer CPP have to add up to what is available, and the
 * employer CPP depends on the salary, so the split is solved rather than
 * calculated. Contributions stop at the ceiling, which makes the relationship
 * piecewise and not worth inverting by hand.
 *
 * Bisection, to the cent. Twenty five rounds covers any salary a private
 * corporation will ever pay.
 */
function salaryWithin(available: number): number {
  let low = 0;
  let high = available;
  for (let i = 0; i < 25; i++) {
    const mid = Math.floor((low + high) / 2);
    if (mid + cppOnSalary(mid).employer <= available) low = mid;
    else high = mid;
  }
  return low;
}

export function compareCompensation(
  p: CompanyProfile, available: number, dividendKind: DividendKind = 'nonEligible',
): Comparison {
  // ------------------------------------------------------------- salary
  //
  // A salary is deductible, so the corporation pays no tax on what it pays out.
  // What it does pay is the employer half of CPP, which is a cost with no
  // equivalent on the dividend side.
  const salary = salaryWithin(available);
  const cpp = cppOnSalary(salary);
  const salaryTax = personalTax({ salary });

  const salaryRoute: Route = {
    costToCorporation: salary + cpp.employer,
    corporateTax: 0,
    salary,
    employerCpp: cpp.employer,
    dividend: 0,
    employeeCpp: cpp.employee,
    personalTax: salaryTax.total,
    netToPerson: salary - cpp.employee - salaryTax.total,
    totalTax: salaryTax.total,
    cppTotal: cpp.employee + cpp.employer,
    totalOut: salaryTax.total + cpp.employee + cpp.employer,
    effectiveRate: 0,
    rrspRoom: rrspRoom(salary),
  };
  salaryRoute.effectiveRate = available > 0 ? salaryRoute.totalTax / available : 0;

  // ----------------------------------------------------------- dividend
  //
  // A dividend is not deductible, so the corporation is taxed first and pays
  // the dividend out of what is left. The gross up and credit on the personal
  // return exist to cancel that first layer out, which is why the two routes
  // land close together rather than one being obviously cheaper.
  const rate = corporateRate(p);
  const corporateTax = Math.round(available * rate);
  const dividend = available - corporateTax;
  const dividendTax = personalTax({ dividends: dividend, dividendKind });

  const dividendRoute: Route = {
    costToCorporation: available,
    corporateTax,
    salary: 0,
    employerCpp: 0,
    dividend,
    employeeCpp: 0,
    personalTax: dividendTax.total,
    netToPerson: dividend - dividendTax.total,
    totalTax: corporateTax + dividendTax.total,
    cppTotal: 0,
    totalOut: corporateTax + dividendTax.total,
    effectiveRate: available > 0 ? (corporateTax + dividendTax.total) / available : 0,
    rrspRoom: 0,
  };

  // ------------------------------------------------------- what is not tax
  const considerations: string[] = [];

  if (salaryRoute.rrspRoom > 0) {
    considerations.push(
      `A salary creates ${money(salaryRoute.rrspRoom)} of RRSP room for next year. `
      + 'A dividend creates none, because it is not earned income. Over a working '
      + 'life this is often larger than the difference in tax.');
  }

  if (cpp.employee > 0) {
    considerations.push(
      `CPP costs ${money(cpp.employee + cpp.employer)} across both halves and buys a `
      + 'pension. Whether that is a cost or a purchase depends on what you would '
      + 'otherwise do with the money, which is not a tax question.');
  }

  considerations.push(
    'A salary has to be reasonable for work actually done, and it needs a payroll '
    + 'account, source deductions remitted monthly and a T4 by the end of February. '
    + 'A dividend needs a T5 and a directors resolution, and no remittances.');

  considerations.push(
    'Lenders underwrite employment income more readily than dividends. If a '
    + 'mortgage is anywhere in the next two years, that can outweigh the arithmetic.');

  if (p.isCCPC && p.claimsSmallBusinessDeduction && dividendKind === 'nonEligible') {
    considerations.push(
      'Paying a salary reduces the corporation\'s income, which can keep it under '
      + 'the $500,000 business limit and preserve the small business rate on the rest.');
  }

  // ------------------------------------------------------------- caveats
  const caveats: string[] = [
    `${RATE_YEAR} rates, Ontario, one person with no other income. Another source of `
    + 'income moves both columns, and not by the same amount.',
    'The only personal credits applied are the basic personal amount and CPP. A '
    + 'spouse, children, tuition, medical expenses, donations or an RRSP contribution '
    + 'all change the answer and none of them are here.',
  ];

  if (dividendKind === 'nonEligible') {
    caveats.push(
      'Non-eligible dividends, which is what a corporation paying the small business '
      + `rate pays. Ontario's credit on them is ${(DIVIDENDS.nonEligible.ontarioCredit * 100).toFixed(4)}% `
      + 'for 2026 and drops to 1.9863% on 1 January 2027, so the same dividend costs '
      + 'more next year.');
  }

  caveats.push(
    `No EI either way: someone holding more than 40% of the voting shares is not in `
    + `insurable employment. That saves ${money(EI.maxPremium)} at the maximum and also `
    + 'means no parental or sickness benefits.');

  if (salary >= CPP.yampe) {
    caveats.push('The salary is above the CPP2 ceiling, so contributions are maxed and '
      + 'further salary carries no more CPP.');
  }

  return {
    year: RATE_YEAR,
    available,
    salary: salaryRoute,
    dividend: dividendRoute,
    salaryAdvantage: salaryRoute.netToPerson - dividendRoute.netToPerson,
    salaryTaxAdvantage: dividendRoute.totalTax - salaryRoute.totalTax,
    gapFromCpp: salaryRoute.cppTotal,
    considerations,
    caveats,
  };
}

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `$${sign}${Math.floor(abs / 100).toLocaleString('en-CA')}`;
}
