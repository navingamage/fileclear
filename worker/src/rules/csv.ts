/**
 * Reading a bank export.
 *
 * Every transaction in FileClear has been typed by hand until now, and a ledger
 * you have to type is a ledger that falls three months behind and then stops.
 * Everything this product computes sits downstream of the ledger, so the data
 * entry is the part that decides whether any of it gets used.
 *
 * There is no standard for a Canadian bank CSV. The five big banks disagree on
 * the column names, on whether an amount is one signed column or two, on the
 * date format, and on whether there is a header row at all. So nothing here is
 * configured by the person importing: the shape is worked out from the file,
 * and anything that cannot be worked out with certainty is refused rather than
 * guessed.
 *
 * That last point is the whole design. A wrong guess does not announce itself:
 * it lands as a plausible row in a ledger that feeds an HST return and a T2.
 * Refusing an ambiguous file costs somebody a minute. Getting it wrong costs a
 * reassessment.
 */

export interface RawRow {
  /** 1 based, as the person sees it in a spreadsheet. */
  line: number;
  cells: string[];
}

/**
 * Splits CSV text into rows, honouring quotes.
 *
 * Written out rather than pulled in, because a dependency here would be a
 * dependency in a Worker for something a bank export needs three rules for:
 * quoted fields, doubled quotes inside them, and newlines inside quotes.
 * Descriptions contain commas constantly, which is the case a naive split gets
 * wrong on the first real file.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  // A byte order mark at the start of a file from Excel would otherwise become
  // part of the first header name and stop it matching anything.
  const input = text.replace(/^﻿/, '');

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;

    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// ------------------------------------------------------------------ columns

export interface Columns {
  date: number;
  description: number;
  /** One signed column, when the bank uses one. */
  amount?: number;
  /** Two columns, when it does not. Money out and money in. */
  debit?: number;
  credit?: number;
  /** Whether the first row was names rather than data. */
  hasHeader: boolean;
}

const DATE_NAMES = ['date', 'transaction date', 'posting date', 'date posted'];
const DESC_NAMES = ['description', 'details', 'transaction', 'narrative',
  'description 1', 'memo', 'payee'];
const AMOUNT_NAMES = ['amount', 'transaction amount', 'cad$', 'amount (cad)'];
const DEBIT_NAMES = ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out'];
const CREDIT_NAMES = ['credit', 'deposit', 'deposits', 'money in', 'paid in'];

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

function findColumn(header: string[], names: string[]): number {
  const exact = header.findIndex((h) => names.includes(norm(h)));
  if (exact >= 0) return exact;
  return header.findIndex((h) => names.some((n) => norm(h).includes(n)));
}

/** Looks like a date in any of the formats a Canadian bank might emit. */
export function looksLikeDate(v: string): boolean {
  const s = v.trim();
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)
    || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)
    || /^\d{1,2} [A-Za-z]{3,9} \d{4}$/.test(s);
}

const looksLikeMoney = (v: string): boolean =>
  /^-?\(?\$?\s*-?[\d,]+(\.\d{1,2})?\)?$/.test(v.trim()) && /\d/.test(v);

/**
 * Works out which column is which.
 *
 * Header names first, since most banks provide them. Failing that, the shape of
 * the data: the column where every value parses as a date is the date, the one
 * where every value parses as money is the amount, and the widest remaining
 * text column is the description. Some exports have no header at all.
 */
