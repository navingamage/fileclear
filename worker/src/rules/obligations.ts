import type { CompanyProfile, EntityType } from './profile';

/**
 * Everything a Canadian corporation can owe, as data rather than as code paths.
 *
 * The same shape Milepost uses for the Ontario parenting rules, for the same
 * reason: the rules change more often than the engine does, and a rule that is
 * data can be corrected by editing one record and re-running the tests.
 *
 * Two conventions hold throughout.
 *
 * Every obligation names the authority that publishes it and links to the page
 * that is the source. FileClear tells you a date is coming. It is not the
 * authority on the date, and the link is how a user checks us.
 *
 * `applies` decides whether a corporation owes this at all. A corporation with
 * no payroll account should never see a PD7A remittance, and a federal
 * corporation should never see an Ontario annual return. Filtering at the rule
 * rather than in the view is what makes the generated plan specific.
 */

export type Authority = 'CRA' | 'Ontario' | 'Corporations Canada' | 'WSIB';

/** How badly it goes if the date passes. Drives sort order and colour. */
export type Weight =
  | 'critical'  // money, interest or the corporation's standing
  | 'important' // a penalty, but a recoverable one
  | 'routine';

/**
 * When an obligation falls due.
 *
 * Corporate deadlines hang off three different clocks, which is most of why
 * this is confusing to a director and why software is worth having.
 */
export type Schedule =
  /** N months after the fiscal year end. The T2, the annual HST return, the Ontario annual return. */
  | { kind: 'afterYearEnd'; months: number }
  /** N days after the anniversary of incorporation. Federal annual returns only. */
  | { kind: 'afterIncorporationAnniversary'; days: number }
  /** A fixed calendar date each year. Slips and the employer health tax. */
  | { kind: 'calendar'; month: number; day: number }
  /** The last day of a named month. February is not always 28. */
  | { kind: 'lastDayOf'; month: number }
  /** Every month, on the given day of the following month. Payroll remittances. */
  | { kind: 'monthlyAfter'; dayOfNextMonth: number }
  /**
   * Every month, N months after the month closes, landing on a month end.
   *
   * A monthly HST return is due one month after the reporting period, which is
   * the last day of the following month rather than a fixed day number.
   */
  | { kind: 'monthlyAfterMonthEnd'; months: number }
  /** The last day of every month. Corporate tax instalments. */
  | { kind: 'monthlyOnLastDay' }
  /** Each fiscal quarter, N months after the quarter closes. HST and instalments. */
  | { kind: 'quarterlyAfterQuarterEnd'; months: number }
  /**
   * Each *calendar* quarter, on the given day of the following month.
   *
   * Not the same as the fiscal quarters above, and the difference is a real
   * bug rather than a nicety. Payroll runs on the calendar: a quarterly
   * remitter with a 30 June year end still remits for the quarters ending in
   * March, June, September and December, because CRA's payroll accounts know
   * nothing about a corporation's fiscal year.
   */
  | { kind: 'afterCalendarQuarter'; dayOfNextMonth: number }
  /**
   * Twice a month. Accelerated threshold 1 payroll remitters: pay made in the
   * first half of a month is remitted by the 25th of that month, and pay made
   * in the second half by the 10th of the next.
   */
  | { kind: 'semiMonthly' }
  /**
   * Four times a month, three working days after each of the periods ending on
   * the 7th, 14th, 21st and the last day. Accelerated threshold 2.
   */
  | { kind: 'fourTimesMonthly' }
  /** N months after the anniversary of incorporation. British Columbia. */
  | { kind: 'monthsAfterIncorporationAnniversary'; months: number }
  /**
   * The last day of the month after the anniversary month. Alberta's annual
   * return, which is on neither of the two clocks anything else here uses.
   */
  | { kind: 'endOfMonthAfterAnniversary' }
  /**
   * Once, N days after incorporation, and never again.
   *
   * Registering a federal corporation with a province is a one time act, so
   * this produces a single occurrence rather than one a year. It is the only
   * schedule here that does.
   */
  | { kind: 'onceAfterIncorporation'; days: number }
  /**
   * Every N years from a fixed start date. Ontario business name
   * registrations, which expire after five years and then simply stop
   * existing.
   */
  | { kind: 'everyNYearsFrom'; years: number; from: (p: CompanyProfile) => string }
  /** 15 March, June, September and December. Personal tax instalments. */
  | { kind: 'personalInstalments' };

