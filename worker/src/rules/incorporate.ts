/**
 * Whether incorporating is worth it, with the arithmetic for both sides.
 *
 * This is the question that decides which half of FileClear somebody is a
 * customer of, and it is answered almost everywhere with folklore. "Incorporate
 * once you hit a hundred thousand" is the usual number, repeated without a
 * calculation behind it, and it is right for some people and expensive for
 * others.
 *
 * The same rule that governs the salary and dividend comparison governs this
 * one: compute both, show the arithmetic, and stop. Incorporating is a legal
 * decision with a tax consequence, not a tax decision. Liability, contracts
 * that require a corporation, a partner joining, and the lifetime capital gains
 * exemption on a sale all sit outside anything this can compute, and any one of
 * them can decide it on its own. So this prints two numbers and what is missing
 * from them, never a recommendation.
 *
 * The number that actually matters is not the headline saving.
 *
 * A sole proprietor is taxed on the whole profit whether or not they spend it.
 * A corporation is taxed at the small business rate on what stays inside, and
 * the rest is taxed again when it comes out. So incorporation is not a discount
 * on tax, it is a **deferral** on the part of the profit that is left in the
 * company, and if every dollar is drawn out to live on, the two routes land
 * within a few hundred dollars of each other and the incorporation was bought
 * for its other reasons. That is why `drawnOut` is an input rather than an
 * assumption, and why the comparison is run at several draw levels on screen.
 *
 * Money is in cents throughout.
 */

import { personalTax, cppOnSalary, rrspRoom, type DividendKind } from './personal';
import { selfEmployedYear, cppOnSelfEmployment } from './selfemployed';
import { ON_LOWER, FEDERAL_BASIC, FEDERAL_ABATEMENT, SBD_RATE, BUSINESS_LIMIT } from './t2';

/**
 * Filing and maintaining a corporation costs money that a sole proprietorship
 * does not spend. These are the recurring ones, not the one-off registration,
 * and they are deliberately at the low end: an owner-managed corporation that
 * keeps its own books and files its own T2 through FileClear.
 *
 * A number here that is too high would make the product's own answer flatter
 * itself, so the figure errs the other way.
 */
export const CORPORATION_ANNUAL_COST = 1_500_00;
export const INCORPORATION_ONE_OFF = 500_00;

export interface Side {
  label: string;
  /** Tax paid inside the business, which is nil for a sole proprietorship. */
  businessTax: number;
  /** Tax paid personally on what was taken out or earned. */
  personalTax: number;
  /** CPP, both halves in every case here, because the owner is the employer. */
  cpp: number;
  /** Accounting, filing and registry fees that would not otherwise be paid. */
  runningCost: number;
  /** Tax, CPP and cost together: everything that leaves. */
  totalOut: number;
  /** What reaches the owner's bank account this year. */
  cashInHand: number;
  /** What is still inside the business, already taxed at the corporate rate. */
  retained: number;
  /** RRSP room created for next year. */
  rrspRoom: number;
}

export interface IncorporationComparison {
  year: number;
  /** Profit before the owner takes anything, and before any tax. */
  profit: number;
  /** How much of that profit the owner needs to live on this year. */
  drawnOut: number;
  soleProprietor: Side;
  /** Incorporated, taking the draw as salary. */
  asSalary: Side;
  /** Incorporated, taking the draw as a non-eligible dividend. */
  asDividend: Side;
  /**
   * Positive when the better of the two corporate routes leaves more this year,
   * after the cost of running a corporation.
   *
   * "This year" is doing real work in that sentence. The advantage is mostly
   * tax deferred on retained profit, and the deferral ends when the money comes
   * out, so a large positive number here is not a saving that has been banked.
   */
  advantageThisYear: number;
  /** Tax deferred rather than saved: what is waiting on the retained profit. */
  deferredNotSaved: number;
  considerations: string[];
  caveats: string[];
}

/** The combined corporate rate on income inside the business limit, in Ontario. */
function smallBusinessRate(): number {
  return (FEDERAL_BASIC - FEDERAL_ABATEMENT - SBD_RATE) + ON_LOWER;   // 9% + 3.2%
}

/** The general rate, for profit above the business limit. */
function generalRate(): number {
  return (FEDERAL_BASIC - FEDERAL_ABATEMENT - 0.13) + 0.115;          // 15% + 11.5%
}

