import { ACCOUNT_BY_ID, CLAIMABLE_FRACTION, HST_RATE } from './gifi';

/**
 * The HST return, computed over the ledger, both ways.
 *
 * Two methods exist and most small corporations are on the wrong one without
 * knowing the other is there. The regular method collects 13% and claims back
 * the HST paid on purchases. The Quick Method remits a flat percentage of
 * HST-included sales and claims nothing back except on capital purchases.
 *
 * Which one wins depends entirely on how much HST a business actually pays out,
 * which is a fact about its ledger rather than about its industry. So both are
 * computed on every return and the difference is shown. That comparison is the
 * single most valuable number in this product for a service business, and it
 * cannot be answered by a rule of thumb.
 *
 * Every figure is in cents. Money in floating point is how rounding differences
 * turn into a reassessment.
 */

export interface LedgerLine {
  /** yyyy-mm-dd */
  date: string;
  accountId: string;
  /** Cents, before HST. Positive for both revenue and expenses; the account says which. */
  amount: number;
  /** Cents of HST actually on the document. Kept rather than recomputed,
   *  because a supplier's rounding is the supplier's, and an invoice with no
   *  HST on it must not have any imputed. */
  hst: number;
  /**
   * Where the money came from or went to. Defaults to the bank when absent,
   * which is what an older row without one meant.
   *
   * This is the whole of what makes the books double entry. See postings.ts:
   * without it a balance sheet cannot be derived, because "sales 1,000" does
   * not say where the money landed.
   */
  counterAccountId?: string;
  description?: string;
}

export interface HstReturn {
  from: string;
  to: string;

  /** Line 101. Total revenue, HST excluded. */
  totalRevenue: number;
  /**
   * Revenue that is not a taxable supply made in Canada: exempt income such as
   * interest, and zero-rated sales, which FileClear treats as exports because
   * for a service business that is what they almost always are. Line 91 on an
   * electronic return; everything else is line 90.
   */
  exemptRevenue: number;
  zeroRatedRevenue: number;
  /**
   * Line 103. HST collected or collectible.
   *
   * This was labelled line 105, which is the total after adjustments. With no
   * adjustments the two are the same number, which is why it looked right, but
   * a person filing electronically types into 103 and CRA works out 105.
   */
  collected: number;
  /**
   * Line 106. Input tax credits.
   *
   * Labelled line 108 until September 2026. 108 is 106 plus adjustments, and
   * on an electronic return CRA calculates it; 106 is where the figure goes.
   */
  itcs: number;
  /** Line 109. Net tax under the regular method. */
  netTaxRegular: number;

  quick: {
    /** Whether the corporation is eligible on these numbers. */
    eligible: boolean;
    /** The Ontario rate for a business supplying services. */
    rate: number;
    /** HST-included sales the rate applies to. */
    includedSales: number;
    /** The 1% credit on the first $30,000 of eligible supplies. */
    credit: number;
    /** ITCs still claimable on capital purchases under the Quick Method. */
    capitalItcs: number;
    netTax: number;
  };

  /** Positive when the Quick Method would have cost less. */
  quickSaves: number;
  /** What the ledger cannot answer, so the user is not misled. */
  caveats: string[];
}

/**
 * Ontario, business supplying services, permanent establishment in Ontario, and
 * not buying goods for resale beyond the threshold. FileClear is Ontario only
 * and service focused, so this is the rate that applies; a goods reseller has a
 * different one and gets a caveat rather than a wrong number.
 */
export const QUICK_RATE_ON_SERVICES = 0.088;
/** Taxable supplies ceiling for electing the Quick Method, HST included. */
export const QUICK_ELIGIBILITY_CEILING = 400_000_00;
/** The 1% credit applies to the first $30,000 of eligible supplies. */
export const QUICK_CREDIT_BASE = 30_000_00;
export const QUICK_CREDIT_RATE = 0.01;

const round = (cents: number): number => Math.round(cents);

