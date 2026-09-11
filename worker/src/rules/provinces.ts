import type { Jurisdiction } from './profile';

/**
 * Provincial and territorial corporation tax.
 *
 * Every province runs a dual rate the same way the federal government does: a
 * lower rate on income that qualifies for the small business deduction, and a
 * higher one on the rest. What differs is the rates, and in three places the
 * business limit, which is not always the $500,000 everybody assumes.
 *
 * Two jurisdictions are missing on purpose. Alberta and Quebec have no
 * collection agreement with CRA, so their corporate tax is assessed on a
 * separate provincial return, Alberta's AT1 and Quebec's CO-17, filed with the
 * province rather than with CRA. FileClear does not compute those, and says so
 * rather than quietly applying a rate to a return that will not carry it.
 *
 * Rates are 2026 and were read off CRA's own table rather than recalled. Three
 * of them moved during 2025, which is exactly why they are not remembered:
 * Nova Scotia's lower rate and limit in April, Prince Edward Island's higher
 * rate and limit in July.
 */

export interface ProvincialTax {
  code: Jurisdiction;
  name: string;
  /** Applies to income eligible for the small business deduction. */
  lower: number;
  /** Applies to everything above the business limit. */
  higher: number;
  /** Not always $500,000. Nova Scotia, PEI and Saskatchewan differ. */
  businessLimit: number;
  /**
   * Set when CRA does not administer the province's corporate tax, which means
   * a separate return rather than a different number.
   */
  separateReturn?: { form: string; note: string };
  note?: string;
}

const M = 100; // cents per dollar, for readability below

export const PROVINCES: Record<string, ProvincialTax> = {
  BC: { code: 'BC', name: 'British Columbia', lower: 0.02, higher: 0.12, businessLimit: 500_000 * M },
  MB: { code: 'MB', name: 'Manitoba', lower: 0, higher: 0.12, businessLimit: 500_000 * M,
    note: 'Manitoba charges nothing on income under the business limit.' },
  NB: { code: 'NB', name: 'New Brunswick', lower: 0.025, higher: 0.14, businessLimit: 500_000 * M },
  NL: { code: 'NL', name: 'Newfoundland and Labrador', lower: 0.025, higher: 0.15, businessLimit: 500_000 * M },
  NT: { code: 'NT', name: 'Northwest Territories', lower: 0.02, higher: 0.115, businessLimit: 500_000 * M },
  NS: { code: 'NS', name: 'Nova Scotia', lower: 0.015, higher: 0.14, businessLimit: 700_000 * M,
    note: 'Nova Scotia\'s business limit is $700,000, not $500,000, and the federal '
      + 'limit is still $500,000. The two do not move together.' },
  NU: { code: 'NU', name: 'Nunavut', lower: 0.03, higher: 0.12, businessLimit: 500_000 * M },
  ON: { code: 'ON', name: 'Ontario', lower: 0.032, higher: 0.115, businessLimit: 500_000 * M },
  PE: { code: 'PE', name: 'Prince Edward Island', lower: 0.01, higher: 0.15, businessLimit: 600_000 * M,
    note: 'Prince Edward Island\'s business limit is $600,000 while the federal one '
      + 'stays at $500,000.' },
  SK: { code: 'SK', name: 'Saskatchewan', lower: 0.01, higher: 0.12, businessLimit: 600_000 * M,
    note: 'Saskatchewan\'s business limit is $600,000 while the federal one stays at '
      + '$500,000.' },
  YT: { code: 'YT', name: 'Yukon', lower: 0, higher: 0.12, businessLimit: 500_000 * M,
    note: 'Yukon charges nothing on income under the business limit.' },

  AB: {
    code: 'AB', name: 'Alberta', lower: 0.02, higher: 0.08, businessLimit: 500_000 * M,
    separateReturn: {
      form: 'AT1',
      note: 'Alberta has no collection agreement with CRA, so its corporate tax is not '
        + 'assessed on the T2. An Alberta AT1 is filed with Alberta Tax and Revenue '
        + 'Administration separately. FileClear works out the federal tax and leaves '
        + 'the Alberta return alone.',
    },
  },
  QC: {
    code: 'QC', name: 'Quebec', lower: 0.032, higher: 0.115, businessLimit: 500_000 * M,
    separateReturn: {
      form: 'CO-17',
      note: 'Quebec has no collection agreement with CRA, so its corporate tax is not '
        + 'assessed on the T2. A CO-17 is filed with Revenu Quebec separately, and '
        + 'Quebec\'s small business rate carries conditions on hours paid that '
        + 'FileClear does not test. The federal figures below still apply.',
    },
  },
};

