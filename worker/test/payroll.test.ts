import { describe, expect, it } from 'vitest';
import {
  deductionsFor, PERIODS_PER_YEAR, remitterFrom, remitterAdvice,
  remittanceDue, latePenalty, AMWA_BANDS, type PayFrequency,
} from '../src/rules/payroll';
import { personalTax, cppOnSalary, CPP } from '../src/rules/personal';

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

  it('withholds no EI, because an owner manager is not insurable', () => {
    // EI is absent by design rather than forgotten. It would be wrong for an
    // arm's length employee, which this product does not yet handle.
    const d = deductionsFor(90_000_00);
    expect(d.remittance).toBe(d.incomeTax + d.cpp * 2 + d.cpp2 * 2);
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
