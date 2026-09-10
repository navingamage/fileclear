import { describe, expect, it } from 'vitest';
import {
  personalTax, cppOnSalary, rrspRoom, CPP, EI, DIVIDENDS,
  FEDERAL_BRACKETS, ONTARIO_BRACKETS, RATE_YEAR,
} from '../src/rules/personal';

/**
 * CRA publishes the maximum contributions as well as the rates, so these are
 * the numbers to anchor on: if a rate or a ceiling is entered wrong, the
 * maximum stops matching and the whole file is suspect.
 */
describe('the published maximums', () => {
  it('reaches CRA\'s stated maximum CPP contribution exactly', () => {
    const at = cppOnSalary(CPP.ympe);
    expect(Math.round((CPP.ympe - CPP.exemption) * CPP.rate)).toBe(CPP.maxContribution);
    expect(at.employee).toBe(CPP.maxContribution);   // CPP2 has not started yet
  });

  it('reaches the stated CPP2 maximum at the second ceiling', () => {
    const at = cppOnSalary(CPP.yampe);
    expect(Math.round((CPP.yampe - CPP.ympe) * CPP.rate2)).toBe(CPP.maxContribution2);
    expect(at.employee).toBe(CPP.maxContribution + CPP.maxContribution2);
  });

  it('stops contributing above the second ceiling', () => {
    expect(cppOnSalary(200_000_00).employee).toBe(cppOnSalary(CPP.yampe).employee);
  });

  it('matches the published maximum EI premium', () => {
    expect(Math.round(EI.maxInsurable * EI.rate)).toBe(EI.maxPremium);
  });

  it('charges nothing below the basic exemption', () => {
    expect(cppOnSalary(CPP.exemption).employee).toBe(0);
    expect(cppOnSalary(0).employee).toBe(0);
  });

  it('splits a contribution into the part credited and the part deducted', () => {
    // The base 4.95 points earn a credit; the 1.00 point of enhancement is
    // deducted from income. Two mechanisms inside one contribution.
    const c = cppOnSalary(60_000_00);
    const pensionable = 60_000_00 - CPP.exemption;
    expect(c.creditable).toBe(Math.round(pensionable * 0.0495));
    expect(c.deductible).toBe(Math.round(pensionable * 0.01));
    expect(c.creditable + c.deductible).toBe(c.employee);
  });

  it('costs the employer the same as the employee', () => {
    expect(cppOnSalary(60_000_00).employer).toBe(cppOnSalary(60_000_00).employee);
  });
});

describe('the brackets', () => {
  it('starts federal at 14% for 2026, not 15%', () => {
    expect(RATE_YEAR).toBe(2026);
    expect(FEDERAL_BRACKETS[0]!.rate).toBe(0.14);
  });

  it('rises monotonically in both jurisdictions', () => {
    for (const set of [FEDERAL_BRACKETS, ONTARIO_BRACKETS]) {
      for (let i = 1; i < set.length; i++) {
        expect(set[i]!.rate).toBeGreaterThan(set[i - 1]!.rate);
        expect(set[i]!.upTo).toBeGreaterThan(set[i - 1]!.upTo);
      }
    }
  });
});

describe('tax on a salary', () => {
  const t = personalTax({ salary: 60_000_00 });

  it('deducts the enhanced CPP before applying the brackets', () => {
    expect(t.taxableIncome).toBe(60_000_00 - cppOnSalary(60_000_00).deductible);
  });

  it('charges the Ontario Health Premium at its flat tier', () => {
    // $48,001 to $72,000 is a flat $600, because the 25% formula exceeds the cap
    // almost immediately.
    expect(t.healthPremium).toBe(600_00);
  });

  it('charges no Ontario surtax at this income', () => {
    expect(t.surtax).toBe(0);
  });

  it('charges surtax once Ontario tax passes the threshold', () => {
    expect(personalTax({ salary: 150_000_00 }).surtax).toBeGreaterThan(0);
  });

  it('taxes nothing at all below the basic personal amount', () => {
    const low = personalTax({ salary: 12_000_00 });
    expect(low.federal).toBe(0);
    expect(low.ontario).toBe(0);
    expect(low.total).toBe(0);
  });

  it('never produces negative tax', () => {
    for (const salary of [0, 5_000_00, 15_000_00, 30_000_00]) {
      const r = personalTax({ salary });
      expect(r.federal).toBeGreaterThanOrEqual(0);
      expect(r.ontario).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('tax on dividends', () => {
  it('grosses a non-eligible dividend up by 15%', () => {
    const t = personalTax({ dividends: 50_000_00, dividendKind: 'nonEligible' });
    expect(t.taxableIncome).toBe(57_500_00);
    expect(DIVIDENDS.nonEligible.grossUp).toBe(0.15);
  });

  it('grosses an eligible dividend up by 38%', () => {
    const t = personalTax({ dividends: 50_000_00, dividendKind: 'eligible' });
    expect(t.taxableIncome).toBe(69_000_00);
  });

  /**
   * The gross up is reported income, so it drags the health premium and the
   * surtax up with it even though the cheque was smaller. That is a real cost
   * of dividends people do not expect.
   */
  it('charges the health premium on the grossed up amount', () => {
    const div = personalTax({ dividends: 46_000_00 });   // grosses up to 52,900
    expect(div.taxableIncome).toBeGreaterThan(48_000_00);
    expect(div.healthPremium).toBe(600_00);
  });

  it('taxes an eligible dividend more lightly than a non-eligible one', () => {
    const cash = 60_000_00;
    const eligible = personalTax({ dividends: cash, dividendKind: 'eligible' });
    const other = personalTax({ dividends: cash, dividendKind: 'nonEligible' });
    // The bigger credit more than pays for the bigger gross up, which is the
    // point of the eligible designation.
    expect(eligible.total).toBeLessThan(other.total);
  });

  it('charges far less than the same money as salary, before corporate tax', () => {
    // Only half the comparison. The corporation has already been taxed on the
    // money behind a dividend, which is what compensation.ts puts back.
    const salary = personalTax({ salary: 60_000_00 });
    const dividend = personalTax({ dividends: 60_000_00 });
    expect(dividend.total).toBeLessThan(salary.total);
  });
});

describe('RRSP room', () => {
  it('is 18% of a salary', () => {
    expect(rrspRoom(100_000_00)).toBe(18_000_00);
  });

  it('is capped at next year\'s dollar limit', () => {
    expect(rrspRoom(500_000_00)).toBe(35_390_00);
  });

  it('is nothing without a salary', () => {
    expect(rrspRoom(0)).toBe(0);
  });
});
