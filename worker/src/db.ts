import type {
  CompanyProfile, Jurisdiction, HstPeriod, HstMethod, RemitterType, EntityType,
} from './rules/profile';
import { normalise } from './rules/profile';
import type { HomeOfficeInput } from './rules/homeoffice';

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
  /** Optional, because every row written before sole proprietors existed has
   *  no value here and every one of those was a corporation. */
  entity_type?: string;
  registered_business_name?: number;
  business_name_registered_on?: string | null;
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
  remind_email?: number;
  remind_lead_days?: number;
}

const JURISDICTIONS: Jurisdiction[] = [
  'CBCA', 'ON', 'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'PE', 'QC', 'SK', 'YT',
];
const PERIODS: HstPeriod[] = ['annual', 'quarterly', 'monthly'];
const METHODS: HstMethod[] = ['regular', 'quick'];
const REMITTERS: RemitterType[] = ['quarterly', 'regular', 'accelerated1', 'accelerated2'];
const ENTITIES: EntityType[] = ['corporation', 'soleProprietorship'];

/** Falls back rather than throwing: a bad value should not lock a company out
 *  of its own dashboard, and the safest fallback is the commonest case. */
function oneOf<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export function rowToProfile(row: CompanyRow, provinces: string[]): CompanyProfile {
  return normalise({
    legalName: row.legal_name,
    // Falling back to 'corporation' is the right default rather than a safe
    // one: every row that predates this column was a corporation.
    entityType: oneOf(row.entity_type ?? 'corporation', ENTITIES, 'corporation'),
    registeredBusinessName: !!row.registered_business_name,
    businessNameRegisteredOn: row.business_name_registered_on || undefined,
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
    reminders: {
      email: row.remind_email === undefined ? true : !!row.remind_email,
      leadDays: Math.max(1, Math.min(90, row.remind_lead_days || 14)),
    },
  });
}