export function detectColumns(rows: string[][]): Columns | { error: string } {
  if (!rows.length) return { error: 'The file is empty.' };

  const first = rows[0]!;
  const headerLooksLikeData = first.some(looksLikeDate) && first.some(looksLikeMoney);
  const hasHeader = !headerLooksLikeData;

  if (hasHeader) {
    const date = findColumn(first, DATE_NAMES);
    const description = findColumn(first, DESC_NAMES);
    const amount = findColumn(first, AMOUNT_NAMES);
    const debit = findColumn(first, DEBIT_NAMES);
    const credit = findColumn(first, CREDIT_NAMES);

    if (date >= 0 && description >= 0 && (amount >= 0 || (debit >= 0 && credit >= 0))) {
      const cols: Columns = { date, description, hasHeader: true };
      if (debit >= 0 && credit >= 0) { cols.debit = debit; cols.credit = credit; }
      else cols.amount = amount;
      return cols;
    }
  }

  // No usable header, so read the shape instead.
  const body = hasHeader ? rows.slice(1) : rows;
  if (!body.length) return { error: 'The file has a header and no rows under it.' };

  const width = Math.max(...body.map((r) => r.length));
  const sample = body.slice(0, 20);
  const allAre = (i: number, test: (v: string) => boolean) =>
    sample.every((r) => (r[i] ?? '').trim() === '' || test(r[i] ?? ''));

  let date = -1;
  let amount = -1;
  for (let i = 0; i < width; i++) {
    if (date < 0 && allAre(i, looksLikeDate) && sample.some((r) => looksLikeDate(r[i] ?? ''))) {
      date = i; continue;
    }
    if (amount < 0 && allAre(i, looksLikeMoney) && sample.some((r) => looksLikeMoney(r[i] ?? ''))) {
      amount = i;
    }
  }

  if (date < 0) return { error: 'No column in this file reads as a date.' };
  if (amount < 0) return { error: 'No column in this file reads as an amount.' };

  let description = -1;
  let longest = 0;
  for (let i = 0; i < width; i++) {
    if (i === date || i === amount) continue;
    const len = sample.reduce((t, r) => t + (r[i] ?? '').trim().length, 0);
    if (len > longest) { longest = len; description = i; }
  }
  if (description < 0) return { error: 'No column in this file reads as a description.' };

  return { date, description, amount, hasHeader };
}

// -------------------------------------------------------------------- dates

export type DateOrder = 'ymd' | 'dmy' | 'mdy';

/**
 * Which way round an ambiguous date is.
 *
 * 03/04/2026 is the third of April in most of the world and the fourth of March
 * in the United States, and Canadian banks emit both. One row cannot settle it.
 * The whole file usually can: if any first component exceeds twelve it must be
 * a day, and if any second component does, it must be a day too.
 *
 * When the file genuinely cannot settle it, this says so rather than picking.
 * A silently transposed date moves a transaction into the wrong HST period,
 * which is the kind of error that surfaces as a reassessment.
 */
