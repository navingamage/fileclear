import { RATE_YEAR } from './personal';

/**
 * Where every number in this product comes from, and when it goes stale.
 *
 * This is the file that keeps FileClear honest. Every rate elsewhere is a
 * constant compiled into the Worker, and a constant is a claim about the
 * outside world that was true on the day it was typed. Rates move every
 * January. Nothing about a hard coded 5.95% announces that it has stopped being
 * correct, and a tax product that is quietly a year out of date is worse than
 * no tax product, because it is confidently wrong.
 *
 * Three defences, in order of how much they can be trusted.
 *
 * The first is arithmetic and cannot fail: the rates carry the year they belong
 * to, and if that year is behind the calendar the product says so on every
 * screen. No network, no parsing, no maintenance.
 *
 * The second is a list of changes already announced. Legislation is usually
 * public months before it takes effect, and anything already known is written
 * down here with its date so the warning arrives before the change does rather
 * than after somebody files on the old number.
 *
 * The third watches the authorities' own pages and reports when they change.
 * It is the least reliable, because a page can be reworded without a rate
 * moving, and a rate can move on a page nobody thought to watch. It is still
 * worth having: a false alarm costs a few minutes of reading, and the failure
 * it guards against costs a reassessment.
 */

export type Authority = 'CRA' | 'Corporations Canada' | 'Ontario';

// ------------------------------------------------------- announced changes

export interface ScheduledChange {
  /** yyyy-mm-dd the change takes effect. */
  effective: string;
  authority: Authority;
  what: string;
  /** Which file has to be edited. Saves a search when the reminder arrives. */
  where: string;
  url: string;
  /** How many days ahead to start warning. */
  leadDays: number;
}

/**
 * Changes that are already announced or already law.
 *
 * A change is added here the moment it is known, not when it lands. Anything
 * still only proposed belongs in a caveat beside the calculation instead, so
 * the product computes the enacted rule and names the proposal rather than
 * guessing which way Parliament will go.
 */
export const SCHEDULED_CHANGES: ScheduledChange[] = [
  {
    effective: '2027-01-01',
    authority: 'Ontario',
    what: 'Ontario\'s dividend tax credit on non-eligible dividends falls from '
      + '2.9863% to 1.9863%. The same dividend costs more, and the salary against '
      + 'dividends comparison moves with it.',
    where: 'src/rules/personal.ts, DIVIDENDS.nonEligible.ontarioCredit',
    url: 'https://www.ontario.ca/page/ontario-dividend-tax-credit',
    leadDays: 120,
  },
  {
    effective: '2028-01-01',
    authority: 'CRA',
    what: 'The accelerated investment incentive finishes phasing out and the half '
      + 'year rule returns in full. A first year CCA claim halves.',
    where: 'src/rules/cca.ts, firstYearFactor',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/'
      + 'sole-proprietorships-partnerships/report-business-income-expenses/'
      + 'claiming-capital-cost-allowance/accelerated-investment-incentive.html',
    leadDays: 180,
  },
  {
    effective: '2027-01-01',
    authority: 'CRA',
    what: 'Every indexed figure moves: personal brackets, the basic personal '
      + 'amounts, the CPP ceilings and contribution maximums, the EI rate and '
      + 'maximum insurable earnings, and the RRSP dollar limit. CRA publishes the '
      + 'new ones in November.',
    where: 'src/rules/personal.ts, add a 2027 entry to TABLES and move RATE_YEAR',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/rates.html',
    leadDays: 60,
  },
  {
    effective: '2027-01-01',
    authority: 'CRA',
    what: 'Provincial corporate rates and business limits are reviewed with each '
      + 'province\'s budget rather than on one schedule. Three moved during 2025 '
      + 'alone: Nova Scotia\'s lower rate and limit in April, Prince Edward Island\'s '
      + 'higher rate and limit in July.',
    where: 'src/rules/provinces.ts',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/'
      + 'corporations/corporation-tax-rates.html',
    leadDays: 60,
  },
  {
    effective: '2026-12-15',
    authority: 'CRA',
    what: 'fileclear.ca DMARC is still at p=none, which reports forgery without '
      + 'stopping it. That was right while nothing had sent yet. By now the '
      + 'Cloudflare DMARC dashboard should show real reminder traffic: if every '
      + 'source on it is ZeptoMail and every message passes, move to '
      + 'p=quarantine, then to p=reject a month later. Tightening before the '
      + 'reports show what actually sends is how a legitimate sender gets '
      + 'silently filed as spam.',
    where: 'the _dmarc.fileclear.ca TXT record, not the code',
    url: 'https://developers.cloudflare.com/dmarc-management/',
    leadDays: 14,
  },
];

// ---------------------------------------------------------- watched pages

export interface WatchedSource {
  id: string;
  authority: Authority;
  label: string;
  url: string;
  /**
   * What to compare between checks.
   *
   * 'figures' reduces the page to the amounts and rates on it, which ignores
   * rewording and is what almost every rates page wants. 'text' compares the
   * visible prose, for a page that states a rule rather than a number: the
   * federal annual return is "within 60 days of the anniversary", and there is
   * no figure on that page for the other mode to find.
   *
   * Choosing wrong is not silent. A 'figures' page that yields no figures is
   * reported as needing attention rather than hashed to the empty digest, since
   * an error page also has no figures in it.
   */
  mode?: 'figures' | 'text';
  /**
   * What FileClear currently believes, so an alert can say what would change
   * rather than only that something did.
   */
  holds: string;
  where: string;
}