export function computeHst(lines: LedgerLine[], from: string, to: string): HstReturn {
  const inPeriod = lines.filter((l) => l.date >= from && l.date <= to);

  let totalRevenue = 0;
  let collected = 0;
  let itcs = 0;
  let capitalItcs = 0;
  let exemptSales = 0;
  let zeroRatedSales = 0;
  let sawGoodsForResale = false;

  for (const line of inPeriod) {
    const account = ACCOUNT_BY_ID.get(line.accountId);
    if (!account) continue;

    if (account.kind === 'revenue') {
      // Line 101 is all revenue, including zero rated and exempt supplies.
      totalRevenue += line.amount;
      collected += line.hst;
      if (account.hst === 'exempt') exemptSales += line.amount;
      if (account.hst === 'zero-rated') zeroRatedSales += line.amount;
      continue;
    }

    if (account.kind === 'expense' || account.kind === 'asset') {
      // Only what was actually charged is claimable, and only the deductible
      // fraction of it where one applies.
      const fraction = CLAIMABLE_FRACTION[account.id] ?? 1;
      const claimable = round(line.hst * fraction);
      itcs += claimable;
      // Capital purchases keep their ITCs under the Quick Method.
      if (account.kind === 'asset' && account.id !== 'bank'
          && account.id !== 'receivable' && account.id !== 'gst-receivable') {
        capitalItcs += claimable;
      }
      if (account.id === 'subcontract') sawGoodsForResale = false;
    }
  }

  const netTaxRegular = round(collected - itcs);

  // Quick Method works on HST-included sales of taxable supplies. Exempt
  // supplies are outside it entirely.
  const taxableRevenue = totalRevenue - exemptSales;
  const includedSales = round(taxableRevenue + collected);
  const eligible = includedSales <= QUICK_ELIGIBILITY_CEILING;
  const gross = round(includedSales * QUICK_RATE_ON_SERVICES);
  const credit = round(Math.min(includedSales, QUICK_CREDIT_BASE) * QUICK_CREDIT_RATE);
  const quickNet = round(gross - credit - capitalItcs);

  const caveats: string[] = [];
  if (!eligible) {
    caveats.push(
      'Taxable supplies are over $400,000 for this period, which is the ceiling '
      + 'for electing the Quick Method.');
  }
  if (exemptSales > 0) {
    caveats.push(
      'Exempt revenue is excluded from the Quick Method calculation, since the '
      + 'flat rate applies only to taxable supplies.');
  }
  if (sawGoodsForResale) {
    caveats.push(
      'The 8.8% rate is for a business supplying services. A business that buys '
      + 'goods for resale above the threshold uses a different rate.');
  }
  caveats.push(
    'Electing the Quick Method is a form filed with CRA and it binds you for at '
    + 'least a year, so this comparison is a reason to look rather than a switch.');

  return {
    from, to,
    totalRevenue, exemptRevenue: exemptSales, zeroRatedRevenue: zeroRatedSales,
    collected, itcs, netTaxRegular,
    quick: {
      eligible,
      rate: QUICK_RATE_ON_SERVICES,
      includedSales,
      credit,
      capitalItcs,
      netTax: quickNet,
    },
    quickSaves: round(netTaxRegular - quickNet),
    caveats,
  };
}

// ------------------------------------------------------------------ reporting

export interface GifiLine { gifi: number; name: string; amount: number; }

/**
 * The ledger rolled up by GIFI code, which is what schedules 100 and 125 of the
 * T2 ask for. Phase 3 turns this into the year end financials; it lives here
 * now because the mapping is what makes the chart of accounts worth having.
 */
export function gifiSummary(lines: LedgerLine[], from: string, to: string): GifiLine[] {
  const totals = new Map<number, { name: string; amount: number }>();
  for (const line of lines) {
    if (line.date < from || line.date > to) continue;
    const account = ACCOUNT_BY_ID.get(line.accountId);
    if (!account) continue;
    const entry = totals.get(account.gifi) ?? { name: account.name, amount: 0 };
    entry.amount += line.amount;
    totals.set(account.gifi, entry);
  }
  return [...totals.entries()]
    .map(([gifi, v]) => ({ gifi, name: v.name, amount: v.amount }))
    .sort((a, b) => a.gifi - b.gifi);
}

/** Cents to a displayable dollar string, without a currency symbol. */
export function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100).toLocaleString('en-CA')}.${String(abs % 100).padStart(2, '0')}`;
}

/** The HST on an amount, for the entry form's convenience. */
export function hstOn(cents: number): number {
  return Math.round(cents * HST_RATE);
}
