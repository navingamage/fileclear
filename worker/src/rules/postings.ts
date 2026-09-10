import { ACCOUNT_BY_ID, type AccountKind } from './gifi';
import type { LedgerLine } from './hst';

/**
 * One ledger row, expanded into the entries that make it balance.
 *
 * FileClear's books are single entry on the surface, because asking somebody
 * who runs a two person corporation to think in debits and credits is how a
 * bookkeeping product goes unused. A row is a date, an account, an amount, and
 * the HST that was on the document.
 *
 * Underneath it has to be double entry, because a balance sheet cannot be
 * derived from one sided records. "Sales 1,000" says nothing about where the
 * money went, so Schedule 100 would have nothing to report.
 *
 * The bridge is the counter account: every row says where the money came from
 * or went to, defaulting to the bank. That one extra field is enough, because
 * the HST leg is already recorded and the sign of each leg follows from what
 * kind of account it is. So the user answers one more question and gets a
 * balanced ledger, without ever meeting the word "credit".
 *
 *   Sales 1,000 + HST 130, into Bank
 *     Bank            +1,130
 *     Sales           +1,000  (revenue)
 *     HST payable     +  130  (liability)
 *
 *   Rent 2,000 + HST 260, from Bank
 *     Rent            +2,000  (expense)
 *     HST recoverable +  260  (asset)
 *     Bank            -2,260
 *
 * Every posting is in cents and the signs are natural balances: an asset is
 * positive when you have more of it, a liability positive when you owe more, a
 * revenue positive when you earned more. Nothing here uses debit or credit as a
 * word, because the sign already carries it and two vocabularies for one idea
 * is how people lose track.
 */

export interface Posting {
  date: string;
  accountId: string;
  kind: AccountKind;
  /** Cents, signed. Positive is an increase in that account's natural balance. */
  amount: number;
}

/** Where the HST on a row lands, which depends on the direction of the row. */
const HST_COLLECTED = 'gst-payable';     // liability: we owe CRA
const HST_PAID = 'gst-receivable';       // asset: CRA owes us

/** The default other side of a row. Almost every line is money in or out of it. */
export const DEFAULT_COUNTER = 'bank';

/**
 * Whether the tax on a row was collected or paid.
 *
 * Charged on what you sell, paid on what you buy, and buying covers expenses
 * and capital equally. So the question is only whether the named account is
 * revenue.
 */
function isSale(kind: AccountKind): boolean {
  return kind === 'revenue';
}

/**
 * The side of the accounting equation an account sits on.
 *
 * Assets and expenses are debits, everything else credits. A balanced entry
 * sums to zero under these signs, which is the property the counter posting is
 * derived from rather than guessed at.
 */
function equationSign(kind: AccountKind): number {
  return kind === 'asset' || kind === 'expense' ? 1 : -1;
}

/**
 * Expand one row into balanced postings.
 *
 * An unknown account produces nothing rather than throwing. A row referring to
 * an account that has since been removed from the chart must not take a whole
 * year end down with it, and a missing row is visible in a total that does not
 * agree while an exception is not visible at all.
 */
export function postingsFor(line: LedgerLine): Posting[] {
  const account = ACCOUNT_BY_ID.get(line.accountId);
  if (!account) return [];

  const counterId = line.counterAccountId || DEFAULT_COUNTER;
  const counter = ACCOUNT_BY_ID.get(counterId);
  if (!counter) return [];

  const out: Posting[] = [];
  const at = (accountId: string, kind: AccountKind, amount: number) => {
    if (amount !== 0) out.push({ date: line.date, accountId, kind, amount });
  };

  // The named side of the row, always at its natural sign.
  at(line.accountId, account.kind, line.amount);

  // The tax side. Collected on a sale, recoverable on a purchase. Only half the
  // HST on a meal is claimable, but the ledger records what was on the
  // document; the restriction belongs to the return, not to the books.
  const taxKind: AccountKind = isSale(account.kind) ? 'liability' : 'asset';
  const taxAccount = isSale(account.kind) ? HST_COLLECTED : HST_PAID;
  if (line.hst) at(taxAccount, taxKind, line.hst);

  // The other side, derived rather than guessed.
  //
  // Whatever the two accounts are, the entry has to sum to zero across the
  // accounting equation, and that leaves exactly one possible amount for the
  // counter. Deriving it means the direction is right for every combination,
  // including the ones a rule of thumb gets backwards: issuing shares is money
  // coming in even though equity is not revenue, and buying a laptop on the
  // director's own card increases what the company owes rather than reducing
  // the bank.
  const named = equationSign(account.kind) * line.amount
    + (line.hst ? equationSign(taxKind) * line.hst : 0);
  at(counterId, counter.kind, -named * equationSign(counter.kind));

  return out;
}

/** Zero when a set of postings balances. Anything else is a bug, not a warning. */
export function outOfBalance(postings: Posting[]): number {
  return postings.reduce((sum, p) => sum + p.amount * equationSign(p.kind), 0);
}

export interface Balance {
  accountId: string;
  name: string;
  kind: AccountKind;
  gifi: number;
  amount: number;
}

/**
 * Account balances over a window.
 *
 * `from` is optional because the two statements want different windows from the
 * same ledger. An income statement covers one fiscal year. A balance sheet is
 * cumulative: it reports what the corporation owns and owes on one date, which
 * is every posting from incorporation up to that date.
 */
export function balances(lines: LedgerLine[], to: string, from?: string): Balance[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (line.date > to) continue;
    if (from !== undefined && line.date < from) continue;
    for (const p of postingsFor(line)) {
      totals.set(p.accountId, (totals.get(p.accountId) ?? 0) + p.amount);
    }
  }

  const out: Balance[] = [];
  for (const [accountId, amount] of totals) {
    const a = ACCOUNT_BY_ID.get(accountId);
    if (!a) continue;
    out.push({ accountId, name: a.name, kind: a.kind, gifi: a.gifi, amount });
  }
  const order: AccountKind[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  return out.sort((a, b) =>
    order.indexOf(a.kind) - order.indexOf(b.kind) || a.gifi - b.gifi);
}

export const totalOf = (rows: Balance[], kind: AccountKind): number =>
  rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.amount, 0);
