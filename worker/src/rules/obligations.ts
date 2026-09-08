import type { CompanyProfile } from './profile';

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
  /** Each fiscal quarter, N months after the quarter closes. HST and instalments. */
  | { kind: 'quarterlyAfterQuarterEnd'; months: number };

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
}

const CRA_T2 = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations.html';
const CRA_HST = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html';
const CRA_PAYROLL = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll.html';
const OBR = 'https://www.ontario.ca/page/ontario-business-registry';
const CORPORATIONS_CANADA = 'https://ised-isde.canada.ca/site/corporations-canada/en';
const ON_EHT = 'https://www.ontario.ca/document/employer-health-tax-eht';

export const OBLIGATIONS: Obligation[] = [
  // ----------------------------------------------------------------- income tax

  {
    id: 't2-return',
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

  {
    id: 't2-instalments',
    title: 'Corporate tax instalment',
    detail:
      'A corporation whose tax payable was over $3,000 in either of the last two '
      + 'years pays by instalment rather than in one balance. New corporations are '
      + 'not required to pay instalments in their first tax year.',
    authority: 'CRA',
    form: 'instalment',
    weight: 'important',
    schedule: { kind: 'quarterlyAfterQuarterEnd', months: 0 },
    leadDays: 14,
    penalty: 'Instalment interest, and a further penalty once that interest passes $1,000.',
    link: { label: 'Corporation instalments', url: CRA_T2 },
    applies: (p) => p.lastYearTaxPayable > 3000,
  },

  // ------------------------------------------------------------- annual returns

  {
    id: 'annual-return-on',
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
    title: 'Federal annual return',
    detail:
      'A corporation incorporated federally files its annual return with Corporations '
      + 'Canada within sixty days of the anniversary of the date it was incorporated. '
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

  // -------------------------------------------------------------------- GST/HST

  {
    id: 'hst-annual',
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
    schedule: { kind: 'quarterlyAfterQuarterEnd', months: 1 },
    leadDays: 7,
    penalty:
      'Up to 10% of the amount, and directors can be held personally liable for '
      + 'unremitted source deductions.',
    link: { label: 'Remitting source deductions', url: CRA_PAYROLL },
    applies: (p) => p.payroll.hasAccount && p.payroll.remitter === 'quarterly',
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
