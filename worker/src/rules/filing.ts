/**
 * Getting a return from FileClear to the authority that receives it.
 *
 * What FileClear may and may not do here is set by the authorities rather than
 * by this code, and it is worth being exact about, because "does it file for
 * me" has a different answer for each of them.
 *
 * GST/HST, the T2 and the T1 can only be transmitted on somebody's behalf by
 * software CRA has certified. GST/HST Internet File Transfer is listed by CRA
 * as requiring certified software, and certification is a process a developer
 * applies for with CRA's GST/HST Electronic Filing Services Section. It is not
 * something code can turn on.
 *
 * Provincial and federal annual returns have no public filing interface.
 * Ontario lets approved intermediaries file through a Partner Portal, which is
 * a web portal for accountants, lawyers and licensed service providers, and
 * Corporations Canada files through its Online Filing Centre.
 *
 * So FileClear prepares each return and walks the person through submitting
 * it: the figures in the order the form asks for them, what they need in hand
 * before they start, where to go, how to pay, and then the confirmation number
 * recorded back here, which marks the filing done and keeps a copy of what was
 * filed. That last part matters more than it looks: a filing computed from the
 * ledger changes if the ledger does, and "what did I actually file" is the
 * question CRA asks in a review.
 *
 * Money is in cents throughout.
 */

import type { HstReturn } from './hst';
import type { HstMethod } from './profile';

// ------------------------------------------------------------------ GST/HST

export interface ReturnLine {
  line: string;
  name: string;
  /** Cents. */
  value: number;
  /**
   * Whether the person types this figure in. False for the lines CRA works out
   * itself on an electronic return, which are shown so the person can check
   * the form reads what FileClear expects rather than typed.
   */
  enter: boolean;
  /** Why this figure is what it is, where that is not obvious. */
  note?: string;
}

/**
 * The GST/HST return in the order GST/HST NETFILE and My Business Account ask
 * for it, with FileClear's figures in it.
 *
 * Line names are CRA's own, from "Instructions for preparing a GST/HST
 * return". Lines 90 and 91 exist only on an electronic return, which since
 * 2024 is every return a registrant files: paper is no longer compliant.
 *
 * `instalmentsPaid` is asked for rather than inferred. The ledger records a
 * payment to CRA as money leaving the bank, but not which liability it
 * settled, and guessing would put a number on line 110 that CRA can check
 * against its own records in a second.
 */