function corporateTaxOn(income: number): number {
  const lower = Math.min(Math.max(0, income), BUSINESS_LIMIT);
  const upper = Math.max(0, income - BUSINESS_LIMIT);
  return Math.round(lower * smallBusinessRate() + upper * generalRate());
}

/**
 * A salary and the employer CPP on it have to fit inside what is available,
 * and the employer CPP depends on the salary. Solved rather than inverted, the
 * same way compensation.ts does it, because contributions stop at the ceiling
 * and the relationship is piecewise.
 */
function salaryWithin(available: number): number {
  let low = 0;
  let high = Math.max(0, available);
  for (let i = 0; i < 25; i++) {
    const mid = Math.floor((low + high) / 2);
    if (mid + cppOnSalary(mid).employer <= available) low = mid;
    else high = mid;
  }
  return low;
}

export function compareIncorporation(
  profit: number,
  drawnOut: number,
  year: number,
  dividendKind: DividendKind = 'nonEligible',
): IncorporationComparison {
  const draw = Math.max(0, Math.min(drawnOut, profit));

  // ------------------------------------------------------ sole proprietor
  //
  // The defining fact: the whole profit is taxed now, whether or not it is
  // drawn. There is nothing to retain, because there is no separate taxpayer
  // to retain it in, and money left in the business bank account has already
  // been taxed on the owner's return.
  const sp = selfEmployedYear(profit);
  const soleProprietor: Side = {
    label: 'Sole proprietorship',
    businessTax: 0,
    personalTax: sp.tax.total,
    cpp: sp.cpp.total,
    runningCost: 0,
    totalOut: sp.totalDue,
    cashInHand: profit - sp.totalDue,
    retained: 0,
    rrspRoom: sp.rrspRoom,
  };

  // ------------------------------------------------- incorporated, salary
  //
  // A salary is deductible, so the corporation is taxed only on what is left
  // after paying it. The owner pays both halves of CPP in substance, one as an
  // employee and one through a corporation they own, so the whole contribution
  // is counted as money leaving.
  // The corporation has to cover its own filing and registry costs before it
  // can pay anybody. Solving the salary against the full draw let it pay out
  // more than it had and run the year at a loss it would never actually run.
  const available = Math.max(0, Math.min(draw, profit - CORPORATION_ANNUAL_COST));
  const salary = salaryWithin(available);
  const salaryCpp = cppOnSalary(salary);
  const salaryCorporateIncome = Math.max(0, profit - salary - salaryCpp.employer
    - CORPORATION_ANNUAL_COST);
  const salaryCorporateTax = corporateTaxOn(salaryCorporateIncome);
  const salaryPersonal = personalTax({ salary });

  const asSalary: Side = {
    label: 'Incorporated, paying a salary',
    businessTax: salaryCorporateTax,
    personalTax: salaryPersonal.total,
    cpp: salaryCpp.employee + salaryCpp.employer,
    runningCost: CORPORATION_ANNUAL_COST,
    totalOut: salaryCorporateTax + salaryPersonal.total
      + salaryCpp.employee + salaryCpp.employer + CORPORATION_ANNUAL_COST,
    cashInHand: salary - salaryCpp.employee - salaryPersonal.total,
    retained: salaryCorporateIncome - salaryCorporateTax,
    rrspRoom: rrspRoom(salary),
  };

  // ----------------------------------------------- incorporated, dividend
  //
  // A dividend is not deductible, so the corporation is taxed on the whole
  // profit first and the dividend comes out of what is left. No CPP at all,
  // which is the largest single difference and the one most often mistaken for
  // a saving: it is a pension not contributed to, and no RRSP room either.
  const dividendCorporateIncome = Math.max(0, profit - CORPORATION_ANNUAL_COST);
  const dividendCorporateTax = corporateTaxOn(dividendCorporateIncome);
  const afterCorporateTax = dividendCorporateIncome - dividendCorporateTax;
  const dividend = Math.min(draw, Math.max(0, afterCorporateTax));
  const dividendPersonal = personalTax({ dividends: dividend, dividendKind });

  const asDividend: Side = {
    label: 'Incorporated, paying a dividend',
    businessTax: dividendCorporateTax,
    personalTax: dividendPersonal.total,
    cpp: 0,
    runningCost: CORPORATION_ANNUAL_COST,
    totalOut: dividendCorporateTax + dividendPersonal.total + CORPORATION_ANNUAL_COST,
    cashInHand: dividend - dividendPersonal.total,
    retained: afterCorporateTax - dividend,
    rrspRoom: 0,
  };

  // ------------------------------------------------------------ the verdict
  //
  // Measured on everything the owner still has: cash in hand plus what is left
  // inside the corporation. Comparing cash alone would make incorporation look
  // worse at every draw level below the full profit, because the money that
  // stayed behind would simply be missing from the total.
  const spWorth = soleProprietor.cashInHand;
  const bestCorporate = Math.max(
    asSalary.cashInHand + asSalary.retained,
    asDividend.cashInHand + asDividend.retained,
  );

  /**
   * Personal tax still waiting on the retained profit.
   *
   * Estimated at the dividend rate that would apply if it were all paid out
   * next year on top of nothing else, which is the most favourable assumption
   * available, so the figure understates the liability rather than inflating
   * it. The point is not the exact number; it is that the number is not zero,
   * because the headline advantage reads as a saving and is mostly a delay.
   */
  const retained = Math.max(asSalary.retained, asDividend.retained);
  const deferredNotSaved = retained > 0
    ? personalTax({ dividends: retained, dividendKind }).total
    : 0;

  const considerations: string[] = [];
  const caveats: string[] = [];

  if (draw >= profit - CORPORATION_ANNUAL_COST) {
    considerations.push(
      'You are drawing out everything the business earns. That is the case where '
      + 'incorporating saves the least, because the deferral it offers only applies to '
      + 'profit left inside the company, and there is none. The two routes land close '
      + 'together, and the fees are a real cost against a small or negative gap.');
  } else if (retained > 0) {
    considerations.push(
      `Most of the advantage here is tax deferred rather than saved. `
      + `Roughly ${Math.round(deferredNotSaved / 100).toLocaleString('en-CA')} dollars of `
      + `personal tax is still owed on the profit left inside the corporation, and it `
      + `falls due whenever that money comes out. What incorporating buys you is the `
      + `use of it in the meantime.`);
  }

  if (asDividend.cashInHand > asSalary.cashInHand) {
    considerations.push(
      'The dividend route looks better on cash partly because it contributes nothing '
      + 'to CPP and creates no RRSP room. Whether that is a saving or a cost depends '
      + 'on what you want to be true in thirty years, which is not a tax question.');
  }

  considerations.push(
    'A corporation is a separate legal person, which is the reason most people '
    + 'incorporate and it has nothing to do with tax. Limited liability, contracts '
    + 'that require a corporation, taking on a partner, and the lifetime capital '
    + 'gains exemption on a sale are each capable of deciding this on their own.');

  caveats.push(
    `The running cost of a corporation is assumed to be $${CORPORATION_ANNUAL_COST / 100} `
    + `a year and the one-off registration about $${INCORPORATION_ONE_OFF / 100}. Use your `
    + `own figures if you have them: a corporation whose books go to an accountant every `
    + `year costs several times this.`);
  caveats.push(
    'Ontario rates, an owner with no other income, no spouse, no children and no '
    + 'other credits. Every one of those moves the answer, some of them by more than '
    + 'the gap between the two routes.');
  caveats.push(
    'FileClear does not tell you which to choose. It shows both, with the arithmetic, '
    + 'because the difference is usually smaller than the things it cannot see.');

  return {
    year,
    profit,
    drawnOut: draw,
    soleProprietor,
    asSalary,
    asDividend,
    advantageThisYear: bestCorporate - spWorth,
    deferredNotSaved,
    considerations,
    caveats,
  };
}

/**
 * The same comparison at a spread of profits, which is what answers "at what
 * point is it worth it" rather than "is it worth it at exactly this number".
 *
 * Run at a draw the owner actually lives on rather than at the full profit,
 * because the two produce opposite shaped answers and the full-profit version
 * is the one that makes incorporating look pointless at every level.
 */
export function crossoverTable(
  drawnOut: number, year: number,
  profits: number[] = [60_000_00, 90_000_00, 120_000_00, 175_000_00, 250_000_00],
): { profit: number; advantage: number }[] {
  return profits.map((profit) => ({
    profit,
    advantage: compareIncorporation(profit, Math.min(drawnOut, profit), year).advantageThisYear,
  }));
}

export { cppOnSelfEmployment };