/**
 * The pages worth watching, which is not the same as every page consulted.
 *
 * One page per cluster of figures. Watching thirty pages produces thirty false
 * alarms a year and gets ignored, which is worse than watching six and reading
 * them.
 */
export const WATCHED_SOURCES: WatchedSource[] = [
  {
    id: 'cpp-rates',
    authority: 'CRA',
    label: 'CPP contribution rates, maximums and exemptions',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/'
      + 'payroll-deductions-contributions/canada-pension-plan-cpp/'
      + 'cpp-contribution-rates-maximums-exemptions.html',
    holds: 'YMPE 74,600, exemption 3,500, rate 5.95%, maximum 4,230.45',
    where: 'src/rules/personal.ts, TABLES, the cpp entry for each year',
  },
  {
    id: 'cpp2-rates',
    authority: 'CRA',
    label: 'Second additional CPP (CPP2) rates and maximums',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/'
      + 'calculating-deductions/making-deductions/'
      + 'second-additional-cpp-contribution-rates-maximums.html',
    holds: 'YAMPE 85,000, rate 4%, maximum 416.00',
    where: 'src/rules/personal.ts, TABLES, the cpp entry for each year',
  },
  {
    id: 'personal-brackets',
    authority: 'CRA',
    label: 'Personal income tax rates and brackets',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/'
      + 'tax-rates-brackets/current-year.html',
    holds: 'federal lowest rate 14%, Ontario lowest 5.05%',
    where: 'src/rules/personal.ts, TABLES, a new entry for each year',
  },
  {
    id: 'corporate-rates',
    authority: 'CRA',
    label: 'Corporation tax rates',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/'
      + 'corporations/corporation-tax-rates.html',
    holds: 'federal small business 9% and general 15%, plus the lower and higher '
      + 'rate and business limit for all eleven provinces CRA administers',
    where: 'src/rules/t2.ts and src/rules/provinces.ts',
  },
  {
    id: 'payroll-tables-on',
    authority: 'CRA',
    label: 'Payroll deductions tables, Ontario',
    url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/'
      + 't4032-payroll-deductions-tables/t4032on-jan/'
      + 't4032on-january-general-information.html',
    holds: 'basic personal amounts, Ontario surtax thresholds, health premium, EI rate',
    where: 'src/rules/personal.ts',
  },
  {
    id: 'corporations-canada-annual-return',
    authority: 'Corporations Canada',
    label: 'Federal annual return requirements',
    url: 'https://ised-isde.canada.ca/site/corporations-canada/en/'
      + 'annual-return-and-changes/file-your-annual-return',
    holds: 'due within 60 days of the anniversary of incorporation',
    where: 'src/rules/obligations.ts',
    // A rule stated in words, with no figure on the page to watch.
    mode: 'text',
  },
  {
    id: 'aii',
    authority: 'CRA',
    label: 'Accelerated investment incentive',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/'
      + 'sole-proprietorships-partnerships/report-business-income-expenses/'
      + 'claiming-capital-cost-allowance/accelerated-investment-incentive.html',
    holds: 'phase out: full year and no enhancement for 2024 to 2027',
    where: 'src/rules/cca.ts, firstYearFactor',
  },
];

// ---------------------------------------------------------------- staleness

export interface Staleness {
  /** The year the compiled rates belong to. */
  rateYear: number;
  currentYear: number;
  stale: boolean;
  /** True from November, when CRA publishes the following year's figures. */
  publishingSeason: boolean;
  message?: string;
}

/**
 * Whether the compiled rates still belong to the year we are in.
 *
 * This is the check that cannot fail, and the one every screen shows. It does
 * not know whether a rate is wrong; it knows the rates were written for a year
 * that has ended, which is enough to stop somebody relying on them.
 */
export function staleness(today: string): Staleness {
  const currentYear = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const stale = RATE_YEAR < currentYear;
  const publishingSeason = !stale && month >= 11;

  const s: Staleness = { rateYear: RATE_YEAR, currentYear, stale, publishingSeason };

  if (stale) {
    s.message = `These figures are ${RATE_YEAR} rates and it is ${currentYear}. `
      + 'Brackets, contribution ceilings and credits are all indexed and will have '
      + 'moved. Treat every number here as an estimate until the rates are updated.';
  } else if (publishingSeason) {
    s.message = `CRA publishes ${currentYear + 1} figures in November. FileClear is `
      + `still on ${RATE_YEAR} rates, which are correct for ${RATE_YEAR} and will need `
      + 'updating before anyone computes a ' + (currentYear + 1) + ' figure.';
  }
  return s;
}

/** Announced changes coming up inside their lead time, soonest first. */
export function upcomingChanges(today: string): ScheduledChange[] {
  const day = 86_400_000;
  const now = Date.parse(`${today}T00:00:00Z`);
  return SCHEDULED_CHANGES
    .filter((c) => {
      const at = Date.parse(`${c.effective}T00:00:00Z`);
      // Still relevant for a month after it lands, so a change that took effect
      // while nobody was looking does not vanish from the warning.
      return now >= at - c.leadDays * day && now <= at + 30 * day;
    })
    .sort((a, b) => (a.effective < b.effective ? -1 : 1));
}
