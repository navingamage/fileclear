import { describe, expect, it } from 'vitest';
import { PROVINCES, provincialTaxFor, provincialTax } from '../src/rules/provinces';
import type { Jurisdiction } from '../src/rules/profile';

const CRA_ADMINISTERED: Jurisdiction[] = [
  'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'SK', 'YT',
];

describe('the rate table', () => {
  it('covers every province and territory', () => {
    const all: Jurisdiction[] = [...CRA_ADMINISTERED, 'AB', 'QC'];
    for (const code of all) expect(provincialTaxFor(code), code).not.toBeNull();
    expect(Object.keys(PROVINCES)).toHaveLength(13);
  });

  it('does not price a federal registration, which is not a place', () => {
    // CBCA says where a corporation is registered, never where it is taxed.
    expect(provincialTaxFor('CBCA')).toBeNull();
  });

  it('always charges less under the business limit than over it', () => {
    for (const p of Object.values(PROVINCES)) {
      expect(p.lower, p.name).toBeLessThan(p.higher);
    }
  });

  /**
   * The assumption worth breaking. Three jurisdictions do not use $500,000, and
   * in each case the federal limit stays at $500,000 regardless, so the two
   * genuinely differ on one return.
   */
  it('knows the three business limits that are not $500,000', () => {
    expect(PROVINCES.NS!.businessLimit).toBe(700_000_00);
    expect(PROVINCES.PE!.businessLimit).toBe(600_000_00);
    expect(PROVINCES.SK!.businessLimit).toBe(600_000_00);
    for (const code of ['BC', 'MB', 'NB', 'NL', 'NT', 'NU', 'ON', 'YT']) {
      expect(PROVINCES[code]!.businessLimit, code).toBe(500_000_00);
    }
  });

  it('says so where the lower rate is nil', () => {
    expect(PROVINCES.MB!.lower).toBe(0);
    expect(PROVINCES.YT!.lower).toBe(0);
    expect(PROVINCES.MB!.note).toMatch(/nothing/i);
  });

  it('explains every limit that differs from the federal one', () => {
    for (const p of Object.values(PROVINCES)) {
      if (p.businessLimit !== 500_000_00) expect(p.note, p.name).toBeTruthy();
    }
  });
});

describe('the two CRA does not administer', () => {
  /**
   * Alberta and Quebec assess corporate tax on their own returns. Applying a
   * rate to a T2 that will never carry it would be a confident wrong number.
   */
  it('names the separate return rather than pricing it', () => {
    for (const code of ['AB', 'QC'] as const) {
      const r = provincialTax([code], 10_000_000, 10_000_000);
      expect(r.tax, code).toBe(0);
      expect(r.notes.join(' '), code).toMatch(/no collection agreement/i);
    }
    expect(PROVINCES.AB!.separateReturn!.form).toBe('AT1');
    expect(PROVINCES.QC!.separateReturn!.form).toBe('CO-17');
  });

  it('warns that Quebec has conditions FileClear does not test', () => {
    expect(provincialTax(['QC'], 10_000_000, 10_000_000).notes.join(' '))
      .toMatch(/hours paid/);
  });

  it('leaves the federal side alone', () => {
    // The note has to say the federal figures still stand, or somebody reads
    // "not computed" as "nothing is owed".
    expect(provincialTax(['QC'], 10_000_000, 10_000_000).notes.join(' '))
      .toMatch(/federal figures below still apply/);
  });
});

describe('charging one province', () => {
  it('taxes Ontario at 3.2% and 11.5%', () => {
    const r = provincialTax(['ON'], 60_000_000, 50_000_000);
    expect(r.lowerIncome).toBe(50_000_000);
    expect(r.higherIncome).toBe(10_000_000);
    expect(r.tax).toBe(Math.round(50_000_000 * 0.032 + 10_000_000 * 0.115));
  });

  it('charges Manitoba nothing under the limit', () => {
    expect(provincialTax(['MB'], 40_000_000, 40_000_000).tax).toBe(0);
  });

  /**
   * Nova Scotia's limit is $700,000 while the federal one is $500,000, so the
   * province taxes more at its lower rate than the federal calculation allows
   * for. Capping at the federal figure would overstate the provincial tax.
   */
  it('uses the province\'s own business limit, not the federal one', () => {
    // $600,000 of income, federally eligible for $500,000 at the small rate.
    const ns = provincialTax(['NS'], 60_000_000, 50_000_000);
    expect(ns.lowerIncome).toBe(50_000_000);   // bounded by federal eligibility
    // Where the province is the binding constraint it is the one that applies.
    const big = provincialTax(['NS'], 90_000_000, 90_000_000);
    expect(big.lowerIncome).toBe(70_000_000);  // Nova Scotia's $700,000
    expect(big.higherIncome).toBe(20_000_000);
  });

  it('never taxes more than the taxable income', () => {
    const r = provincialTax(['ON'], 10_000_000, 50_000_000);
    expect(r.lowerIncome + r.higherIncome).toBe(10_000_000);
  });

  it('taxes nothing on nothing', () => {
    expect(provincialTax(['ON'], 0, 0).tax).toBe(0);
  });
});

describe('more than one province', () => {
  /**
   * Taxable income is allocated on Schedule 5 from gross revenue and salaries
   * paid in each province. FileClear does not hold those figures, so it shows
   * the rates and refuses to invent a split.
   */
  it('computes nothing and says what has to happen', () => {
    const r = provincialTax(['ON', 'BC'], 60_000_000, 50_000_000);
    expect(r.allocationNeeded).toBe(true);
    expect(r.tax).toBe(0);
    expect(r.notes.join(' ')).toMatch(/Schedule 5/);
    expect(r.notes.join(' ')).toMatch(/gross revenue and salaries/);
  });

  it('lists the rates for each province involved', () => {
    const note = provincialTax(['ON', 'BC'], 60_000_000, 50_000_000).notes.join(' ');
    expect(note).toMatch(/Ontario 3.2% and 11.5%/);
    expect(note).toMatch(/British Columbia 2% and 12%/);
  });
});

describe('no establishment at all', () => {
  it('says every corporation has one somewhere', () => {
    const r = provincialTax([], 10_000_000, 10_000_000);
    expect(r.tax).toBe(0);
    expect(r.province).toBeNull();
    expect(r.notes.join(' ')).toMatch(/every corporation has one/i);
  });

  it('ignores a federal registration on its own', () => {
    expect(provincialTax(['CBCA'], 10_000_000, 10_000_000).province).toBeNull();
  });
});
