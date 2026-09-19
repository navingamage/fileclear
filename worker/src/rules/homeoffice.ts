/**
 * Business use of home, which is the deduction sole proprietors most often get
 * wrong in both directions.
 *
 * Too little, because people claim a share of the utilities and forget the rent
 * or the mortgage interest, which is usually the largest number on the page.
 * Too much, because the share is claimed on the whole house rather than on the
 * part actually used, or because a room used for work in the evening is treated
 * as a room used only for work.
 *
 * CRA allows a claim on either basis:
 *
 * The space is your **principal place of business**, or it is used exclusively
 * for the business and used regularly to meet clients. A spare room that is the
 * only place the work happens qualifies on the first branch, and that is the
 * common case for a sole proprietor.
 *
 * Two rules do most of the work.
 *
 * A room used for both work and living is prorated twice: by area, and then by
 * the hours it is used for the business. A dining table used for eight hours a
 * day is 8/24, not one whole room, and that second fraction is the one people
 * leave out.
 *
 * Mortgage **principal** is never deductible and neither is the purchase price
 * of the house. Only the interest is, which is why they are asked for
 * separately here rather than as one housing cost. Capital cost allowance on a
 * home is technically available and is left out on purpose: claiming it can
 * cost the principal residence exemption on the part of the house it was
 * claimed for, and that is a much larger number than the deduction.
 *
 * Money is in cents.
 */

export interface HomeOfficeInput {
  /** Total finished area of the home, in whatever unit, as long as both match. */
  homeArea: number;
  /** The area used for the business. */
  workArea: number;
  /**
   * Hours a week the space is used for the business, when the space is also
   * lived in. Left undefined for a room used only for work, which is not
   * prorated by time at all.
   */
  hoursPerWeek?: number;
  /** Rent paid for the year. Nil if the home is owned. */
  rent: number;
  /** Mortgage interest only. The principal is not deductible and never will be. */
  mortgageInterest: number;
  propertyTax: number;
  homeInsurance: number;
  utilities: number;
  /** Repairs and maintenance to the whole home, not to the work space alone. */
  maintenance: number;
}

export interface HomeOffice {
  /** The share of the home used for the business, before any time proration. */
  areaFraction: number;
  /** The share of the week it is used for the business, or 1 if used only for work. */
  timeFraction: number;
  /** The two multiplied: what share of each household cost can be claimed. */
  fraction: number;
  /** The household costs that can be shared, added up. */
  eligibleCosts: number;
  /** The claim before the loss restriction is applied. */
  claim: number;
  /** Things worth saying beside the figure. */
  notes: string[];
}

export function homeOffice(input: HomeOfficeInput): HomeOffice {
  const areaFraction = input.homeArea > 0
    ? Math.min(1, Math.max(0, input.workArea / input.homeArea))
    : 0;

  // A space that is also lived in is prorated by time as well as by area. A
  // space used only for the business is not, and passing no hours says so.
  const timeFraction = input.hoursPerWeek === undefined
    ? 1
    : Math.min(1, Math.max(0, input.hoursPerWeek / 168));

  const fraction = areaFraction * timeFraction;

  const eligibleCosts = input.rent + input.mortgageInterest + input.propertyTax
    + input.homeInsurance + input.utilities + input.maintenance;

  const notes: string[] = [];

  if (input.hoursPerWeek !== undefined) {
    notes.push(
      `The space is shared with the rest of your life, so the claim is prorated by `
      + `time as well as by area: ${(areaFraction * 100).toFixed(1)}% of the home for `
      + `${input.hoursPerWeek} hours a week, which is `
      + `${(fraction * 100).toFixed(2)}% of each household cost. Leaving the time out `
      + `is the commonest way this deduction is overstated.`);
  } else {
    notes.push(
      `The space is used only for the business, so there is no proration by time `
      + `and the claim is ${(areaFraction * 100).toFixed(1)}% of each household cost. `
      + `That only holds if nothing else happens in the room.`);
  }

  if (input.mortgageInterest > 0) {
    notes.push(
      'Only the interest on a mortgage is deductible. The principal is not, and '
      + 'neither is the purchase price of the house, so a mortgage payment cannot '
      + 'simply be entered as a housing cost.');
  }

  if (input.rent > 0 && input.mortgageInterest > 0) {
    notes.push(
      'Rent and mortgage interest are both entered. Check that is right: paying both '
      + 'on the same home in the same year is unusual.');
  }

  notes.push(
    'Capital cost allowance on the home is deliberately not computed here. It is '
    + 'available, and claiming it can cost part of the principal residence exemption '
    + 'when the house is sold, which is almost always a larger number than the '
    + 'deduction it buys.');

  return {
    areaFraction,
    timeFraction,
    fraction,
    eligibleCosts,
    claim: Math.round(eligibleCosts * fraction),
    notes,
  };
}