/** CBCA is where a corporation is registered, never where it is taxed. */
export function provincialTaxFor(code: Jurisdiction): ProvincialTax | null {
  return PROVINCES[code] ?? null;
}

export interface ProvincialResult {
  /** Null when the corporation has no establishment FileClear can price. */
  province: ProvincialTax | null;
  /** Income taxed at the province's lower rate, after its own limit. */
  lowerIncome: number;
  higherIncome: number;
  tax: number;
  /** True when more than one province is involved and the split is not ours to make. */
  allocationNeeded: boolean;
  notes: string[];
}

/**
 * Provincial tax on taxable income, for a corporation established in one place.
 *
 * Where there is more than one permanent establishment, taxable income is
 * allocated between provinces on Schedule 5 using a formula over gross revenue
 * and salaries paid in each. FileClear does not hold the figures that formula
 * needs, so it computes nothing and says what has to happen instead, rather
 * than allocating on a guess and producing a number somebody might file.
 *
 * `sbdIncome` is the federally eligible amount. A province with a bigger
 * business limit taxes more at its lower rate than the federal calculation
 * allows for, which is why this takes taxable income as well.
 */
export function provincialTax(
  establishments: Jurisdiction[], taxableIncome: number, sbdIncome: number,
): ProvincialResult {
  const known = establishments
    .map((e) => PROVINCES[e])
    .filter((p): p is ProvincialTax => Boolean(p));

  const notes: string[] = [];

  if (!known.length) {
    notes.push('No permanent establishment is recorded, so no provincial tax is '
      + 'computed. Every corporation has one somewhere, and it decides which province '
      + 'charges the other half of the tax.');
    return { province: null, lowerIncome: 0, higherIncome: 0, tax: 0,
      allocationNeeded: false, notes };
  }

  const allocationNeeded = known.length > 1;
  const province = known[0]!;

  if (allocationNeeded) {
    notes.push('There is a permanent establishment in more than one province, so '
      + 'taxable income is allocated between them on Schedule 5, using gross revenue '
      + 'and salaries paid in each. FileClear does not hold those figures, so it shows '
      + `each province's rates rather than a split it would have to guess at: `
      + known.map((p) => `${p.name} ${(p.lower * 100).toFixed(3).replace(/\.?0+$/, '')}% and `
        + `${(p.higher * 100).toFixed(3).replace(/\.?0+$/, '')}%`).join(', ') + '.');
    return { province, lowerIncome: 0, higherIncome: 0, tax: 0, allocationNeeded, notes };
  }

  if (province.separateReturn) {
    notes.push(province.separateReturn.note);
    return { province, lowerIncome: 0, higherIncome: 0, tax: 0,
      allocationNeeded: false, notes };
  }

  if (province.note) notes.push(province.note);

  // The province applies its own limit, which is not always the federal one.
  const lowerIncome = Math.min(sbdIncome, province.businessLimit, taxableIncome);
  const higherIncome = Math.max(0, taxableIncome - lowerIncome);
  const tax = Math.round(lowerIncome * province.lower + higherIncome * province.higher);

  return { province, lowerIncome, higherIncome, tax, allocationNeeded: false, notes };
}
