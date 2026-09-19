/**
 * Tax for an unincorporated business, which is tax for its owner.
 *
 * There is no second taxpayer here. A sole proprietorship's profit is the
 * owner's income on the day it is earned, whether or not a dollar of it ever
 * leaves the business account, and that single fact is what makes this
 * different from everything else in the product. A corporation's profit is
 * taxed inside the corporation and taxed again, differently, when it comes out.
 * A sole proprietor is taxed once, on all of it, immediately.
 *
 * Two consequences that surprise people, and both cost money rather than
 * pride.
 *
 * CPP is paid at both halves. An employee pays 5.95% and their employer pays
 * the matching 5.95%; a self-employed person is both, so the rate is 11.9% and
 * the maximum is $8,460.90 rather than $4,230.45. It is the single largest
 * difference between a salary of $70,000 and self-employment income of $70,000,
 * and it arrives as one bill on 30 April rather than in twenty six pieces.
 *
 * There is no EI. Self-employment is not insurable, so nothing is withheld and
 * no benefits are earned, unless the person has opted into the special benefits
 * scheme, which is a separate decision this does not model.
 *
 * Money is in cents throughout, as everywhere else.
 */

import {
  CPP, taxOnTaxableIncome, type PersonalTax, RATE_YEAR, RRSP_RATE, RRSP_LIMIT_NEXT_YEAR,
} from './personal';

export { RATE_YEAR };

/**
 * CPP on self-employment earnings.
 *
 * The contribution splits three ways for tax purposes and it is not one number
 * halved. CRA treats the base 9.9 points as the employee's 4.95 and the
 * employer's 4.95: the employer half is a deduction, the employee half is a
 * credit. The 2 points of enhancement, and all of CPP2, are deducted in full.
 *
 * Getting this wrong in the obvious way, treating the whole contribution as
 * deductible, understates tax by roughly the lowest marginal rate on 4.95% of
 * earnings. At the ceiling that is around five hundred dollars, which is enough
 * to matter and small enough to go unnoticed.
 */
export interface SelfEmployedCpp {
  /** The whole bill, payable with the balance on 30 April. */
  total: number;
  /** Deducted from income before tax: the employer half plus all enhancement. */
  deductible: number;
  /** Earns a non-refundable credit rather than a deduction. */
  creditable: number;
  pensionableEarnings: number;
  /** True once the year's maximum has been reached, which caps the bill. */
  atMaximum: boolean;
}

export function cppOnSelfEmployment(netIncome: number): SelfEmployedCpp {
  const pensionable = Math.max(0, Math.min(netIncome, CPP.ympe) - CPP.exemption);

  // Both halves. The employee maximum is doubled rather than the rate applied
  // to a doubled base, because the ceiling is a ceiling on the contribution.
  const base = Math.min(Math.round(pensionable * CPP.rate * 2), CPP.maxContribution * 2);
  const second = Math.min(
    Math.round(Math.max(0, Math.min(netIncome, CPP.yampe) - CPP.ympe) * CPP.rate2 * 2),
    CPP.maxContribution2 * 2);

  // Of the base contribution, the part matching what an employee alone would
  // pay at the base rate is the credit; everything else is a deduction.
  const creditable = Math.round((base / 2) * (CPP.baseRate / CPP.rate));
  const deductible = base - creditable + second;

  return {
    total: base + second,
    deductible,
    creditable,
    pensionableEarnings: pensionable,
    atMaximum: base >= CPP.maxContribution * 2,
  };
}

export const SELF_EMPLOYED_CPP_MAX = CPP.maxContribution * 2 + CPP.maxContribution2 * 2;

// ------------------------------------------------------------------ T2125

/**
 * What the business earned, in the shape form T2125 asks for it.
 *
 * The line numbers are the form's own. Showing them is the point: somebody
 * copying figures into their return should not have to work out which box a
 * number belongs in, and a figure without its box is a figure they have to
 * check twice.
 */