export interface Obligation {
  id: string;
  title: string;
  detail: string;
  authority: Authority;
  /** The form or account, as the authority names it. Shown verbatim. */
  form: string;
  weight: Weight;
  schedule: Schedule;
  /** How long before the date the user should start. */
  leadDays: number;
  /** What happens if it is late, in the user's words rather than the statute's. */
  penalty: string;
  link: { label: string; url: string };
  applies: (p: CompanyProfile) => boolean;
  /**
   * Which kinds of business owe this at all.
   *
   * Most rules belong to exactly one. A sole proprietor filing a T2 and a
   * corporation filing a T2125 are both nonsense, and the shared ones, payroll
   * and HST and the construction return, are shared because CRA genuinely
   * treats them the same way. Kept here rather than folded into `applies` so
   * that the split is visible in the rule instead of hidden in a predicate.
   *
   * Omitted means both, which is only true of the handful that really are.
   */
  entities?: EntityType[];
  /**
   * True for an obligation a corporation does not owe in the year it was
   * incorporated. Only instalments, so far.
   *
   * This used to be a string comparison against one rule id inside the engine.
   * Splitting instalments into a monthly and a quarterly rule walked straight
   * past it, and a new corporation on monthly instalments was shown twelve
   * payments CRA does not ask a first year corporation for. A rule that is data
   * should carry its own exceptions rather than leave them in the engine.
   */
  notInFirstYear?: boolean;
}

const CRA_T2 = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations.html';
const CRA_HST = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html';
const CRA_PAYROLL = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll.html';
const OBR = 'https://www.ontario.ca/page/ontario-business-registry';
const CORPORATIONS_CANADA = 'https://ised-isde.canada.ca/site/corporations-canada/en';
const ON_EHT = 'https://www.ontario.ca/document/employer-health-tax-eht';
const CRA_SELF_EMPLOYED = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income.html';
const CRA_INSTALMENTS = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-instalments.html';
const BC_REGISTRY = 'https://www2.gov.bc.ca/gov/content/employment-business/business/managing-a-business/permits-licences/businesses-incorporated-companies/bc-companies';
const AB_REGISTRY = 'https://www.alberta.ca/annual-returns-for-alberta-corporations';
const AB_TRA = 'https://www.alberta.ca/corporate-income-tax';
const REVENU_QUEBEC = 'https://www.revenuquebec.ca/en/businesses/income-tax/corporation-income-tax/';

