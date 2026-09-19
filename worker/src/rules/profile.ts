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

/**
 * Incorporated, or not.
 *
 * The two are different products wearing one name, and pretending otherwise is
 * how a sole proprietor gets told to file a T2. A corporation is a separate
 * taxpayer: it files its own return, it pays its own tax, and taking money out
 * of it is a second decision with its own tax consequences. A sole
 * proprietorship is its owner. There is no second taxpayer, no annual return to
 * any registry, no dividend, and the business's profit lands on a personal
 * return that was already going to be filed.
 *
 * Almost every date moves. The pair worth knowing: a self-employed person's T1
 * is due 15 June but the balance is due 30 April, so the return and the money
 * are on different days, and an annual HST filer on a December year end is on
 * exactly the same split. A corporation has neither.
 *
 * Partnerships are not here. A two person partnership is a real and common
 * shape, and it brings a T5013 and an allocation between partners that this
 * would have to do properly rather than approximately.
 */
export type EntityType = 'corporation' | 'soleProprietorship';

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

  /**
   * Incorporated or not. Everything downstream turns on this, so it is asked
   * first and it is not optional.
   *
   * Defaults to 'corporation' when read from a row written before this field
   * existed, which is right: every company in the database at that point was
   * one.
   */
  entityType: EntityType;

  /**
   * Where it was incorporated, not where it operates.
   *
   * For a sole proprietorship there is nothing to incorporate, so this is where
   * the business operates from and it decides which province's rules apply.
   */
  jurisdiction: Jurisdiction;

  /**
   * Date of incorporation, ISO yyyy-mm-dd. For a sole proprietorship, the date
   * the business started, which is what the first T2125 reports from.
   *
   * Load bearing for federal corporations: the Corporations Canada annual
   * return is due within 60 days of the anniversary of this date, which has
   * nothing to do with the fiscal year end. Ontario corporations file on the
   * fiscal year instead, so for them this only sets the first tax year.
   */
  incorporationDate: string;

  /**
   * The chosen fiscal year end. Not necessarily 31 December.
   *
   * A corporation picks one. A sole proprietorship does not: an unincorporated
   * business has a calendar year fiscal period unless it has elected an
   * alternative method, which is rare and brings an adjustment every year.
   * `normalise` enforces that rather than letting the form offer a choice that
   * does not exist.
   */
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

  /**
   * Tax payable last year, which decides instalments. Over $3,000 and they are
   * required, for a corporation and for a self-employed individual alike,
   * though on different dates.
   */
  lastYearTaxPayable: number;

  /**
   * Sole proprietorships only: whether the business trades under a name other
   * than the owner's own legal name.
   *
   * It matters because a registered business name in Ontario expires after five
   * years. Nothing chases it, no return depends on it, and a lapsed
   * registration is usually discovered at a bank.
   */
  registeredBusinessName?: boolean;

  /**
   * Sole proprietorships only: when the business name was registered, so the
   * five year renewal can be dated. Defaults to the business start date.
   */
  businessNameRegisteredOn?: string;

  /** Email before a window closes, and how far ahead to start. */
  reminders: { email: boolean; leadDays: number };
}

/**
 * A sensible starting point for onboarding, so the form is never empty. Every
 * field is still asked; these are defaults, not assumptions carried into the
 * plan.
 */
export function blankProfile(): CompanyProfile {
  return {
    legalName: '',
    entityType: 'corporation',
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
    reminders: { email: true, leadDays: 14 },
  };
}


/**
 * The facts a profile cannot be wrong about, applied after the form is read.
 *
 * A sole proprietorship has no share capital, so it is not a CCPC, cannot claim
 * the small business deduction and cannot pay a dividend. Its fiscal period is
 * the calendar year. Leaving any of those as whatever the form last held
 * produces a plan that contradicts itself: a T5 slip for a business with no
 * shareholders, or a September year end on a return that only knows December.
 *
 * Enforced here rather than in the view, so that an import, a test fixture and
 * a form all land in the same place.
 */
export function normalise(p: CompanyProfile): CompanyProfile {
  if (p.entityType !== 'soleProprietorship') return p;
  return {
    ...p,
    fiscalYearEnd: { month: 12, day: 31 },
    isCCPC: false,
    claimsSmallBusinessDeduction: false,
    paysDividends: false,
  };
}

/**
 * What to call the date the business began, and the entity, on screen.
 *
 * One place rather than a conditional at every label. "Date of incorporation"
 * on a sole proprietor's set-up form is the kind of small wrongness that tells
 * somebody the product was not built for them.
 */
export function words(t: EntityType): {
  entity: string; entityPlural: string; started: string; nameLabel: string;
} {
  return t === 'soleProprietorship'
    ? { entity: 'business', entityPlural: 'businesses', started: 'Date the business started',
        nameLabel: 'Business name' }
    : { entity: 'corporation', entityPlural: 'corporations', started: 'Date of incorporation',
        nameLabel: 'Legal name' };
}
