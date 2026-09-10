import { describe, expect, it } from 'vitest';
import {
  deductionsFor, PERIODS_PER_YEAR, remitterFrom, remitterAdvice,
  remittanceDue, latePenalty, AMWA_BANDS, isInsurable, payrollRun, ontarioEht,
  EHT_EXEMPTION, EHT_EXEMPTION_CUTOFF, type PayFrequency, type Employee,
} from '../src/rules/payroll';
import { personalTax, cppOnSalary, eiOnSalary, CPP, EI } from '../src/rules/personal';

const FREQUENCIES: PayFrequency[] = ['monthly', 'semi-monthly', 'biweekly', 'weekly'];

describe('a pay period', () => {
  /**
   * The reason CRA's formula annualises rather than taxing each cheque: twelve
   * withholdings have to add up to the year's tax, or a balance appears in
   * April that nobody was expecting.
   */
  it('withholds the year\'s tax across the year, within rounding', () => {
    for (const frequency of FREQUENCIES) {
      const d = deductionsFor(90_000_00, frequency);
      const annual = personalTax({ salary: 90_000_00 }).total;
      expect(Math.abs(d.incomeTax * d.periods - annual)).toBeLessThan(d.periods);
    }
  });

  it('withholds about the year\'s CPP across the year', () => {
    for (const frequency of FREQUENCIES) {
      const d = deductionsFor(90_000_00, frequency);
      const annual = cppOnSalary(90_000_00).employee;
      // The prorated exemption rounds per period, so allow a cent per period.
      expect(Math.abs((d.cpp + d.cpp2) * d.periods - annual)).toBeLessThan(d.periods * 2);
    }
  });

  it('adds up: gross less what is withheld is what lands', () => {
    const d = deductionsFor(90_000_00);
    expect(d.netPay).toBe(d.gross - d.incomeTax - d.cpp - d.cpp2);
  });

  it('remits the tax plus both halves of CPP', () => {
    const d = deductionsFor(90_000_00);
    expect(d.remittance).toBe(d.incomeTax + d.cpp + d.cpp2 + d.employerCpp);
    expect(d.employerCpp).toBe(d.cpp + d.cpp2);
  });

  it('withholds no EI for an owner manager, who is not insurable', () => {
    const d = deductionsFor(90_000_00);
    expect(d.ei).toBe(0);
    expect(d.employerEi).toBe(0);
    expect(d.remittance).toBe(d.incomeTax + d.cpp * 2 + d.cpp2 * 2);
  });

  it('withholds EI for an arm\'s length employee', () => {
    const d = deductionsFor(50_000_00, 'monthly', true);
    expect(d.ei).toBeGreaterThan(0);
    expect(d.remittance).toBe(
      d.incomeTax + d.cpp + d.cpp2 + d.employerCpp + d.ei + d.employerEi);
  });

  /**
   * EI is the lopsided one. Every other payroll contribution is matched; the
   * employer pays 1.4 times the employee's EI, which is a real cost of hiring
   * that a matched-contribution mental model misses.
   */
  it('charges the employer 1.4 times the employee EI', () => {
    const annual = eiOnSalary(50_000_00, true);
    expect(annual.employer).toBe(Math.round(annual.employee * 1.4));
    expect(annual.employee).toBe(Math.round(50_000_00 * EI.rate));
  });

  it('caps EI at the published maximum premium', () => {
    const annual = eiOnSalary(200_000_00, true);
    expect(annual.employee).toBe(EI.maxPremium);
    expect(annual.insurableEarnings).toBe(EI.maxInsurable);
  });

  it('starts no CPP2 below the first ceiling', () => {
    expect(deductionsFor(60_000_00).cpp2).toBe(0);
  });

  it('starts CPP2 above it', () => {
    expect(deductionsFor(85_000_00).cpp2).toBeGreaterThan(0);
  });

  it('prorates the basic exemption instead of applying it once', () => {
    // A monthly period gets a twelfth of $3,500 exempted, not the whole thing.
    const monthly = deductionsFor(60_000_00, 'monthly');
    const periodPensionable = 60_000_00 / 12 - CPP.exemption / 12;
    expect(monthly.cpp).toBe(Math.round(periodPensionable * CPP.rate));
  });

  it('knows how many periods each frequency has', () => {
    expect(PERIODS_PER_YEAR).toEqual({
      monthly: 12, 'semi-monthly': 24, biweekly: 26, weekly: 52,
    });
  });

  it('handles a salary of nothing', () => {
    const d = deductionsFor(0);
    expect(d.gross).toBe(0);
    expect(d.remittance).toBe(0);
    expect(d.netPay).toBe(0);
  });
});