export const OBLIGATIONS: Obligation[] = [
  // ----------------------------------------------------------------- income tax

  {
    id: 't2-return',
    entities: ['corporation'],
    title: 'Corporate income tax return',
    detail:
      'Every corporation resident in Canada files a T2 for every tax year, including '
      + 'years with no income and no activity. The return is due six months after the '
      + 'fiscal year end regardless of when the balance was payable, so it is normal '
      + 'to have paid the tax months before filing the return that calculates it.',
    authority: 'CRA',
    form: 'T2',
    weight: 'critical',
    schedule: { kind: 'afterYearEnd', months: 6 },
    leadDays: 60,
    penalty: '5% of the unpaid tax, plus 1% for each complete month late, up to 12 months.',
    link: { label: 'T2 corporation income tax return', url: CRA_T2 },
    applies: () => true,
  },

  {
    id: 't2-balance-ccpc',
    entities: ['corporation'],
    title: 'Corporate tax balance owing',
    detail:
      'A CCPC claiming the small business deduction gets three months to pay the '
      + 'balance rather than two. Interest runs from the day after this date, '
      + 'compounded daily, and it runs whether or not the return has been filed yet.',
    authority: 'CRA',
    form: 'payment',
    weight: 'critical',
    schedule: { kind: 'afterYearEnd', months: 3 },
    leadDays: 30,
    penalty: 'Interest from the day after, compounded daily at the prescribed rate.',
    link: { label: 'Paying corporation tax', url: CRA_T2 },
    applies: (p) => p.isCCPC && p.claimsSmallBusinessDeduction,
  },

  {
    id: 't2-balance-general',
    entities: ['corporation'],
    title: 'Corporate tax balance owing',
    detail:
      'Two months after the year end. The three month extension belongs only to a '
      + 'CCPC that is actually claiming the small business deduction, so a CCPC whose '
      + 'business limit has been used up by associated corporations pays on this date.',
    authority: 'CRA',
    form: 'payment',
    weight: 'critical',
    schedule: { kind: 'afterYearEnd', months: 2 },
    leadDays: 30,
    penalty: 'Interest from the day after, compounded daily at the prescribed rate.',
    link: { label: 'Paying corporation tax', url: CRA_T2 },
    applies: (p) => !(p.isCCPC && p.claimsSmallBusinessDeduction),
  },

  /**
   * Instalments come in two shapes and the product only had one of them.
   *
   * Monthly is the default for every corporation. Quarterly is a concession to
   * a small CCPC, and it has to be earned: the corporation claims the small
   * business deduction, its taxable income is inside the business limit, and
   * its compliance record over the last twelve months is clean. Showing every
   * corporation four dates a year understated the obligation by eight, which
   * is the expensive direction to be wrong in.
   */
  {
    id: 't2-instalments',
    entities: ['corporation'],
    title: 'Corporate tax instalment',
    detail:
      'An eligible CCPC pays its tax in four instalments rather than twelve, each '
      + 'due on the last day of a quarter of its tax year. Eligibility is not '
      + 'automatic: the corporation has to be claiming the small business deduction, '
      + 'have taxable income within the business limit, and have been on time with '
      + 'its returns and remittances for the last twelve months. Fall out of any of '
      + 'those and CRA puts the corporation back on monthly instalments. '
      + 'New corporations pay no instalments in their first tax year.',
    authority: 'CRA',
    form: 'instalment',
    weight: 'important',
    schedule: { kind: 'quarterlyAfterQuarterEnd', months: 0 },
    leadDays: 14,
    penalty: 'Instalment interest, and a further penalty once that interest passes $1,000.',
    link: { label: 'Corporation instalments', url: CRA_T2 },
    notInFirstYear: true,
    applies: (p) =>
      p.lastYearTaxPayable > 3000 && p.isCCPC && p.claimsSmallBusinessDeduction,
  },

  {
    id: 't2-instalments-monthly',
    entities: ['corporation'],
    title: 'Corporate tax instalment',
    detail:
      'A corporation whose tax payable was over $3,000 in either of the last two '
      + 'years pays monthly, on the last day of each month of its tax year. The '
      + 'quarterly alternative belongs only to a CCPC claiming the small business '
      + 'deduction, so a corporation that is not one, or that has used its business '
      + 'limit up through associated corporations, is on this schedule. '
      + 'New corporations pay no instalments in their first tax year.',
    authority: 'CRA',
    form: 'instalment',
    weight: 'important',
    schedule: { kind: 'monthlyOnLastDay' },
    leadDays: 10,
    penalty: 'Instalment interest, and a further penalty once that interest passes $1,000.',
    link: { label: 'Corporation instalments', url: CRA_T2 },
    notInFirstYear: true,
    applies: (p) =>
      p.lastYearTaxPayable > 3000 && !(p.isCCPC && p.claimsSmallBusinessDeduction),
  },

  // ------------------------------------------------------------- annual returns

  {
    id: 'initial-return-on',
    entities: ['corporation'],
    title: 'Register the corporation in Ontario',
    detail:
      'A federal corporation is not automatically registered in the province it '
      + 'operates from. Ontario requires an Initial Return under the Corporations '
      + 'Information Act within 60 days of the corporation beginning to carry on '
      + 'business in Ontario, filed through the Ontario Business Registry. There is '
      + 'no fee and no annual return that follows it, which is part of why it gets '
      + 'missed: it happens once, early, and nothing later reminds you. '
      + 'FileClear counts the 60 days from incorporation, which is right if you '
      + 'started then. If you began trading in Ontario later, the clock starts from '
      + 'that day instead.',
    authority: 'Ontario',
    form: 'Form 2, Initial Return',
    weight: 'critical',
    schedule: { kind: 'onceAfterIncorporation', days: 60 },
    leadDays: 45,
    penalty:
      'Failing to file is an offence under the Corporations Information Act, with '
      + 'fines up to $2,000 for the corporation and up to $2,000 for each director '
      + 'or officer. In practice the bigger cost is that the corporation is not '
      + 'properly registered where it operates.',
    link: { label: 'Ontario Business Registry', url: OBR },
    // Only for a corporation incorporated somewhere other than Ontario that
    // nonetheless operates here. An Ontario corporation is already registered.
    applies: (p) => p.jurisdiction !== 'ON' && p.permanentEstablishments.includes('ON'),
  },
  {
    id: 'annual-return-on',
    entities: ['corporation'],
    title: 'Ontario annual return',
    detail:
      'Filed with the province through the Ontario Business Registry, not with the '
      + 'T2. It stopped riding along with the tax return as Schedule 546 in October '
      + '2021, and a great many corporations with a perfectly filed T2 are quietly in '
      + 'default because nobody owns this one. You need a company key to file it, and '
      + 'a corporation registered before 2021 has to request one.',
    authority: 'Ontario',
    form: 'Ontario annual return',
    weight: 'critical',
    schedule: { kind: 'afterYearEnd', months: 6 },
    leadDays: 45,
    penalty: 'Repeated failure can lead to the corporation being dissolved by the province.',
    link: { label: 'Ontario Business Registry', url: OBR },
    applies: (p) => p.jurisdiction === 'ON',
  },

  {
    id: 'annual-return-federal',
    entities: ['corporation'],
    title: 'Federal annual return',
    detail:
      'A corporation incorporated federally files its annual return with Corporations '
      + 'Canada within sixty days of the anniversary of the date it was incorporated, '
      + 'together with information on individuals with significant control: anybody '
      + 'holding or controlling 25% or more of the shares, or with influence over the '
      + 'corporation. The fee is $12 online. '
      + 'This has nothing to do with the fiscal year end, which is why it is the '
      + 'deadline federal corporations miss most: everything else runs off the year end '
      + 'and this one does not.',
    authority: 'Corporations Canada',
    form: 'Form 22',
    weight: 'critical',
    schedule: { kind: 'afterIncorporationAnniversary', days: 60 },
    leadDays: 30,
    penalty: 'Failure to file for one year can lead to dissolution.',
    link: { label: 'Corporations Canada annual return', url: CORPORATIONS_CANADA },
    applies: (p) => p.jurisdiction === 'CBCA',
  },

  {
    id: 'annual-return-bc',
    entities: ['corporation'],
    title: 'British Columbia annual report',
    detail:
      'A company incorporated in British Columbia files an annual report with BC '
      + 'Registries within two months after each anniversary of its date of '
      + 'incorporation. Like the federal one, it runs off the anniversary rather than '
      + 'the fiscal year end, so it does not line up with anything else here.',
    authority: 'Corporations Canada',
    form: 'BC annual report',
    weight: 'critical',
    schedule: { kind: 'monthsAfterIncorporationAnniversary', months: 2 },
    leadDays: 30,
    penalty: 'A company two years in arrears can be struck from the register.',
    link: { label: 'BC Registries', url: BC_REGISTRY },
    applies: (p) => p.jurisdiction === 'BC',
  },

  {
    id: 'annual-return-ab',
    entities: ['corporation'],
    title: 'Alberta annual return',
    detail:
      'An Alberta corporation files its annual return by the end of the month after '
      + 'its anniversary month, through a registry agent rather than online with the '
      + 'province. A corporation incorporated in March files by 30 April each year.',
    authority: 'Corporations Canada',
    form: 'Alberta annual return',
    weight: 'critical',
    schedule: { kind: 'endOfMonthAfterAnniversary' },
    leadDays: 30,
    penalty: 'A corporation that misses two consecutive years can be dissolved.',
    link: { label: 'Alberta annual returns', url: AB_REGISTRY },
    applies: (p) => p.jurisdiction === 'AB',
  },

  /**
   * Alberta and Quebec have no collection agreement with CRA, so their
   * corporate tax is a separate return rather than a different rate on the T2.
   * src/rules/provinces.ts already said so; the calendar did not, which meant a
   * corporation with an Alberta permanent establishment saw a complete set of
   * federal deadlines and no sign of the return Alberta was waiting for.
   *
   * These turn on where the corporation operates, not where it was
   * incorporated: a federal corporation with an office in Calgary files an AT1.
   */
  {
    id: 'at1-alberta',
    entities: ['corporation'],
    title: 'Alberta corporate income tax return',
    detail:
      'A corporation with a permanent establishment in Alberta files an AT1 with '
      + 'Alberta Tax and Revenue Administration, six months after its fiscal year end. '
      + 'Alberta does not ride along with the T2, so filing the federal return leaves '
      + 'this one outstanding. The balance is payable on the same two or three month '
      + 'clock as the federal one.',
    authority: 'CRA',
    form: 'AT1',
    weight: 'critical',
    schedule: { kind: 'afterYearEnd', months: 6 },
    leadDays: 45,
    penalty: 'A late filing penalty on the unpaid Alberta tax, plus interest.',
    link: { label: 'Alberta corporate income tax', url: AB_TRA },
    applies: (p) => p.permanentEstablishments.includes('AB'),
  },

  {
    id: 'co17-quebec',
    entities: ['corporation'],
    title: 'Quebec corporation income tax return',
    detail:
      'A corporation with an establishment in Quebec files a CO-17 with Revenu Quebec, '
      + 'six months after its fiscal year end. Quebec administers its own corporate '
      + 'tax, so the T2 does not cover it, and the annual updating declaration for the '
      + 'enterprise register is normally filed with this return rather than separately.',
    authority: 'CRA',
    form: 'CO-17',
    weight: 'critical',
    schedule: { kind: 'afterYearEnd', months: 6 },
    leadDays: 45,
    penalty: 'A late filing penalty on the unpaid Quebec tax, plus interest.',
    link: { label: 'Revenu Quebec, corporations', url: REVENU_QUEBEC },
    applies: (p) => p.permanentEstablishments.includes('QC'),
  },

  // -------------------------------------------------------------------- GST/HST

  {
    id: 'hst-annual',
    entities: ['corporation'],
    title: 'HST return and payment',
    detail:
      'An annual filer that is a corporation files and pays three months after the '
      + 'fiscal year end. The June deadline people repeat is the one for individuals '
      + 'with a December year end, and it does not apply here.',
    authority: 'CRA',
    form: 'GST34',
    weight: 'critical',
    schedule: { kind: 'afterYearEnd', months: 3 },
    leadDays: 30,
    penalty: 'A penalty based on the balance owing, plus interest.',
    link: { label: 'GST/HST for businesses', url: CRA_HST },
    applies: (p) => p.hst.registered && p.hst.period === 'annual',
  },

  {
    id: 'hst-quarterly',
    title: 'HST return and payment',
    detail:
      'A quarterly filer files and pays one month after each fiscal quarter closes.',
    authority: 'CRA',
    form: 'GST34',
    weight: 'critical',
    schedule: { kind: 'quarterlyAfterQuarterEnd', months: 1 },
    leadDays: 14,
    penalty: 'A penalty based on the balance owing, plus interest.',
    link: { label: 'GST/HST for businesses', url: CRA_HST },
    applies: (p) => p.hst.registered && p.hst.period === 'quarterly',
  },

  {
    id: 'hst-monthly',
    title: 'HST return and payment',
    detail:
      'A monthly filer files and pays one month after each reporting period closes, '
      + 'so the return for January is due at the end of February. CRA assigns monthly '
      + 'periods above $6 million in taxable supplies, and a registrant who is '
      + 'regularly in a refund position can elect them to get the refund sooner.',
    authority: 'CRA',
    form: 'GST34',
    weight: 'critical',
    schedule: { kind: 'monthlyAfterMonthEnd', months: 1 },
    leadDays: 10,
    penalty: 'A penalty based on the balance owing, plus interest.',
    link: { label: 'GST/HST for businesses', url: CRA_HST },
    applies: (p) => p.hst.registered && p.hst.period === 'monthly',
  },

  {
    id: 'hst-instalments',
    title: 'HST instalment',
    detail:
      'An annual filer whose net tax was $3,000 or more pays quarterly instalments '
      + 'through the following year, each due one month after the quarter closes. This '
      + 'is the obligation owners are least likely to know about, because nothing '
      + 'announces it: the first sign is usually interest on the annual return.',
    authority: 'CRA',
    form: 'instalment',
    weight: 'important',
    schedule: { kind: 'quarterlyAfterQuarterEnd', months: 1 },
    leadDays: 14,
    penalty: 'Instalment interest on what should have been paid.',
    link: { label: 'GST/HST instalments', url: CRA_HST },
    applies: (p) =>
      p.hst.registered && p.hst.period === 'annual' && p.hst.lastYearNetTax >= 3000,
  },

  // -------------------------------------------------------------------- payroll

  {
    id: 'payroll-remittance-regular',
    title: 'Payroll source deductions',
    detail:
      'Income tax, CPP and EI withheld from pay, plus the employer share, remitted by '
      + 'the fifteenth of the month after the pay was made. An owner who controls more '
      + 'than 40% of the voting shares is not insurable, so no EI is withheld on their '
      + 'own salary.',
    authority: 'CRA',
    form: 'PD7A',
    weight: 'critical',
    schedule: { kind: 'monthlyAfter', dayOfNextMonth: 15 },
    leadDays: 7,
    penalty:
      'Up to 10% of the amount, and directors can be held personally liable for '
      + 'unremitted source deductions.',
    link: { label: 'Remitting source deductions', url: CRA_PAYROLL },
    applies: (p) => p.payroll.hasAccount && p.payroll.remitter === 'regular',
  },

  {
    id: 'payroll-remittance-quarterly',
    title: 'Payroll source deductions',
    detail:
      'Quarterly remitters pay by the fifteenth of the month following the end of each '
      + 'quarter. CRA assigns this to small employers with a clean compliance history.',
    authority: 'CRA',
    form: 'PD7A',
    weight: 'critical',
    schedule: { kind: 'afterCalendarQuarter', dayOfNextMonth: 15 },
    leadDays: 7,
    penalty:
      'Up to 10% of the amount, and directors can be held personally liable for '
      + 'unremitted source deductions.',
    link: { label: 'Remitting source deductions', url: CRA_PAYROLL },
    applies: (p) => p.payroll.hasAccount && p.payroll.remitter === 'quarterly',
  },

  /**
   * The two accelerated bands existed in the profile and nowhere else, so an
   * employer who told FileClear they were on threshold 1 was shown no payroll
   * remittance at all. An absent deadline reads as nothing owing, which is the
   * worst way for this product to be wrong.
   */
  {
    id: 'payroll-remittance-accelerated1',
    title: 'Payroll source deductions',
    detail:
      'Accelerated threshold 1, which CRA assigns at an average monthly withholding '
      + 'of $25,000 or more. Pay made in the first half of a month is remitted by the '
      + '25th of that month; pay made from the 16th onwards by the 10th of the next. '
      + 'Twenty four dates a year rather than twelve.',
    authority: 'CRA',
    form: 'PD7A',
    weight: 'critical',
    schedule: { kind: 'semiMonthly' },
    leadDays: 5,
    penalty:
      'Up to 10% of the amount, and directors can be held personally liable for '
      + 'unremitted source deductions.',
    link: { label: 'Remitting source deductions', url: CRA_PAYROLL },
    applies: (p) => p.payroll.hasAccount && p.payroll.remitter === 'accelerated1',
  },

  {
    id: 'payroll-remittance-accelerated2',
    title: 'Payroll source deductions',
    detail:
      'Accelerated threshold 2, at an average monthly withholding of $100,000 or more. '
      + 'The month is cut into four periods ending on the 7th, 14th, 21st and the last '
      + 'day, and each is remitted within three working days of its close. Working '
      + 'days, not calendar days, so a long weekend moves the date. At this size the '
      + 'payment has to go through a financial institution rather than by mail.',
    authority: 'CRA',
    form: 'PD7A',
    weight: 'critical',
    schedule: { kind: 'fourTimesMonthly' },
    leadDays: 3,
    penalty:
      'Up to 10% of the amount, and directors can be held personally liable for '
      + 'unremitted source deductions.',
    link: { label: 'Remitting source deductions', url: CRA_PAYROLL },
    applies: (p) => p.payroll.hasAccount && p.payroll.remitter === 'accelerated2',
  },

  {
    id: 't4-slips',
    title: 'T4 slips and summary',
    detail:
      'Issued to everyone paid a salary in the calendar year, and filed with CRA, by '
      + 'the last day of February. Note the clock: slips run on the calendar year even '
      + 'when the corporation does not.',
    authority: 'CRA',
    form: 'T4 / T4 Summary',
    weight: 'important',
    schedule: { kind: 'lastDayOf', month: 2 },
    leadDays: 30,
    penalty: 'A per slip, per day penalty, with a minimum of $100.',
    link: { label: 'Filing T4 slips', url: CRA_PAYROLL },
    applies: (p) => p.payroll.hasAccount,
  },

  {
    id: 't5-slips',
    entities: ['corporation'],
    title: 'T5 slips and summary',
    detail:
      'Dividends paid to shareholders are reported on a T5 by the last day of '
      + 'February, on the calendar year rather than the fiscal one. No source '
      + 'deductions are withheld from a dividend, which is why a corporation paying '
      + 'only dividends has no monthly remittance.',
    authority: 'CRA',
    form: 'T5 / T5 Summary',
    weight: 'important',
    schedule: { kind: 'lastDayOf', month: 2 },
    leadDays: 30,
    penalty: 'A per slip, per day penalty, with a minimum of $100.',
    link: { label: 'Filing T5 slips', url: CRA_PAYROLL },
    applies: (p) => p.paysDividends,
  },

  {
    id: 'eht-annual',
    title: 'Employer health tax return',
    detail:
      'Ontario employers file an annual EHT return in March for the previous calendar '
      + 'year. Eligible private employers get an exemption on the first part of their '
      + 'Ontario payroll, so many small corporations file a return showing nothing '
      + 'owing rather than not filing at all.',
    authority: 'Ontario',
    form: 'EHT annual return',
    weight: 'important',
    schedule: { kind: 'calendar', month: 3, day: 15 },
    leadDays: 21,
    penalty: 'A penalty on the tax owing, plus interest.',
    link: { label: 'Employer health tax', url: ON_EHT },
    applies: (p) =>
      p.payroll.hasAccount && p.permanentEstablishments.includes('ON'),
  },

  // ------------------------------------------------- unincorporated business

  /**
   * The split that catches almost everybody, and it is two dates rather than
   * one confusing date.
   *
   * A self-employed person, or their spouse, has until 15 June to file. The
   * balance is still due 30 April, and interest runs from 1 May. So the filing
   * extension is real and the payment extension does not exist, which means
   * anyone who waits for June and owes money has been paying interest for six
   * weeks. FileClear shows both, separately, in that order.
   */
  {
    id: 't1-balance',
    entities: ['soleProprietorship'],
    title: 'Personal tax balance owing',
    detail:
      'The 15 June filing deadline for self-employed people is a filing deadline '
      + 'only. Any balance owing is due 30 April and interest runs from 1 May, so '
      + 'waiting until June to work out what you owe means paying interest on it for '
      + 'six weeks. If you cannot finish the return by April, estimate the balance and '
      + 'pay it, then file in June.',
    authority: 'CRA',
    form: 'payment',
    weight: 'critical',
    schedule: { kind: 'calendar', month: 4, day: 30 },
    leadDays: 45,
    penalty: 'Interest from 1 May, compounded daily at the prescribed rate.',
    link: { label: 'Self-employed: dates and deadlines', url: CRA_SELF_EMPLOYED },
    applies: () => true,
  },

  {
    id: 't1-return',
    entities: ['soleProprietorship'],
    title: 'Personal income tax return',
    detail:
      'A person who carried on a business has until 15 June to file, and so does '
      + 'their spouse or common-law partner, whether or not the spouse had any '
      + 'business income. The business itself does not file anything: its profit is '
      + 'reported on form T2125 inside this return. That is the whole difference '
      + 'between an unincorporated business and a corporation, and it is why there is '
      + 'no T2 on your calendar.',
    authority: 'CRA',
    form: 'T1 with T2125',
    weight: 'critical',
    schedule: { kind: 'calendar', month: 6, day: 15 },
    leadDays: 45,
    penalty:
      '5% of the balance owing, plus 1% for each full month late, up to 12 months. '
      + 'A return with nothing owing is not penalised, but it can hold up benefit '
      + 'payments that are calculated from it.',
    link: { label: 'Self-employed: dates and deadlines', url: CRA_SELF_EMPLOYED },
    applies: () => true,
  },

  /**
   * Personal instalments are quarterly and on fixed dates, which is the one
   * thing about them that is simpler than the corporate version. What is not
   * simpler: the threshold is net tax owing over $3,000 in the current year and
   * in either of the two before it, so a first profitable year does not trigger
   * them and the second one does.
   */
  {
    id: 't1-instalments',
    entities: ['soleProprietorship'],
    title: 'Personal tax instalment',
    detail:
      'Required when net tax owing is over $3,000 in the current year and in either '
      + 'of the two years before it. The dates are fixed: 15 March, 15 June, '
      + '15 September and 15 December, whatever the business does. CRA sends '
      + 'instalment reminders, and following those reminder amounts exactly is a safe '
      + 'harbour, so paying what the reminder says protects you from instalment '
      + 'interest even if the year turns out bigger.',
    authority: 'CRA',
    form: 'instalment',
    weight: 'important',
    schedule: { kind: 'personalInstalments' },
    leadDays: 14,
    penalty: 'Instalment interest, and a further penalty once that interest passes $1,000.',
    link: { label: 'Paying by instalments', url: CRA_INSTALMENTS },
    notInFirstYear: true,
    applies: (p) => p.lastYearTaxPayable > 3000,
  },

  /**
   * The same 30 April and 15 June split again, in a different tax.
   *
   * An individual who is an annual GST/HST filer on a December year end files
   * by 15 June and pays by 30 April. This is the deadline the corporate rule
   * above says does not apply to corporations, and here is where it does apply.
   * A non-December year end puts the filer back on the ordinary three months,
   * which is why the fiscal period matters.
   */
  {
    id: 'hst-annual-individual-payment',
    entities: ['soleProprietorship'],
    title: 'HST payment',
    detail:
      'An individual who files GST/HST annually with a 31 December year end pays by '
      + '30 April, six weeks before the return itself is due. It is the same split as '
      + 'the personal return, and for the same reason: the filing date was extended '
      + 'for self-employed people and the payment date was not.',
    authority: 'CRA',
    form: 'payment',
    weight: 'critical',
    schedule: { kind: 'calendar', month: 4, day: 30 },
    leadDays: 30,
    penalty: 'Interest on the balance from 1 May.',
    link: { label: 'GST/HST for businesses', url: CRA_HST },
    applies: (p) => p.hst.registered && p.hst.period === 'annual'
      && p.fiscalYearEnd.month === 12 && p.fiscalYearEnd.day === 31,
  },

  {
    id: 'hst-annual-individual-return',
    entities: ['soleProprietorship'],
    title: 'HST return',
    detail:
      'The return itself is due 15 June, matching the personal return it sits '
      + 'beside. The money was due on 30 April.',
    authority: 'CRA',
    form: 'GST34',
    weight: 'critical',
    schedule: { kind: 'calendar', month: 6, day: 15 },
    leadDays: 30,
    penalty: 'A penalty based on the balance owing, plus interest.',
    link: { label: 'GST/HST for businesses', url: CRA_HST },
    applies: (p) => p.hst.registered && p.hst.period === 'annual'
      && p.fiscalYearEnd.month === 12 && p.fiscalYearEnd.day === 31,
  },

  /**
   * An Ontario business name registration lasts five years and then stops
   * existing. Nothing chases it: no return depends on it, no authority writes,
   * and the usual way it is discovered is a bank refusing to deposit a cheque
   * made out to a name that is no longer registered.
   *
   * Only for a business trading under something other than the owner's own
   * name, because a sole proprietor using their own legal name does not have to
   * register at all.
   */
  {
    id: 'business-name-renewal',
    entities: ['soleProprietorship'],
    title: 'Renew the business name registration',
    detail:
      'An Ontario business name registration expires five years after it is made and '
      + 'has to be renewed through the Ontario Business Registry. Nothing reminds you: '
      + 'there is no return attached to it and no penalty for letting it lapse, so it '
      + 'is usually found out at a bank, when a cheque made out to a name that is no '
      + 'longer registered cannot be deposited. Renewing is cheaper and faster than '
      + 'registering again.',
    authority: 'Ontario',
    form: 'Business name renewal',
    weight: 'important',
    schedule: { kind: 'everyNYearsFrom', years: 5,
      from: (p) => p.businessNameRegisteredOn || p.incorporationDate },
    leadDays: 60,
    penalty:
      'No fine, but the registration simply ends. Operating under an unregistered '
      + 'name is an offence under the Business Names Act, and in practice the cost is '
      + 'a bank account and contracts in a name that no longer exists on the register.',
    link: { label: 'Ontario Business Registry', url: OBR },
    applies: (p) => !!p.registeredBusinessName && p.permanentEstablishments.includes('ON'),
  },

  // ---------------------------------------------------------------- information

  {
    id: 't5018',
    title: 'Contract payment reporting',
    detail:
      'A business whose main activity is construction reports payments made to '
      + 'subcontractors on a T5018, six months after the reporting period it chose. '
      + 'This is an information return: no tax is paid with it, and it is still late '
      + 'if it is late.',
    authority: 'CRA',
    form: 'T5018',
    weight: 'routine',
    schedule: { kind: 'afterYearEnd', months: 6 },
    leadDays: 30,
    penalty: 'A per slip, per day penalty.',
    link: { label: 'Contract payment reporting', url: CRA_T2 },
    applies: (p) => p.isConstruction,
  },
];