/** The column list and values for an insert or update, in one place. */
export function profileToColumns(p: CompanyProfile): Record<string, string | number> {
  return {
    legal_name: p.legalName,
    entity_type: p.entityType,
    registered_business_name: p.registeredBusinessName ? 1 : 0,
    business_name_registered_on: p.businessNameRegisteredOn ?? '',
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
    remind_email: p.reminders.email ? 1 : 0,
    remind_lead_days: Math.max(1, Math.min(90, Math.round(p.reminders.leadDays))),
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

export interface CompanySummary { id: string; legalName: string; }

/** Every corporation on the account, oldest first, for the switcher. */
export async function companiesFor(
  db: D1Database, accountId: string,
): Promise<CompanySummary[]> {
  const rows = await db.prepare(
    'SELECT id, legal_name FROM companies WHERE account_id = ? ORDER BY created_at')
    .bind(accountId).all<{ id: string; legal_name: string }>();
  return (rows.results ?? []).map((r) => ({ id: r.id, legalName: r.legal_name }));
}

/**
 * The corporation the account is currently working on.
 *
 * Falls back to the oldest when nothing is chosen, which is what an account
 * with one company always gets and means it never meets the idea of choosing.
 * Falls back again if the stored choice has been deleted, rather than showing
 * an empty dashboard for a company that is gone.
 */
export async function activeCompanyFor(
  db: D1Database, accountId: string,
): Promise<{ id: string; profile: CompanyProfile } | null> {
  const row = await db.prepare('SELECT active_company_id FROM accounts WHERE id = ?')
    .bind(accountId).first<{ active_company_id: string | null }>();
  if (row?.active_company_id) {
    const chosen = await loadCompany(db, row.active_company_id, accountId);
    if (chosen) return chosen;
  }
  return firstCompanyFor(db, accountId);
}

/** Records the switch. Ignores a company the account does not own. */
export async function setActiveCompany(
  db: D1Database, accountId: string, companyId: string,
): Promise<boolean> {
  const owned = await db.prepare(
    'SELECT id FROM companies WHERE id = ? AND account_id = ?')
    .bind(companyId, accountId).first();
  if (!owned) return false;
  await db.prepare('UPDATE accounts SET active_company_id = ? WHERE id = ?')
    .bind(companyId, accountId).run();
  return true;
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

// ------------------------------------------------------------- transactions

import type { LedgerLine } from './rules/hst';
import { DEFAULT_COUNTER } from './rules/postings';

export interface TxnRow {
  id: string;
  txn_date: string;
  account_id: string;
  amount_cents: number;
  hst_cents: number;
  /** Where the money came from or went to. See src/rules/postings.ts. */
  counter_account_id: string;
  description: string;
}

export async function addTransaction(
  db: D1Database, id: string, companyId: string, t: Omit<TxnRow, 'id'>,
): Promise<void> {
  await db.prepare(
    `INSERT INTO transactions
       (id, company_id, txn_date, account_id, amount_cents, hst_cents,
        counter_account_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, companyId, t.txn_date, t.account_id, t.amount_cents, t.hst_cents,
         t.counter_account_id, t.description).run();
}

export async function deleteTransaction(
  db: D1Database, companyId: string, id: string,
): Promise<void> {
  await db.prepare('DELETE FROM transactions WHERE id = ? AND company_id = ?')
    .bind(id, companyId).run();
}

export async function transactionsFor(
  db: D1Database, companyId: string, from?: string, to?: string,
): Promise<TxnRow[]> {
  const sql = from && to
    ? `SELECT id, txn_date, account_id, amount_cents, hst_cents,
              counter_account_id, description
         FROM transactions WHERE company_id = ? AND txn_date BETWEEN ? AND ?
        ORDER BY txn_date DESC, created_at DESC`
    : `SELECT id, txn_date, account_id, amount_cents, hst_cents,
              counter_account_id, description
         FROM transactions WHERE company_id = ? ORDER BY txn_date DESC, created_at DESC`;
  const stmt = from && to
    ? db.prepare(sql).bind(companyId, from, to)
    : db.prepare(sql).bind(companyId);
  const rows = await stmt.all<TxnRow>();
  return rows.results ?? [];
}

/** The engine works on plain lines and knows nothing about D1. */
export function toLedger(rows: TxnRow[]): LedgerLine[] {
  return rows.map((r) => ({
    date: r.txn_date,
    accountId: r.account_id,
    amount: r.amount_cents,
    hst: r.hst_cents,
    counterAccountId: r.counter_account_id || DEFAULT_COUNTER,
    description: r.description,
  }));
}

// -------------------------------------------------------------- phase 3

import type { AssetRecord } from './rules/cca';

interface AssetRow {
  id: string;
  class_number: number;
  description: string;
  available_for_use: string;
  cost_cents: number;
  disposed_on: string | null;
  proceeds_cents: number | null;
}

export async function assetsFor(db: D1Database, companyId: string): Promise<AssetRecord[]> {
  const rows = await db.prepare(
    `SELECT id, class_number, description, available_for_use, cost_cents,
            disposed_on, proceeds_cents
       FROM assets WHERE company_id = ? ORDER BY available_for_use, created_at`,
  ).bind(companyId).all<AssetRow>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    classNumber: r.class_number,
    description: r.description,
    availableForUse: r.available_for_use,
    costCents: r.cost_cents,
    ...(r.disposed_on ? { disposedOn: r.disposed_on } : {}),
    ...(r.proceeds_cents !== null ? { proceedsCents: r.proceeds_cents } : {}),
  }));
}

export async function addAsset(
  db: D1Database, id: string, companyId: string, a: Omit<AssetRecord, 'id'>,
): Promise<void> {
  await db.prepare(
    `INSERT INTO assets
       (id, company_id, class_number, description, available_for_use, cost_cents,
        disposed_on, proceeds_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, companyId, a.classNumber, a.description, a.availableForUse, a.costCents,
         a.disposedOn ?? null, a.proceedsCents ?? null).run();
}

export async function deleteAsset(
  db: D1Database, companyId: string, id: string,
): Promise<void> {
  await db.prepare('DELETE FROM assets WHERE company_id = ? AND id = ?')
    .bind(companyId, id).run();
}

/** Only reductions are stored. An absent class is claimed in full. */
export async function ccaClaims(
  db: D1Database, companyId: string, yearEnd: string,
): Promise<Record<number, number>> {
  const rows = await db.prepare(
    'SELECT class_number, claimed_cents FROM cca_claims WHERE company_id = ? AND year_end = ?',
  ).bind(companyId, yearEnd).all<{ class_number: number; claimed_cents: number }>();
  const out: Record<number, number> = {};
  for (const r of rows.results ?? []) out[r.class_number] = r.claimed_cents;
  return out;
}

export async function setCcaClaim(
  db: D1Database, companyId: string, yearEnd: string,
  classNumber: number, claimedCents: number | null,
): Promise<void> {
  if (claimedCents === null) {
    await db.prepare(
      'DELETE FROM cca_claims WHERE company_id = ? AND year_end = ? AND class_number = ?',
    ).bind(companyId, yearEnd, classNumber).run();
    return;
  }
  await db.prepare(
    `INSERT INTO cca_claims (company_id, year_end, class_number, claimed_cents)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (company_id, year_end, class_number)
       DO UPDATE SET claimed_cents = excluded.claimed_cents`,
  ).bind(companyId, yearEnd, classNumber, claimedCents).run();
}

// ------------------------------------------------------------ the payroll

import type { Employee, PayFrequency } from './rules/payroll';

interface EmployeeRow {
  id: string;
  name: string;
  annual_salary_cents: number;
  voting_share_pct: number;
  pay_frequency: string;
}

const FREQUENCIES: PayFrequency[] = ['monthly', 'semi-monthly', 'biweekly', 'weekly'];

export async function employeesFor(
  db: D1Database, companyId: string,
): Promise<Employee[]> {
  const rows = await db.prepare(
    `SELECT id, name, annual_salary_cents, voting_share_pct, pay_frequency
       FROM employees WHERE company_id = ? ORDER BY created_at`,
  ).bind(companyId).all<EmployeeRow>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    annualSalary: r.annual_salary_cents,
    votingSharePct: r.voting_share_pct,
    frequency: oneOf(r.pay_frequency, FREQUENCIES, 'monthly'),
  }));
}

export async function addEmployee(
  db: D1Database, id: string, companyId: string, e: Omit<Employee, 'id'>,
): Promise<void> {
  await db.prepare(
    `INSERT INTO employees
       (id, company_id, name, annual_salary_cents, voting_share_pct, pay_frequency)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, companyId, e.name, e.annualSalary, e.votingSharePct, e.frequency).run();
}

export async function deleteEmployee(
  db: D1Database, companyId: string, id: string,
): Promise<void> {
  await db.prepare('DELETE FROM employees WHERE company_id = ? AND id = ?')
    .bind(companyId, id).run();
}

// ------------------------------------------------------------------ billing

import type { Subscription, WebhookSubscription } from './stripe';

export async function subscriptionFor(
  db: D1Database, accountId: string,
): Promise<{ sub: Subscription | null; customerId: string | null; trialEndsAt: string | null }> {
  const row = await db.prepare(
    `SELECT s.status, s.current_period_end, s.cancel_at_period_end, s.plan,
            s.stripe_customer_id, a.trial_ends_at
       FROM accounts a LEFT JOIN subscriptions s ON s.account_id = a.id
      WHERE a.id = ?`,
  ).bind(accountId).first<{
    status: string | null; current_period_end: number | null;
    cancel_at_period_end: number | null; plan: string | null;
    stripe_customer_id: string | null; trial_ends_at: string | null;
  }>();

  if (!row) return { sub: null, customerId: null, trialEndsAt: null };

  return {
    sub: row.status
      ? {
        status: row.status,
        currentPeriodEnd: row.current_period_end ?? 0,
        cancelAtPeriodEnd: !!row.cancel_at_period_end,
        plan: row.plan ?? '',
      }
      : null,
    customerId: row.stripe_customer_id,
    trialEndsAt: row.trial_ends_at,
  };
}

/**
 * Records what Stripe said, keyed by account where the event carries one and by
 * customer otherwise. A subscription update does not always name the account,
 * so the customer id written at checkout is what ties the two together.
 */
export async function recordSubscription(
  db: D1Database, s: WebhookSubscription,
): Promise<boolean> {
  let accountId = s.accountId;
  if (!accountId && s.customerId) {
    const row = await db.prepare(
      'SELECT account_id FROM subscriptions WHERE stripe_customer_id = ?')
      .bind(s.customerId).first<{ account_id: string }>();
    accountId = row?.account_id;
  }
  if (!accountId) return false;

  await db.prepare(
    `INSERT INTO subscriptions
       (account_id, stripe_customer_id, stripe_subscription_id, status,
        current_period_end, cancel_at_period_end, plan, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (account_id) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       status = excluded.status,
       -- A checkout event has no period end on it, so an update that does not
       -- know one must not wipe the one already recorded.
       current_period_end = CASE WHEN excluded.current_period_end > 0
         THEN excluded.current_period_end ELSE subscriptions.current_period_end END,
       cancel_at_period_end = excluded.cancel_at_period_end,
       plan = CASE WHEN excluded.plan != '' THEN excluded.plan ELSE subscriptions.plan END,
       updated_at = datetime('now')`,
  ).bind(accountId, s.customerId, s.subscriptionId, s.status,
         s.currentPeriodEnd, s.cancelAtPeriodEnd ? 1 : 0, s.plan).run();
  return true;
}

/**
 * The trial is set once, when the account is created.
 *
 * Counted from the caller's date rather than from the UTC instant. Everything
 * else in this product runs on Toronto's clock, and after 20:00 there the two
 * are different days, so a thirty day trial set from UTC reads as thirty one
 * days left on the screen that counts it.
 */
export async function startTrial(
  db: D1Database, accountId: string, days: number, todayIso: string,
): Promise<string> {
  const ends = new Date(Date.parse(`${todayIso}T00:00:00Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
  await db.prepare('UPDATE accounts SET trial_ends_at = ? WHERE id = ? AND trial_ends_at IS NULL')
    .bind(ends, accountId).run();
  return ends;
}

// -------------------------------------------------------- reading a bank file

import { descriptionKey, rowFingerprint, type Remembered } from './rules/csv';

export async function importRules(
  db: D1Database, companyId: string,
): Promise<Remembered[]> {
  const rows = await db.prepare(
    'SELECT pattern, account_id FROM import_rules WHERE company_id = ?',
  ).bind(companyId).all<{ pattern: string; account_id: string }>();
  return (rows.results ?? []).map((r) => ({ pattern: r.pattern, accountId: r.account_id }));
}

/** Remembers a correction, so the next import of the same supplier is right. */
export async function rememberImportRule(
  db: D1Database, companyId: string, description: string, accountId: string,
): Promise<void> {
  const pattern = descriptionKey(description);
  if (!pattern) return;
  await db.prepare(
    `INSERT INTO import_rules (company_id, pattern, account_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (company_id, pattern) DO UPDATE SET account_id = excluded.account_id,
       updated_at = excluded.updated_at`,
  ).bind(companyId, pattern, accountId).run();
}

/**
 * Fingerprints of everything already in the ledger.
 *
 * Loaded whole rather than queried per row: a small corporation's ledger is
 * thousands of rows at most, and one read beats one query per line of a
 * statement.
 */
export async function ledgerFingerprints(
  db: D1Database, companyId: string,
): Promise<Set<string>> {
  const rows = await db.prepare(
    `SELECT txn_date, amount_cents, hst_cents, account_id, description
       FROM transactions WHERE company_id = ?`,
  ).bind(companyId).all<{
    txn_date: string; amount_cents: number; hst_cents: number;
    account_id: string; description: string;
  }>();

  const out = new Set<string>();
  for (const r of rows.results ?? []) {
    // The bank saw the gross, and revenue arrives positive while everything
    // else leaves as negative, so the sign is reconstructed the same way the
    // import derived it.
    const gross = r.amount_cents + r.hst_cents;
    for (const signed of [gross, -gross]) {
      out.add(rowFingerprint(r.txn_date, signed, r.description));
    }
  }
  return out;
}

// -------------------------------------------------- business use of home

/**
 * The home office inputs for one fiscal year, or nothing if none were saved.
 *
 * The inputs are stored rather than the claim, so the figure can be rebuilt and
 * explained years later. A stored claim would freeze the arithmetic at whatever
 * the code did on the day it was written, which is the same failure this
 * product avoids by recomputing filings from the profile.
 */
export async function homeOfficeFor(
  db: D1Database, companyId: string, yearEnd: string,
): Promise<HomeOfficeInput | null> {
  const row = await db.prepare(
    `SELECT home_area, work_area, hours_per_week, rent_cents, mortgage_interest_cents,
            property_tax_cents, insurance_cents, utilities_cents, maintenance_cents
       FROM home_office WHERE company_id = ? AND year_end = ?`,
  ).bind(companyId, yearEnd).first<{
    home_area: number; work_area: number; hours_per_week: number | null;
    rent_cents: number; mortgage_interest_cents: number; property_tax_cents: number;
    insurance_cents: number; utilities_cents: number; maintenance_cents: number;
  }>();
  if (!row) return null;
  return {
    homeArea: row.home_area,
    workArea: row.work_area,
    // Null means a room used only for the business, which is not prorated by
    // time. Zero would mean it is never used, which is a different claim
    // entirely, so the distinction survives the round trip.
    hoursPerWeek: row.hours_per_week === null ? undefined : row.hours_per_week,
    rent: row.rent_cents,
    mortgageInterest: row.mortgage_interest_cents,
    propertyTax: row.property_tax_cents,
    homeInsurance: row.insurance_cents,
    utilities: row.utilities_cents,
    maintenance: row.maintenance_cents,
  };
}

export async function saveHomeOffice(
  db: D1Database, companyId: string, yearEnd: string, input: HomeOfficeInput,
): Promise<void> {
  await db.prepare(
    `INSERT INTO home_office (company_id, year_end, home_area, work_area, hours_per_week,
        rent_cents, mortgage_interest_cents, property_tax_cents, insurance_cents,
        utilities_cents, maintenance_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(company_id, year_end) DO UPDATE SET
       home_area = excluded.home_area, work_area = excluded.work_area,
       hours_per_week = excluded.hours_per_week, rent_cents = excluded.rent_cents,
       mortgage_interest_cents = excluded.mortgage_interest_cents,
       property_tax_cents = excluded.property_tax_cents,
       insurance_cents = excluded.insurance_cents,
       utilities_cents = excluded.utilities_cents,
       maintenance_cents = excluded.maintenance_cents,
       updated_at = datetime('now')`,
  ).bind(
    companyId, yearEnd, input.homeArea, input.workArea, input.hoursPerWeek ?? null,
    input.rent, input.mortgageInterest, input.propertyTax, input.homeInsurance,
    input.utilities, input.maintenance,
  ).run();
}

// ------------------------------------------------------------ what was filed

export interface FiledRecord {
  filingId: string;
  filedOn: string;
  confirmation: string;
  /** The lines as they were when filed, or empty. */
  figures: { line: string; name: string; value: number }[];
}

/**
 * Record a filing as submitted, and mark it done in the same batch.
 *
 * The two writes go together because a filed return that is not ticked off
 * keeps the reminders coming, and a ticked one with no record loses the
 * confirmation number, which is the one thing that proves it was sent.
 */
export async function recordFiled(
  db: D1Database, companyId: string, record: FiledRecord,
): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO filed_records (company_id, filing_id, filed_on, confirmation, figures)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(company_id, filing_id) DO UPDATE SET
         filed_on = excluded.filed_on, confirmation = excluded.confirmation,
         figures = excluded.figures, recorded_at = datetime('now')`,
    ).bind(companyId, record.filingId, record.filedOn, record.confirmation,
      record.figures.length ? JSON.stringify(record.figures) : ''),
    db.prepare(
      `INSERT INTO filing_states (company_id, filing_id, state) VALUES (?, ?, 'done')
       ON CONFLICT(company_id, filing_id) DO UPDATE SET state = 'done',
         changed_at = datetime('now')`,
    ).bind(companyId, record.filingId),
  ]);
}

export async function filedRecords(
  db: D1Database, companyId: string,
): Promise<Map<string, FiledRecord>> {
  const rows = await db.prepare(
    'SELECT filing_id, filed_on, confirmation, figures FROM filed_records WHERE company_id = ?',
  ).bind(companyId).all<{ filing_id: string; filed_on: string; confirmation: string; figures: string }>();
  return new Map((rows.results ?? []).map((r) => [r.filing_id, {
    filingId: r.filing_id,
    filedOn: r.filed_on,
    confirmation: r.confirmation,
    figures: r.figures ? JSON.parse(r.figures) : [],
  }]));
}

/**
 * The day a business was added to FileClear, which is where the calendar's
 * look back for missed filings starts. Anything due before it was handled
 * somewhere else.
 */
export async function companyAddedOn(db: D1Database, companyId: string): Promise<string> {
  const row = await db.prepare('SELECT created_at FROM companies WHERE id = ?')
    .bind(companyId).first<{ created_at: string }>();
  return (row?.created_at ?? '').slice(0, 10);
}