export function hstNetfileLines(
  r: HstReturn, method: HstMethod, instalmentsPaid = 0,
): ReturnLine[] {
  const quick = method === 'quick';

  // Line 90 is taxable supplies made in Canada; line 91 is exempt supplies,
  // zero-rated exports and other revenue. Zero-rated sales are treated as
  // exports, which for a service business is nearly always what they are.
  const line91 = r.exemptRevenue + r.zeroRatedRevenue;
  const line90 = r.totalRevenue - line91;

  // Under the Quick Method line 101 includes the HST, and line 103 is the
  // remittance rate applied to it. The rate applies to taxable supplies only,
  // so exempt income such as interest is added to 101 without being taxed.
  const line101 = quick ? r.quick.includedSales + r.exemptRevenue : r.totalRevenue;
  const line103 = quick ? Math.round(r.quick.includedSales * r.quick.rate) : r.collected;
  const line106 = quick ? r.quick.capitalItcs : r.itcs;
  const line107 = quick ? r.quick.credit : 0;

  const line105 = line103;
  const line108 = line106 + line107;
  const line109 = line105 - line108;
  const line113a = line109 - instalmentsPaid;

  const lines: ReturnLine[] = [
    { line: '90', name: 'Total taxable sales including zero-rated supplies (other than zero-rated exports) made in Canada',
      value: quick ? r.quick.includedSales : line90, enter: true,
      note: quick ? 'HST included, because you are on the Quick Method.' : undefined },
    { line: '91', name: 'Total exempt supplies, zero-rated exports, and other sales and revenue',
      value: line91, enter: true,
      note: r.zeroRatedRevenue
        ? 'FileClear treats zero-rated sales as exports. If any were zero-rated supplies made in Canada instead, they belong on line 90.'
        : undefined },
    { line: '101', name: 'Total sales and other revenues', value: line101, enter: true,
      note: quick ? 'Including the HST, which is what the Quick Method asks for on this line.' : undefined },
    { line: '103', name: 'GST/HST collected or collectible', value: line103, enter: true,
      note: quick
        ? `${(r.quick.rate * 100).toFixed(1)}% of your HST-included taxable sales, which is the Quick Method remittance rate for a business supplying services in Ontario.`
        : undefined },
    { line: '104', name: 'Adjustments to be added to the net tax', value: 0, enter: true,
      note: 'Bad debt recoveries and similar. FileClear records none, so this is zero unless you know otherwise.' },
    { line: '105', name: 'Total GST/HST and adjustments for the period', value: line105, enter: false },
    { line: '106', name: 'GST/HST paid or payable (ITCs)', value: line106, enter: true,
      note: quick ? 'Capital purchases only. The Quick Method gives up input tax credits on operating expenses.' : undefined },
    { line: '107', name: 'Adjustments to be deducted when determining the net tax', value: line107, enter: true,
      note: quick ? 'The 1% credit on the first $30,000 of eligible supplies.' : undefined },
    { line: '108', name: 'Total ITCs and adjustments', value: line108, enter: false },
    { line: '109', name: 'Net tax', value: line109, enter: false },
    { line: '110', name: 'Instalment and other annual filer payments', value: instalmentsPaid, enter: true,
      note: instalmentsPaid ? undefined : 'Only if you paid instalments during the year. Your CRA account shows what CRA received.' },
    { line: '111', name: 'Rebates', value: 0, enter: true },
    { line: '205', name: 'GST/HST due on the purchase of real property or purchases of emission allowances', value: 0, enter: true },
    { line: '405', name: 'Other GST/HST to be self-assessed', value: 0, enter: true,
      note: 'Imported services you were not charged HST on can be self-assessable. Most small businesses have none.' },
  ];

  lines.push(line113a >= 0
    ? { line: '115', name: 'Amount owing', value: line113a, enter: false }
    : { line: '114', name: 'Refund claimed', value: -line113a, enter: false });

  return lines;
}

/** What is owed, or refunded when negative, once instalments are applied. */
export function hstBalance(lines: ReturnLine[]): number {
  const owing = lines.find((l) => l.line === '115');
  const refund = lines.find((l) => l.line === '114');
  return owing ? owing.value : -(refund?.value ?? 0);
}

// ------------------------------------------------------------ which guide

export type GuideKind =
  | 'hst'
  | 'annual-on'
  | 'annual-federal'
  | 'annual-bc'
  | 'annual-ab'
  | 'initial-on'
  | 'payment'
  | 'general';

/**
 * Which filing screen an obligation gets.
 *
 * Every filing can be recorded as filed with its confirmation number; only
 * some have figures FileClear can fill in or steps it can be precise about.
 */
export function guideFor(obligationId: string): GuideKind {
  if (obligationId === 'hst-annual' || obligationId === 'hst-quarterly'
      || obligationId === 'hst-monthly' || obligationId === 'hst-annual-individual-return') {
    return 'hst';
  }
  switch (obligationId) {
    case 'annual-return-on': return 'annual-on';
    case 'annual-return-federal': return 'annual-federal';
    case 'annual-return-bc': return 'annual-bc';
    case 'annual-return-ab': return 'annual-ab';
    case 'initial-return-on': return 'initial-on';
    case 't2-balance-ccpc': case 't2-balance-general': case 't1-balance':
    case 'hst-annual-individual-payment': case 'hst-instalments':
    case 't2-instalments': case 't2-instalments-monthly': case 't1-instalments':
      return 'payment';
    default: return 'general';
  }
}

/**
 * A confirmation number as a person pastes it: trimmed, internal whitespace
 * collapsed, and bounded. Not validated against a format, because each
 * authority issues its own and a format check that rejected a real one would
 * be worse than none.
 */
export function cleanConfirmation(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}
