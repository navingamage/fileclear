import { describe, expect, it } from 'vitest';
import { compareCompensation } from '../src/rules/compensation';
import { cppOnSalary, CPP, personalTax } from '../src/rules/personal';
import { blankProfile, type CompanyProfile } from '../src/rules/profile';

const profile = (over: Partial<CompanyProfile> = {}): CompanyProfile => ({
  ...blankProfile(), legalName: 'Test Inc.', incorporationDate: '2024-01-01', ...over,
});

describe('the two routes account for every dollar', () => {
  for (const available of [25_000_00, 60_000_00, 120_000_00, 300_000_00]) {
    it(`balances at ${available / 100}`, () => {
      const c = compareCompensation(profile(), available);

      // Salary: what is paid plus the employer's CPP is what was available,
      // give or take the cent bisection cannot split.
      expect(c.salary.costToCorporation).toBeLessThanOrEqual(available);
      expect(available - c.salary.costToCorporation).toBeLessThan(100);

      // Net plus everything that left equals what the corporation gave up.
      expect(c.salary.netToPerson + c.salary.totalOut)
        .toBeCloseTo(c.salary.costToCorporation, -2);
      expect(c.dividend.netToPerson + c.dividend.totalOut).toBe(available);
    });
  }
});

describe('the salary route', () => {
  it('pays no corporate tax, because a salary is deductible', () => {
    expect(compareCompensation(profile(), 100_000_00).salary.corporateTax).toBe(0);
  });

  it('solves the salary so it and the employer CPP fit what is available', () => {
    const c = compareCompensation(profile(), 100_000_00);
    const cpp = cppOnSalary(c.salary.salary);
    expect(c.salary.salary + cpp.employer).toBeLessThanOrEqual(100_000_00);
    expect(c.salary.salary + 100 + cppOnSalary(c.salary.salary + 100).employer)
      .toBeGreaterThan(100_000_00);
  });

  it('stops adding CPP once the second ceiling is passed', () => {
    const big = compareCompensation(profile(), 300_000_00);
    expect(big.salary.employeeCpp).toBe(CPP.maxContribution + CPP.maxContribution2);
  });

  it('creates RRSP room, which the dividend route does not', () => {
    const c = compareCompensation(profile(), 100_000_00);
    expect(c.salary.rrspRoom).toBeGreaterThan(0);
    expect(c.dividend.rrspRoom).toBe(0);
  });
});

describe('the dividend route', () => {
  it('taxes the corporation at 12.2% before anything is paid out', () => {
    const c = compareCompensation(profile(), 100_000_00);
    expect(c.dividend.corporateTax).toBe(12_200_00);
    expect(c.dividend.dividend).toBe(87_800_00);
  });

  it('taxes the corporation at the general rate when there is no SBD', () => {
    const c = compareCompensation(profile({ isCCPC: false }), 100_000_00);
    expect(c.dividend.corporateTax).toBe(26_500_00);
  });

  it('withholds no CPP, because a dividend is not employment income', () => {
    const c = compareCompensation(profile(), 100_000_00);
    expect(c.dividend.employeeCpp).toBe(0);
    expect(c.dividend.employerCpp).toBe(0);
    expect(c.dividend.cppTotal).toBe(0);
  });

  /**
   * The personal tax on the dividend is computed on what the corporation
   * actually had left, not on the pre-tax figure. Getting this wrong would tax
   * the same money twice and make dividends look far worse than they are.
   */
  it('taxes the dividend that was actually paid', () => {
    const c = compareCompensation(profile(), 100_000_00);
    expect(c.dividend.personalTax)
      .toBe(personalTax({ dividends: 87_800_00, dividendKind: 'nonEligible' }).total);
  });
});

describe('the comparison', () => {
  /**
   * CPP is money out, but it buys a pension rather than paying for roads.
   * Folding it into a tax rate makes salary look worse than it is, so the two
   * are reported separately and the gap says how much of it is CPP.
   */
  it('keeps CPP out of the tax figure and names it in the gap', () => {
    const c = compareCompensation(profile(), 100_000_00);
    expect(c.salary.totalTax).toBe(c.salary.personalTax);
    expect(c.salary.totalOut).toBe(c.salary.totalTax + c.salary.cppTotal);
    expect(c.gapFromCpp).toBe(c.salary.cppTotal);
  });

  /**
   * The two gaps routinely point opposite ways, and saying only one of them is
   * how a reader concludes the wrong thing. At $120,000 the salary route pays
   * less tax and still hands over less cash, because CPP came out of it.
   */
  it('reports the tax gap separately from the cash gap', () => {
    const c = compareCompensation(profile(), 120_000_00);
    expect(c.salaryTaxAdvantage).toBe(c.dividend.totalTax - c.salary.totalTax);
    expect(c.salaryTaxAdvantage).toBeGreaterThan(0);   // salary is cheaper in tax
    expect(c.salaryAdvantage).toBeLessThan(0);         // and still leaves less cash
    expect(c.gapFromCpp).toBeGreaterThan(-c.salaryAdvantage);  // CPP exceeds the gap
  });

  it('leaves the reader to decide rather than printing an answer', () => {
    const c = compareCompensation(profile(), 100_000_00);
    const text = [...c.considerations, ...c.caveats].join(' ').toLowerCase();
    expect(text).not.toMatch(/\byou should\b|\bwe recommend\b|\bbest option\b/);
    expect(c.considerations.length).toBeGreaterThan(2);
  });

  it('names RRSP room, CPP and the payroll obligations', () => {
    const text = compareCompensation(profile(), 100_000_00).considerations.join(' ');
    expect(text).toMatch(/RRSP/);
    expect(text).toMatch(/CPP/);
    expect(text).toMatch(/T4|payroll/);
  });

  it('warns that the Ontario dividend credit falls in 2027', () => {
    const text = compareCompensation(profile(), 100_000_00).caveats.join(' ');
    expect(text).toMatch(/1\.9863/);
    expect(text).toMatch(/2027/);
  });

  it('says no EI is due, and what that costs as well as saves', () => {
    const text = compareCompensation(profile(), 100_000_00).caveats.join(' ');
    expect(text).toMatch(/40%/);
    expect(text).toMatch(/parental|sickness/);
  });

  it('handles nothing to distribute without dividing by zero', () => {
    const c = compareCompensation(profile(), 0);
    expect(c.salary.netToPerson).toBe(0);
    expect(c.dividend.netToPerson).toBe(0);
    expect(c.salary.effectiveRate).toBe(0);
    expect(c.dividend.effectiveRate).toBe(0);
  });

  /**
   * An eligible dividend comes out of income taxed at the general rate, so the
   * corporation pays more first and the person pays less after. Both halves
   * have to move or the comparison is nonsense.
   */
  it('pairs eligible dividends with the general corporate rate', () => {
    const c = compareCompensation(profile({ isCCPC: false }), 100_000_00, 'eligible');
    expect(c.dividend.corporateTax).toBe(26_500_00);
    const other = compareCompensation(profile({ isCCPC: false }), 100_000_00, 'nonEligible');
    expect(c.dividend.personalTax).toBeLessThan(other.dividend.personalTax);
  });
});