export function detectDateOrder(values: string[]): DateOrder | 'ambiguous' {
  let firstOverTwelve = false;
  let secondOverTwelve = false;
  let sawSlashOrDash = false;

  for (const v of values) {
    const s = v.trim();
    if (/^\d{4}[-/]/.test(s)) return 'ymd';
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (!m) continue;
    sawSlashOrDash = true;
    if (Number(m[1]) > 12) firstOverTwelve = true;
    if (Number(m[2]) > 12) secondOverTwelve = true;
  }

  if (!sawSlashOrDash) return 'ymd';
  if (firstOverTwelve && secondOverTwelve) return 'ambiguous';
  if (firstOverTwelve) return 'dmy';
  if (secondOverTwelve) return 'mdy';
  return 'ambiguous';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** To yyyy-mm-dd, or null when the value is not a date at all. */
export function toIsoDate(value: string, order: DateOrder): string | null {
  const s = value.trim();

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return pad(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = s.match(/^(\d{1,2}) ([A-Za-z]{3,9}) (\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[2]!.slice(0, 3).toLowerCase()) + 1;
    if (!month) return null;
    return pad(Number(named[3]), month, Number(named[1]));
  }

  const parts = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!parts) return null;
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  let year = Number(parts[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;

  const day = order === 'mdy' ? b : a;
  const month = order === 'mdy' ? a : b;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return pad(year, month, day);
}

const pad = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Cents, from anything a bank writes. Brackets mean negative in some exports. */
export function toCents(value: string): number | null {
  const s = value.trim();
  if (!s) return 0;
  const bracketed = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[()$\s,]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Math.round(Number(cleaned) * 100);
  return bracketed ? -Math.abs(n) : n;
}

// ------------------------------------------------------------ to the ledger

import { ACCOUNT_BY_ID, ACCOUNTS, HST_RATE } from './gifi';

export interface ImportRow {
  line: number;
  date: string;
  description: string;
  /** Signed cents as the bank reported it. Negative is money leaving. */
  signed: number;
  /** The account this will post to, guessed or chosen. */
  accountId: string;
  /** Why that account was chosen, so a guess can be recognised as one. */
  reason: 'remembered' | 'keyword' | 'direction' | 'suggested';
  /** Cents of HST backed out of the gross, when the account normally carries it. */
  hst: number;
  /** Amount before HST, which is what the ledger stores. */
  amount: number;
  /** Matches a row already in the ledger. */
  duplicate: boolean;
}

export interface ImportProblem { line: number; cells: string[]; why: string; }

export interface ImportPreview {
  rows: ImportRow[];
  problems: ImportProblem[];
  columns: Columns;
  dateOrder: DateOrder;
  /** Totals, so the person can check against their statement before committing. */
  moneyIn: number;
  moneyOut: number;
}

/**
 * Words that identify an account on sight.
 *
 * Small on purpose. This exists to make the first import mostly right, not to
 * be a classifier: anything it gets wrong is corrected once on the preview and
 * then remembered, so the list never needs to grow to cover a long tail.
 */
const KEYWORDS: { match: RegExp; accountId: string }[] = [
  { match: /\b(hydro|enbridge|utilit)/i, accountId: 'office' },
  { match: /\b(rogers|bell|telus|fido|koodo|internet|mobile)/i, accountId: 'telephone' },
  { match: /\b(aws|amazon web|google cloud|cloudflare|github|figma|adobe|notion|slack|zoom|openai|anthropic|subscription)/i, accountId: 'software' },
  { match: /\b(uber|lyft|presto|via rail|air canada|westjet|hotel|airbnb)/i, accountId: 'travel' },
  { match: /\b(restaurant|cafe|coffee|tim hortons|starbucks|doordash|skip ?the ?dishes|uber ?eats)/i, accountId: 'meals' },
  { match: /\b(petro|esso|shell|husky|parking|green ?p)/i, accountId: 'vehicle' },
  { match: /\b(staples|office ?depot|amazon\.ca|indigo)/i, accountId: 'office' },
  { match: /\b(insurance|assurance)/i, accountId: 'insurance' },
  { match: /\b(law|legal|account(ant|ing)|bookkeep|notary)/i, accountId: 'professional' },
  { match: /\b(service charge|monthly fee|overdraft|interest charge|nsf)/i, accountId: 'bank-charges' },
  { match: /\b(payroll|salary|wages)/i, accountId: 'salaries' },
  { match: /\b(rent|lease)/i, accountId: 'rent' },
  { match: /\b(cra|revenue canada|gst|hst remit)/i, accountId: 'gst-payable' },
];

/** What a row posts to when nothing else identifies it. */
const FALLBACK_IN = 'sales';
const FALLBACK_OUT = 'office';

export interface Remembered { pattern: string; accountId: string; }

/**
 * The account for a description.
 *
 * A remembered mapping wins over a keyword, because the person correcting a
 * guess last month is better evidence than a word list. The match is on a
 * normalised prefix rather than the whole string: a card description carries a
 * different reference number every time, and matching the whole thing would
 * remember nothing.
 */
export function accountFor(
  description: string, signed: number, remembered: Remembered[],
): { accountId: string; reason: ImportRow['reason'] } {
  const key = descriptionKey(description);

  for (const r of remembered) {
    if (key.startsWith(r.pattern) || r.pattern.startsWith(key)) {
      if (ACCOUNT_BY_ID.has(r.accountId)) {
        return { accountId: r.accountId, reason: 'remembered' };
      }
    }
  }

  for (const k of KEYWORDS) {
    if (k.match.test(description)) return { accountId: k.accountId, reason: 'keyword' };
  }

  return {
    accountId: signed >= 0 ? FALLBACK_IN : FALLBACK_OUT,
    reason: 'direction',
  };
}

/**
 * The stable part of a bank description.
 *
 * Digits go, because a card transaction carries a reference that differs every
 * time, and the first few words are what actually name the merchant.
 */
export function descriptionKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

/** Identifies a row, so importing the same statement twice does not double it. */
export function rowFingerprint(date: string, cents: number, description: string): string {
  return `${date}|${cents}|${descriptionKey(description)}`;
}

export interface BuildOptions {
  remembered: Remembered[];
  /** Fingerprints already in the ledger. */
  existing: Set<string>;
  dateOrder?: DateOrder;
}

/**
 * Turns parsed rows into something that can be shown before it is committed.
 *
 * Nothing is written here. A bank export is somebody else's data in somebody
 * else's format, and the step between reading it and trusting it is a person
 * looking at it.
 */
export function buildPreview(
  rows: string[][], options: BuildOptions,
): ImportPreview | { error: string } {
  const columns = detectColumns(rows);
  if ('error' in columns) return columns;

  const body = columns.hasHeader ? rows.slice(1) : rows;
  const dates = body.map((r) => r[columns.date] ?? '');

  const detected = options.dateOrder ?? detectDateOrder(dates);
  if (detected === 'ambiguous') {
    return {
      error: 'The dates in this file could be read either way round, and nothing in '
        + 'it settles which. Say whether they are day first or month first and the '
        + 'import will use that.',
    };
  }

  const out: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();

  body.forEach((cells, i) => {
    const line = i + (columns.hasHeader ? 2 : 1);
    const date = toIsoDate(cells[columns.date] ?? '', detected);
    if (!date) {
      problems.push({ line, cells, why: 'The date could not be read.' });
      return;
    }

    let signed: number | null;
    if (columns.amount !== undefined) {
      signed = toCents(cells[columns.amount] ?? '');
    } else {
      const debit = toCents(cells[columns.debit!] ?? '') ?? 0;
      const credit = toCents(cells[columns.credit!] ?? '') ?? 0;
      // Two column exports write both as positive; the column is the sign.
      signed = credit !== 0 ? Math.abs(credit) : -Math.abs(debit);
    }

    if (signed === null) {
      problems.push({ line, cells, why: 'The amount could not be read.' });
      return;
    }
    if (signed === 0) {
      problems.push({ line, cells, why: 'The amount is zero.' });
      return;
    }

    const description = (cells[columns.description] ?? '').trim().slice(0, 200);
    const { accountId, reason } = accountFor(description, signed, options.remembered);
    const account = ACCOUNT_BY_ID.get(accountId);

    // A bank row is the gross. The ledger holds the amount before tax and the
    // tax beside it, so standard rated accounts have the HST backed out of the
    // total rather than added to it.
    const gross = Math.abs(signed);
    const carriesHst = account?.hst === 'standard';
    const amount = carriesHst ? Math.round(gross / (1 + HST_RATE)) : gross;
    const hst = carriesHst ? gross - amount : 0;

    const fingerprint = rowFingerprint(date, signed, description);
    const duplicate = options.existing.has(fingerprint) || seen.has(fingerprint);
    seen.add(fingerprint);

    out.push({ line, date, description, signed, accountId, reason, hst, amount, duplicate });
  });

  return {
    rows: out,
    problems,
    columns,
    dateOrder: detected,
    moneyIn: out.filter((r) => r.signed > 0).reduce((t, r) => t + r.signed, 0),
    moneyOut: out.filter((r) => r.signed < 0).reduce((t, r) => t - r.signed, 0),
  };
}

/**
 * Applies model suggestions to the rows nothing else could identify.
 *
 * Only rows that fell all the way through to the direction fallback are
 * touched, so a remembered correction and a keyword match both outrank the
 * model, and a suggestion is marked as one so the preview can show it for what
 * it is.
 */
export function applySuggestions(
  rows: ImportRow[], suggestions: { index: number; accountId: string }[],
): ImportRow[] {
  const byIndex = new Map(suggestions.map((s) => [s.index, s.accountId]));
  return rows.map((row, i) => {
    const suggested = byIndex.get(i);
    if (!suggested || row.reason !== 'direction') return row;
    const account = ACCOUNT_BY_ID.get(suggested);
    if (!account) return row;

    // The HST split follows the account, so it is recomputed rather than kept.
    const gross = Math.abs(row.signed);
    const carries = account.hst === 'standard';
    const amount = carries ? Math.round(gross / (1 + HST_RATE)) : gross;
    return { ...row, accountId: suggested, reason: 'suggested' as const,
      amount, hst: carries ? gross - amount : 0 };
  });
}

/** The rows worth asking a model about: the ones nothing else identified. */
export function unidentified(rows: ImportRow[]): {
  index: number; description: string; outflow: boolean;
}[] {
  return rows
    .map((r, index) => ({ index, description: r.description, outflow: r.signed < 0, r }))
    .filter((x) => x.r.reason === 'direction' && x.description.trim() !== '')
    .map(({ index, description, outflow }) => ({ index, description, outflow }));
}

/** The accounts offered on the preview, grouped so the list is navigable. */
export const IMPORTABLE_ACCOUNTS = ACCOUNTS.filter(
  (a) => a.kind === 'revenue' || a.kind === 'expense' || a.id === 'equipment'
    || a.id === 'due-shareholder' || a.id === 'dividends-paid',
);
