/**
 * The chart of accounts, mapped to GIFI codes from the first transaction.
 *
 * Schedules 100 and 125 of the T2 are GIFI coded financial statements: a
 * balance sheet and an income statement expressed in CRA's own numbered
 * account codes. If the ledger carries those codes from the start,
 * the year end financials fall out of it. Retrofit the mapping later and you
 * rebuild the ledger.
 *
 * This is deliberately a small chart. A one or two person corporation does not
 * need four hundred accounts, and every account here is one such a company
 * actually uses. Adding to it is adding a row.
 */

export type AccountKind = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  /** Short stable key used in the database and in URLs. */
  id: string;
  name: string;
  kind: AccountKind;
  /**
   * The GIFI code this rolls up into on the T2, as CRA's RC4088 lists it.
   *
   * Six of these were wrong until September 2026, checked against the guide
   * rather than recalled: travel sat on 8242, which is Subsidies and grants,
   * an income code; software on 8523, which is Meals and entertainment;
   * telephone on 8914, Equipment rental; HST recoverable on 1067, Interest
   * receivable; employer CPP and EI on 9061, Commissions; and source
   * deductions payable on 2650, which is not a GIFI code at all. A corporation
   * copying Schedule 125 from this screen would have reported its travel as a
   * government grant.
   */
  gifi: number;
  /**
   * The line on form T2125 for an unincorporated business.
   *
   * Not the GIFI code, although the two coincide more often than not, which is
   * what made printing one as the other look right. Where they differ they
   * differ in ways that matter: telephone is 9225 in GIFI and 9220 on the
   * T2125; the employer's share of CPP is 8622 in GIFI and folded into 9060 on
   * the T2125. Income statement accounts only.
   */
  t2125?: number;
  /** Whether HST is normally charged or claimable on this account. */
  hst: 'standard' | 'zero-rated' | 'exempt' | 'none';
  /**
   * Current, for the balance sheet. Schedule 100 splits assets and liabilities
   * into current and everything else, so the classification has to live with
   * the account rather than being guessed at year end.
   *
   * Only meaningful on assets and liabilities.
   */
  current?: boolean;
  hint?: string;
}

export const ACCOUNTS: Account[] = [
  // Balance sheet, GIFI 1000 to 3999. Schedule 100.
  { id: 'bank',            name: 'Bank',                       kind: 'asset',     gifi: 1001, hst: 'none', current: true },
  { id: 'receivable',      name: 'Accounts receivable',        kind: 'asset',     gifi: 1060, hst: 'none', current: true },
  { id: 'gst-receivable',  name: 'HST recoverable',            kind: 'asset',     gifi: 1066, hst: 'none', current: true,
    hint: 'Input tax credits accumulated but not yet claimed.' },
  { id: 'equipment',       name: 'Computer equipment',         kind: 'asset',     gifi: 1774, hst: 'standard', current: false,
    hint: 'Capital. Class 50 for computers, which matters at year end.' },
  { id: 'payable',         name: 'Accounts payable',           kind: 'liability', gifi: 2620, hst: 'none', current: true },
  { id: 'gst-payable',     name: 'HST payable',                kind: 'liability', gifi: 2680, hst: 'none', current: true },
  { id: 'payroll-payable', name: 'Source deductions payable',  kind: 'liability', gifi: 2627, hst: 'none', current: true },
  { id: 'tax-payable',     name: 'Income tax payable',         kind: 'liability', gifi: 2680, hst: 'none', current: true },
  { id: 'due-shareholder', name: 'Due to shareholder',         kind: 'liability', gifi: 2781, hst: 'none', current: true,
    hint: 'Money you put in, or took out, that is not salary or a dividend.' },
  { id: 'share-capital',   name: 'Share capital',              kind: 'equity',    gifi: 3500, hst: 'none' },
  { id: 'retained',        name: 'Retained earnings',          kind: 'equity',    gifi: 3600, hst: 'none' },
  { id: 'dividends-paid',  name: 'Dividends declared',         kind: 'equity',    gifi: 3701, hst: 'none' },

  // Income statement, GIFI 8000 to 9999. Schedule 125.
  { id: 'sales',           name: 'Sales',                      kind: 'revenue',   gifi: 8000, t2125: 8299, hst: 'standard' },
  { id: 'sales-zero',      name: 'Sales, zero rated',          kind: 'revenue',   gifi: 8000, t2125: 8299, hst: 'zero-rated',
    hint: 'Exports and other zero rated supplies. HST is charged at 0%, and the input tax credits are still claimable.' },
  { id: 'interest-income', name: 'Interest income',            kind: 'revenue',   gifi: 8090, t2125: 8230, hst: 'exempt' },

  { id: 'subcontract',     name: 'Subcontractors',             kind: 'expense',   gifi: 8360, t2125: 8360, hst: 'standard' },
  { id: 'salaries',        name: 'Salaries and wages',         kind: 'expense',   gifi: 9060, t2125: 9060, hst: 'none' },
  { id: 'benefits',        name: 'Employer portion, CPP and EI', kind: 'expense', gifi: 8622, t2125: 9060, hst: 'none' },
  { id: 'rent',            name: 'Rent',                       kind: 'expense',   gifi: 8910, t2125: 8910, hst: 'standard' },
  { id: 'software',        name: 'Software and subscriptions', kind: 'expense',   gifi: 9150, t2125: 8810, hst: 'standard',
    hint: 'Watch for suppliers outside Canada: no HST charged means nothing to claim.' },
  { id: 'professional',    name: 'Professional fees',          kind: 'expense',   gifi: 8860, t2125: 8860, hst: 'standard' },
  { id: 'insurance',       name: 'Insurance',                  kind: 'expense',   gifi: 8690, t2125: 8690, hst: 'exempt',
    hint: 'Insurance is exempt, so there is no HST on it to claim.' },
  { id: 'telephone',       name: 'Telephone and internet',     kind: 'expense',   gifi: 9225, t2125: 9220, hst: 'standard' },
  { id: 'travel',          name: 'Travel',                     kind: 'expense',   gifi: 9200, t2125: 9200, hst: 'standard' },
  { id: 'meals',           name: 'Meals and entertainment',    kind: 'expense',   gifi: 8523, t2125: 8523, hst: 'standard',
    hint: 'Only half is deductible for income tax, and only half the HST is claimable.' },
  { id: 'vehicle',         name: 'Motor vehicle',              kind: 'expense',   gifi: 9281, t2125: 9281, hst: 'standard' },
  { id: 'office',          name: 'Office supplies',            kind: 'expense',   gifi: 8811, t2125: 8811, hst: 'standard' },
  { id: 'bank-charges',    name: 'Bank charges and interest',  kind: 'expense',   gifi: 8710, t2125: 8710, hst: 'exempt',
    hint: 'Financial services are exempt, so there is no HST to claim.' },
  { id: 'dues',            name: 'Government fees and dues',   kind: 'expense',   gifi: 8760, t2125: 8760, hst: 'exempt' },
];

export const ACCOUNT_BY_ID = new Map(ACCOUNTS.map((a) => [a.id, a]));

/** Ontario. The only rate FileClear needs while it is Ontario only. */
export const HST_RATE = 0.13;

/**
 * Only half of a meal is deductible, and only half of its HST is claimable.
 * Modelled here rather than in the return so the ledger stays the record of
 * what happened and the return stays a calculation over it.
 */
export const CLAIMABLE_FRACTION: Record<string, number> = { meals: 0.5 };

export function accountsOfKind(kind: AccountKind): Account[] {
  return ACCOUNTS.filter((a) => a.kind === kind);
}