describe('who is insurable', () => {
  const person = (votingSharePct: number): Employee => ({
    id: 'e', name: 'A', annualSalary: 50_000_00, votingSharePct, frequency: 'monthly',
  });

  it('excludes anyone over 40% of the voting shares', () => {
    expect(isInsurable(person(41))).toBe(false);
    expect(isInsurable(person(100))).toBe(false);
  });

  it('includes a minority holder and a plain employee', () => {
    expect(isInsurable(person(40))).toBe(true);
    expect(isInsurable(person(0))).toBe(true);
  });

  it('treats exactly 40% as insurable, since the rule is more than 40%', () => {
    expect(isInsurable(person(40))).toBe(true);
  });
});

describe('a payroll with more than one person on it', () => {
  const owner: Employee = {
    id: 'o', name: 'Owner', annualSalary: 90_000_00, votingSharePct: 100, frequency: 'monthly',
  };
  const staff: Employee = {
    id: 's', name: 'Staff', annualSalary: 60_000_00, votingSharePct: 0, frequency: 'monthly',
  };
  const run = payrollRun([owner, staff]);

  it('applies EI to the employee and not to the owner', () => {
    expect(run.lines[0]!.insurable).toBe(false);
    expect(run.lines[0]!.deductions.ei).toBe(0);
    expect(run.lines[1]!.insurable).toBe(true);
    expect(run.lines[1]!.deductions.ei).toBeGreaterThan(0);
  });

  /** CRA wants one PD7A per payroll account, not one per person. */
  it('pools the remittance across everybody', () => {
    expect(run.periodRemittance)
      .toBe(run.lines.reduce((t, l) => t + l.deductions.remittance, 0));
    expect(run.totalSalary).toBe(150_000_00);
  });

  it('counts the employer contributions as a cost on top of salary', () => {
    expect(run.employerCost).toBeGreaterThan(0);
    const staffLine = run.lines[1]!.deductions;
    expect(run.employerCost).toBeGreaterThan(staffLine.employerEi * 12);
  });

  it('raises the arm\'s length question when a shareholder is on the payroll', () => {
    const withMinority = payrollRun([{ ...staff, votingSharePct: 25 }]);
    expect(withMinority.questions.join(' ')).toMatch(/arm's length/);
    expect(withMinority.questions.join(' ')).toMatch(/ruling request/);
  });

  it('does not raise it when nobody on the payroll holds shares', () => {
    expect(payrollRun([staff]).questions.join(' ')).not.toMatch(/ruling request/);
  });

  it('says what not being insurable costs as well as saves', () => {
    expect(run.questions.join(' ')).toMatch(/parental/);
  });

  it('handles an empty payroll', () => {
    const empty = payrollRun([]);
    expect(empty.totalSalary).toBe(0);
    expect(empty.periodRemittance).toBe(0);
    expect(empty.questions).toEqual([]);
  });
});

describe('the Ontario employer health tax', () => {
  it('costs nothing below the exemption', () => {
    const e = ontarioEht(150_000_00);
    expect(e.tax).toBe(0);
    expect(e.note).toMatch(/nothing is owed/);
    // The return is still filed, which is the part people miss.
    expect(e.note).toMatch(/nil/i);
  });

  /**
   * The rate band is chosen on remuneration before the exemption and applied
   * after it. Choosing the band on the post exemption figure is the obvious
   * mistake and it understates the tax.
   */
  it('picks the rate on gross remuneration and applies it to the taxable part', () => {
    const e = ontarioEht(1_300_000_00);
    expect(e.rate).toBe(0.0195);                       // band from 1.3M, not 300k
    expect(e.taxable).toBe(300_000_00);
    expect(e.tax).toBe(Math.round(300_000_00 * 0.0195));
  });

  it('takes the whole exemption away past five million, as a cliff', () => {
    const under = ontarioEht(EHT_EXEMPTION_CUTOFF);
    const over = ontarioEht(EHT_EXEMPTION_CUTOFF + 100);
    expect(under.exemptionClaimed).toBe(EHT_EXEMPTION);
    expect(over.exemptionClaimed).toBe(0);
    // One dollar of payroll costs nearly twenty thousand of tax.
    expect(over.tax - under.tax).toBeGreaterThan(19_000_00);
    expect(over.note).toMatch(/cliff rather than a taper/);
  });

  it('requires instalments over 1.2 million of payroll', () => {
    expect(ontarioEht(1_100_000_00).instalmentsRequired).toBe(false);
    expect(ontarioEht(1_300_000_00).instalmentsRequired).toBe(true);
  });

  it('uses the lowest band for a small payroll', () => {
    expect(ontarioEht(150_000_00).rate).toBe(0.0098);
  });
});

describe('which remitter you are', () => {
  it('reads the category off the average monthly withholding', () => {
    expect(remitterFrom(500_00)).toBe('quarterly');
    expect(remitterFrom(AMWA_BANDS.quarterly)).toBe('regular');
    expect(remitterFrom(50_000_00)).toBe('accelerated1');
    expect(remitterFrom(150_000_00)).toBe('accelerated2');
  });

  it('sits on the boundary the way CRA describes it', () => {
    // Under $3,000 is quarterly; $3,000 exactly is not.
    expect(remitterFrom(2_999_99)).toBe('quarterly');
    expect(remitterFrom(3_000_00)).toBe('regular');
    expect(remitterFrom(24_999_99)).toBe('regular');
    expect(remitterFrom(25_000_00)).toBe('accelerated1');
  });

  it('says nothing when the category already matches', () => {
    expect(remitterAdvice('regular', 120_000_00).warning).toBeUndefined();
  });

  it('warns before CRA moves you up a category', () => {
    const a = remitterAdvice('regular', 600_000_00);
    expect(a.indicated).toBe('accelerated1');
    expect(a.warning).toMatch(/twice a month/);
    // The point is to expect the letter, not to change the frequency unilaterally.
    expect(a.warning).toMatch(/do not change the frequency/);
  });

  it('notes that quarterly is not simply a matter of being small', () => {
    const a = remitterAdvice('regular', 6_000_00);
    expect(a.indicated).toBe('quarterly');
    expect(a.warning).toMatch(/compliance record/);
  });

  it('divides by the months that actually had payroll', () => {
    const a = remitterAdvice('regular', 12_000_00, 3);
    expect(a.averageMonthlyWithholding).toBe(4_000_00);
  });

  it('does not divide by zero when there was no payroll', () => {
    expect(remitterAdvice('regular', 0, 0).averageMonthlyWithholding).toBe(0);
  });
});

describe('when the remittance is due', () => {
  it('is the fifteenth of the next month for a regular remitter', () => {
    expect(remittanceDue('2026-03-20', 'regular')).toBe('2026-04-15');
  });

  it('rolls into the next year from a December payment', () => {
    expect(remittanceDue('2026-12-31', 'regular')).toBe('2027-01-15');
  });

  it('follows the quarter end for a quarterly remitter', () => {
    expect(remittanceDue('2026-01-15', 'quarterly')).toBe('2026-04-15');
    expect(remittanceDue('2026-05-01', 'quarterly')).toBe('2026-07-15');
    expect(remittanceDue('2026-08-31', 'quarterly')).toBe('2026-10-15');
    expect(remittanceDue('2026-11-30', 'quarterly')).toBe('2027-01-15');
  });

  it('splits the month for an accelerated threshold 1 remitter', () => {
    expect(remittanceDue('2026-03-10', 'accelerated1')).toBe('2026-03-25');
    expect(remittanceDue('2026-03-20', 'accelerated1')).toBe('2026-04-10');
  });

  it('refuses to guess for threshold 2 rather than giving a wrong date', () => {
    expect(remittanceDue('2026-03-20', 'accelerated2')).toBeNull();
  });
});

describe('the penalty for being late', () => {
  /**
   * The reason this matters out of proportion to its size: the penalty is a
   * percentage of the whole remittance, not of any shortfall. A day late on
   * $4,000 is $120, not a few dollars of interest.
   */
  it('charges 3% from the first day late', () => {
    expect(latePenalty(4_000_00, 1)).toBe(120_00);
  });

  it('climbs with the days', () => {
    expect(latePenalty(10_000_00, 3)).toBe(300_00);
    expect(latePenalty(10_000_00, 4)).toBe(500_00);
    expect(latePenalty(10_000_00, 6)).toBe(700_00);
    expect(latePenalty(10_000_00, 30)).toBe(1_000_00);
  });

  it('charges nothing when it is on time', () => {
    expect(latePenalty(10_000_00, 0)).toBe(0);
    expect(latePenalty(10_000_00, -2)).toBe(0);
  });
});