export interface Statement {
  /** Line 8299. Gross business income, before any expense. */
  grossRevenue: number;
  /** Line 8518. Cost of goods sold, if the business carries any. */
  costOfSales: number;
  /** Line 8519. Gross profit. */
  grossProfit: number;
  /** Line 9368. Total business expenses, capital cost allowance excluded. */
  expenses: number;
  /** Line 9936. Capital cost allowance from Area A of the form. */
  cca: number;
  /** Line 9945. Business use of home, which is deducted after everything else. */
  businessUseOfHome: number;
  /** Line 9946. Net income, which is what lands on the personal return. */
  netIncome: number;
}

export interface StatementInput {
  grossRevenue: number;
  costOfSales?: number;
  expenses: number;
  cca?: number;
  /** The home office claim before the loss restriction is applied. */
  homeOfficeClaim?: number;
}

/**
 * Business use of home cannot create or deepen a loss.
 *
 * This is the rule that separates a home office claim from every other expense
 * on the form, and it is why the claim sits below the net income line rather
 * than among the expenses. What cannot be used this year is carried forward
 * indefinitely against future income from the same business, so the unused part
 * is worth reporting rather than discarding.
 */
export function statement(input: StatementInput): Statement & { homeOfficeCarriedForward: number } {
  const costOfSales = input.costOfSales ?? 0;
  const cca = input.cca ?? 0;
  const grossProfit = input.grossRevenue - costOfSales;
  const beforeHome = grossProfit - input.expenses - cca;

  const wanted = input.homeOfficeClaim ?? 0;
  const allowed = Math.max(0, Math.min(wanted, beforeHome));

  return {
    grossRevenue: input.grossRevenue,
    costOfSales,
    grossProfit,
    expenses: input.expenses,
    cca,
    businessUseOfHome: allowed,
    netIncome: beforeHome - allowed,
    homeOfficeCarriedForward: wanted - allowed,
  };
}

// ------------------------------------------------- the whole year, end to end

export interface SelfEmployedYear {
  netBusinessIncome: number;
  cpp: SelfEmployedCpp;
  /** Income tax only, after the CPP deduction and credit have been applied. */
  tax: PersonalTax;
  /** Income tax plus the CPP contribution: the cheque due on 30 April. */
  totalDue: number;
  /** What is left after both. */
  afterTax: number;
  /** RRSP room this income creates for next year. Self-employment income counts. */
  rrspRoom: number;
  /** Whether instalments will be required next year. */
  instalmentsLikely: boolean;
}

/**
 * The 30 April bill, worked out in the order it actually happens.
 *
 * CPP first, because the deductible half changes taxable income and so changes
 * the tax; then tax on what is left; then the two added together, because they
 * are one payment to one account on one day. Keeping them separate on screen
 * and together in the total is the honest presentation: CPP is not a tax, it
 * buys a pension, but it leaves the bank account on the same morning.
 */
export function selfEmployedYear(netBusinessIncome: number): SelfEmployedYear {
  const cpp = cppOnSelfEmployment(netBusinessIncome);

  // personalTax handles the employee case, where CPP is withheld and the
  // deduction and credit are computed from a salary. Here the contribution is
  // already known, so the income is passed net of the deductible part and the
  // credit is applied by hand.
  const tax = personalTaxOnSelfEmployment(netBusinessIncome, cpp);

  const totalDue = tax.total + cpp.total;
  return {
    netBusinessIncome,
    cpp,
    tax,
    totalDue,
    afterTax: netBusinessIncome - totalDue,
    rrspRoom: Math.min(Math.round(netBusinessIncome * RRSP_RATE), RRSP_LIMIT_NEXT_YEAR),
    instalmentsLikely: totalDue > 3_000_00,
  };
}

/**
 * Income tax on self-employment income.
 *
 * Straight through the shared core in personal.ts, with the self-employed CPP
 * figures in place of an employee's. No salary is involved and there is no EI,
 * so nothing else changes: the brackets, the basic personal amount, Ontario's
 * surtax and the health premium are the same ones a salaried person meets.
 */
function personalTaxOnSelfEmployment(net: number, cpp: SelfEmployedCpp): PersonalTax {
  return taxOnTaxableIncome({
    taxableIncome: net - cpp.deductible,
    creditableAmounts: cpp.creditable,
  });
}
