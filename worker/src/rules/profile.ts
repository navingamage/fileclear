/**
 * What FileClear needs to know about a corporation before it can say what that
 * corporation owes.
 *
 * Everything here is a fact a director can answer from their incorporation
 * documents and their last return, or that we can derive. Nothing here is an
 * accounting judgement. The moment a field needs a CPA to fill in, it belongs
 * somewhere else.
 *
 * The whole point of this file is that the plan is built from the company
 * rather than assumed. A federal corporation and an Ontario one file different
 * annual returns on different clocks; an annual HST filer and a quarterly one
 * are on different cycles entirely; a corporation that pays a salary has twelve
 * more deadlines a year than one that pays dividends.
 */

/** Where the corporation is incorporated, which decides who gets the annual return. */
export type Jurisdiction =
  | 'CBCA' // Federal, Canada Business Corporations Act
  | 'ON'
  | 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'PE' | 'QC' | 'SK' | 'YT';

/**
 * GST/HST reporting period. Assigned by CRA from annual taxable supplies, and
 * a registrant may elect a more frequent one.
 *
 * Thresholds, which the app uses to warn before a change is forced:
 *   up to $1.5M      annual
 *   $1.5M to $6M     quarterly
 *   over $6M         monthly
 */
export type HstPeriod = 'annual' | 'quarterly' | 'monthly';

/** Regular input tax credits, or the Quick Method election. */
export type HstMethod = 'regular' | 'quick';

/**
 * How often payroll source deductions are due. CRA assigns this from average
 * monthly withholding; a new employer starts as a regular remitter and small
 * employers can be moved to quarterly.
 */
export type RemitterType = 'quarterly' | 'regular' | 'accelerated1' | 'accelerated2';

/** A month and day with no year, for anniversaries and fiscal year ends. */
export interface MonthDay {
  month: number; // 1 to 12
  day: number;   // 1 to 31
}

export interface CompanyProfile {
  legalName: string;

  /** Where it was incorporated, not where it operates. */
  jurisdiction: Jurisdiction;

  /**
   * Date of incorporation, ISO yyyy-mm-dd.
   *
   * Load bearing for federal corporations: the Corporations Canada annual
   * return is due within 60 days of the anniversary of this date, which has
   * nothing to do with the fiscal year end. Ontario corporations file on the
   * fiscal year instead, so for them this only sets the first tax year.
   */
  incorporationDate: string;

  /** The chosen fiscal year end. Not necessarily 31 December. */
  fiscalYearEnd: MonthDay;

  /**
   * Canadian-controlled private corporation. Decides the small business
   * deduction, and with it whether the tax balance is due two months or three
   * months after year end.
   */
  isCCPC: boolean;

  /**
   * Whether the corporation is actually claiming the small business deduction.
   * A CCPC that has used up its business limit through associated corporations
   * gets the two month deadline, not the three month one.
   */
  claimsSmallBusinessDeduction: boolean;

  /**
   * Gross revenue for the last completed year, in dollars. Used to warn about
   * mandatory internet filing of the T2, and to anticipate an HST period change.
   */
  grossRevenue: number;

  /** Provinces and territories with a permanent establishment. Drives allocation. */
  permanentEstablishments: Jurisdiction[];

  hst: {
    registered: boolean;
    period: HstPeriod;
    method: HstMethod;
    /**
     * Net tax for the last year. An annual filer owing $3,000 or more has to
     * pay quarterly instalments, which is the obligation people are most often
     * unaware of until interest appears.
     */
    lastYearNetTax: number;
  };

  payroll: {
    /** An open RP account with CRA. True if anyone is paid a salary, including the owner. */
    hasAccount: boolean;
    remitter: RemitterType;
    /** Total Ontario remuneration, for the employer health tax exemption. */
    ontarioRemuneration: number;
  };

  /** Dividends paid to shareholders in the year, which produce T5 slips. */
  paysDividends: boolean;

  /** Construction. Payments to subcontractors produce a T5018 information return. */
  isConstruction: boolean;

  /** Whether corporate tax instalments are required, i.e. tax payable over $3,000. */
  lastYearTaxPayable: number;
}

/**
 * A sensible starting point for onboarding, so the form is never empty. Every
 * field is still asked; these are defaults, not assumptions carried into the
 * plan.
 */
export function blankProfile(): CompanyProfile {
  return {
    legalName: '',
    jurisdiction: 'ON',
    incorporationDate: '',
    fiscalYearEnd: { month: 12, day: 31 },
    isCCPC: true,
    claimsSmallBusinessDeduction: true,
    grossRevenue: 0,
    permanentEstablishments: ['ON'],
    hst: { registered: true, period: 'annual', method: 'regular', lastYearNetTax: 0 },
    payroll: { hasAccount: false, remitter: 'regular', ontarioRemuneration: 0 },
    paysDividends: false,
    isConstruction: false,
    lastYearTaxPayable: 0,
  };
}
