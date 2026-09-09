import type { CompanyProfile, Jurisdiction, HstPeriod, HstMethod, RemitterType } from './rules/profile';

/**
 * Between a companies row and a CompanyProfile.
 *
 * The engine takes a plain object and knows nothing about D1, which is what
 * makes it testable without a database. This file is the only place that knows
 * both shapes, so a schema change breaks in one place rather than everywhere.
 */

export interface CompanyRow {
  id: string;
  account_id: string;
  legal_name: string;
  jurisdiction: string;
  incorporation_date: string;
  fye_month: number;
  fye_day: number;
  is_ccpc: number;
  claims_sbd: number;
  gross_revenue: number;
  last_year_tax_payable: number;
  hst_registered: number;
  hst_period: string;
  hst_method: string;
  hst_last_year_net_tax: number;
  payroll_account: number;
  payroll_remitter: string;
  payroll_on_remuneration: number;
  pays_dividends: number;
  is_construction: number;
}

const JURISDICTIONS: Jurisdiction[] = [
  'CBCA', 'ON', 'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'PE', 'QC', 'SK', 'YT',
];
const PERIODS: HstPeriod[] = ['annual', 'quarterly', 'monthly'];
const METHODS: HstMethod[] = ['regular', 'quick'];
const REMITTERS: RemitterType[] = ['quarterly', 'regular', 'accelerated1', 'accelerated2'];

/** Falls back rather than throwing: a bad value should not lock a company out
 *  of its own dashboard, and the safest fallback is the commonest case. */
function oneOf<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export function rowToProfile(row: CompanyRow, provinces: string[]): CompanyProfile {
  return {
    legalName: row.legal_name,
    jurisdiction: oneOf(row.jurisdiction, JURISDICTIONS, 'ON'),
    incorporationDate: row.incorporation_date,
    fiscalYearEnd: { month: row.fye_month, day: row.fye_day },
    isCCPC: !!row.is_ccpc,
    claimsSmallBusinessDeduction: !!row.claims_sbd,
    grossRevenue: row.gross_revenue,
    permanentEstablishments: provinces
      .map((p) => oneOf(p, JURISDICTIONS, 'ON'))
      .filter((p, i, a) => a.indexOf(p) === i),
    hst: {
      registered: !!row.hst_registered,
      period: oneOf(row.hst_period, PERIODS, 'annual'),
      method: oneOf(row.hst_method, METHODS, 'regular'),
      lastYearNetTax: row.hst_last_year_net_tax,
    },
    payroll: {
      hasAccount: !!row.payroll_account,
      remitter: oneOf(row.payroll_remitter, REMITTERS, 'regular'),
      ontarioRemuneration: row.payroll_on_remuneration,
    },
    paysDividends: !!row.pays_dividends,
    isConstruction: !!row.is_construction,
    lastYearTaxPayable: row.last_year_tax_payable,
  };
}

/** The column list and values for an insert or update, in one place. */
export function profileToColumns(p: CompanyProfile): Record<string, string | number> {
  return {
    legal_name: p.legalName,
    jurisdiction: p.jurisdiction,
    incorporation_date: p.incorporationDate,
    fye_month: p.fiscalYearEnd.month,
    fye_day: p.fiscalYearEnd.day,
    is_ccpc: p.isCCPC ? 1 : 0,
    claims_sbd: p.claimsSmallBusinessDeduction ? 1 : 0,
    gross_revenue: Math.round(p.grossRevenue),
    last_year_tax_payable: Math.round(p.lastYearTaxPayable),
    hst_registered: p.hst.registered ? 1 : 0,
    hst_period: p.hst.period,
    hst_method: p.hst.method,
    hst_last_year_net_tax: Math.round(p.hst.lastYearNetTax),
    payroll_account: p.payroll.hasAccount ? 1 : 0,
    payroll_remitter: p.payroll.remitter,
    payroll_on_remuneration: Math.round(p.payroll.ontarioRemuneration),
    pays_dividends: p.paysDividends ? 1 : 0,
    is_construction: p.isConstruction ? 1 : 0,
  };
}

export async function saveCompany(
  db: D1Database, id: string, accountId: string, p: CompanyProfile,
): Promise<void> {
  const cols = profileToColumns(p);
  const names = Object.keys(cols);
  const placeholders = names.map(() => '?').join(', ');
  const updates = names.map((n) => `${n} = excluded.${n}`).join(', ');

  await db.prepare(
    `INSERT INTO companies (id, account_id, ${names.join(', ')})
     VALUES (?, ?, ${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}, updated_at = datetime('now')`,
  ).bind(id, accountId, ...Object.values(cols)).run();

  // Rewritten wholesale rather than diffed. The list is at most thirteen rows
  // and a diff here would be more code than it saves.
  await db.prepare('DELETE FROM company_provinces WHERE company_id = ?').bind(id).run();
  if (p.permanentEstablishments.length) {
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO company_provinces (company_id, jurisdiction) VALUES (?, ?)');
    await db.batch(p.permanentEstablishments.map((j) => stmt.bind(id, j)));
  }
}

export async function loadCompany(
  db: D1Database, id: string, accountId: string,
): Promise<{ id: string; profile: CompanyProfile } | null> {
  const row = await db.prepare('SELECT * FROM companies WHERE id = ? AND account_id = ?')
    .bind(id, accountId).first<CompanyRow>();
  if (!row) return null;
  const provinces = await db.prepare(
    'SELECT jurisdiction FROM company_provinces WHERE company_id = ?').bind(id)
    .all<{ jurisdiction: string }>();
  return { id: row.id, profile: rowToProfile(row, (provinces.results ?? []).map((r) => r.jurisdiction)) };
}

export async function firstCompanyFor(
  db: D1Database, accountId: string,
): Promise<{ id: string; profile: CompanyProfile } | null> {
  const row = await db.prepare(
    'SELECT id FROM companies WHERE account_id = ? ORDER BY created_at LIMIT 1')
    .bind(accountId).first<{ id: string }>();
  return row ? loadCompany(db, row.id, accountId) : null;
}

export async function filingStates(
  db: D1Database, companyId: string,
): Promise<Map<string, string>> {
  const rows = await db.prepare(
    'SELECT filing_id, state FROM filing_states WHERE company_id = ?')
    .bind(companyId).all<{ filing_id: string; state: string }>();
  return new Map((rows.results ?? []).map((r) => [r.filing_id, r.state]));
}

export async function setFilingState(
  db: D1Database, companyId: string, filingId: string, state: 'done' | 'dismissed' | null,
): Promise<void> {
  if (state === null) {
    await db.prepare('DELETE FROM filing_states WHERE company_id = ? AND filing_id = ?')
      .bind(companyId, filingId).run();
    return;
  }
  await db.prepare(
    `INSERT INTO filing_states (company_id, filing_id, state) VALUES (?, ?, ?)
     ON CONFLICT(company_id, filing_id) DO UPDATE SET state = excluded.state,
       changed_at = datetime('now')`,
  ).bind(companyId, filingId, state).run();
}
