import { describe, expect, it } from 'vitest';
import {
  cppOnSelfEmployment, SELF_EMPLOYED_CPP_MAX, statement, selfEmployedYear,
} from '../src/rules/selfemployed';
import { CPP, cppOnSalary, personalTax } from '../src/rules/personal';

/**
 * Self-employment is the employee calculation with the employer half added and
 * EI taken away. Both halves of that sentence are load bearing and both are
 * easy to get wrong in a way that looks plausible.
 */

const dollars = (cents: number) => Math.round(cents) / 100;

describe('CPP when you are both halves', () => {
  /**
   * Anchored on the maximums CRA publishes rather than on what the code
   * happens to produce, so a mistyped rate or ceiling fails here first.
   */
  it('doubles the employee maximum', () => {
    expect(dollars(CPP.maxContribution)).toBe(4230.45);
    expect(dollars(SELF_EMPLOYED_CPP_MAX)).toBe(9292.90);
  });

  it('charges exactly twice what an employee pays on the same income', () => {
    for (const income of [20_000_00, 45_000_00, 74_600_00, 85_000_00, 200_000_00]) {
      const employee = cppOnSalary(income);
      const self = cppOnSelfEmployment(income);
      expect(self.total, `at ${dollars(income)}`).toBe(employee.employee * 2);
    }
  });

  it('respects the $3,500 exemption', () => {
    expect(cppOnSelfEmployment(3_500_00).total).toBe(0);
    expect(cppOnSelfEmployment(0).total).toBe(0);
    // The first dollar above the exemption is charged at both halves.
    expect(cppOnSelfEmployment(4_500_00).total).toBe(Math.round(1_000_00 * 0.0595 * 2));
  });

  it('stops at the ceiling', () => {
    expect(cppOnSelfEmployment(500_000_00).total).toBe(SELF_EMPLOYED_CPP_MAX);
    expect(cppOnSelfEmployment(85_000_00).atMaximum).toBe(true);
  });

  /**
   * The split matters as much as the total. Treating the whole contribution as
   * deductible is the obvious mistake and it understates tax by the lowest
   * marginal rate on about 4.95% of earnings, which at the ceiling is several
   * hundred dollars and nowhere near large enough to notice.
   */
  it('splits into a deduction and a credit rather than halving', () => {
    const c = cppOnSelfEmployment(74_600_00);
    expect(c.deductible + c.creditable).toBe(c.total);
    // The credit is what an employee alone would have earned at the base rate.
    const employee = cppOnSalary(74_600_00);
    expect(c.creditable).toBe(employee.creditable);
    // Everything else, including the whole employer half, is a deduction.
    expect(c.deductible).toBeGreaterThan(c.creditable);
  });
});

describe('form T2125', () => {
  it('works down to net income in the order the form does', () => {
    const s = statement({
      grossRevenue: 150_000_00, costOfSales: 20_000_00, expenses: 40_000_00, cca: 5_000_00,
    });
    expect(s.grossProfit).toBe(130_000_00);
    expect(s.netIncome).toBe(85_000_00);
  });

  /**
   * Business use of home cannot create or deepen a loss. It is the one expense
   * on the form that sits below the net income line, and what cannot be used
   * carries forward indefinitely against the same business.
   */
  it('restricts a home office claim to the profit that is left', () => {
    const s = statement({
      grossRevenue: 30_000_00, expenses: 28_000_00, homeOfficeClaim: 5_000_00,
    });
    expect(s.businessUseOfHome).toBe(2_000_00);
    expect(s.netIncome).toBe(0);
    expect(s.homeOfficeCarriedForward).toBe(3_000_00);
  });

  it('claims none of it in a year that was already a loss', () => {
    const s = statement({
      grossRevenue: 10_000_00, expenses: 15_000_00, homeOfficeClaim: 4_000_00,
    });
    expect(s.businessUseOfHome).toBe(0);
    expect(s.netIncome).toBe(-5_000_00);
    expect(s.homeOfficeCarriedForward).toBe(4_000_00);
  });

  it('allows the whole claim when there is room for it', () => {
    const s = statement({
      grossRevenue: 90_000_00, expenses: 20_000_00, homeOfficeClaim: 6_000_00,
    });
    expect(s.businessUseOfHome).toBe(6_000_00);
    expect(s.homeOfficeCarriedForward).toBe(0);
    expect(s.netIncome).toBe(64_000_00);
  });
});

describe('the year, end to end', () => {
  const year = selfEmployedYear(80_000_00);

  it('adds CPP to the tax, because both leave on 30 April', () => {
    expect(year.totalDue).toBe(year.tax.total + year.cpp.total);
    expect(year.afterTax).toBe(80_000_00 - year.totalDue);
  });

  it('taxes less income than was earned, by the CPP deduction', () => {
    expect(year.tax.taxableIncome).toBe(80_000_00 - year.cpp.deductible);
  });

  /**
   * The comparison that makes the product worth using. Self-employment income
   * of $80,000 and a salary of $80,000 are not the same: the salaried person's
   * employer paid half the CPP, and the self-employed person pays all of it.
   */
  it('costs more than the same figure as a salary, by the employer half', () => {
    const salaried = personalTax({ salary: 80_000_00, insurable: true });
    const employeeCpp = cppOnSalary(80_000_00);
    const salariedTotal = salaried.total + employeeCpp.employee;
    expect(year.totalDue).toBeGreaterThan(salariedTotal);
    // The gap is roughly the employer half, less the tax saved by deducting it.
    const gap = year.totalDue - salariedTotal;
    expect(gap).toBeGreaterThan(employeeCpp.employee * 0.5);
    expect(gap).toBeLessThan(employeeCpp.employee * 1.1);
  });

  it('creates RRSP room, which a dividend does not', () => {
    expect(year.rrspRoom).toBe(Math.round(80_000_00 * 0.18));
  });

  it('flags instalments once the bill passes $3,000', () => {
    expect(selfEmployedYear(80_000_00).instalmentsLikely).toBe(true);
    expect(selfEmployedYear(15_000_00).instalmentsLikely).toBe(false);
  });

  it('owes nothing on no income', () => {
    const nil = selfEmployedYear(0);
    expect(nil.totalDue).toBe(0);
    expect(nil.cpp.total).toBe(0);
  });

  /** A loss is a loss, not a negative tax bill. */
  it('charges no tax and no CPP on a loss', () => {
    const loss = selfEmployedYear(-20_000_00);
    expect(loss.cpp.total).toBe(0);
    expect(loss.tax.total).toBe(0);
  });

  it('rises with income throughout', () => {
    let last = -1;
    for (let income = 0; income <= 300_000_00; income += 10_000_00) {
      const due = selfEmployedYear(income).totalDue;
      expect(due).toBeGreaterThanOrEqual(last);
      last = due;
    }
  });
});
