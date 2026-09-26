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
import type { GifiStatements, StatementLine } from './yearend';
import type { Schedule8 } from './cca';
import type { Schedule1, TaxComputation } from './t2';
import type { Statement, SelfEmployedYear, T2125Statement } from './selfemployed';
import { RATE_YEAR } from './personal';

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
  /** Which schedule it belongs to, when a record keeps several in one list. */
  section?: string;
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
  | 'slips'
  | 't2'
  | 't1'
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
    case 't4-slips': case 't5-slips': return 'slips';
    case 't2-return': return 't2';
    case 't1-return': return 't1';
    case 't2-balance-ccpc': case 't2-balance-general': case 't1-balance':
    case 'hst-annual-individual-payment': case 'hst-instalments':
    case 't2-instalments': case 't2-instalments-monthly': case 't1-instalments':
      return 'payment';
    default: return 'general';
  }
}

// ------------------------------------------------- returns filed elsewhere

/**
 * One schedule's worth of figures, in the order the schedule lists them.
 *
 * For the returns FileClear cannot transmit, the T2 and the T1, the next best
 * thing to sending them is making the typing mechanical: every figure next to
 * its line or GIFI code, in the order certified software asks for it, with
 * the totals marked as ones the software works out so they can be checked
 * rather than typed.
 */
export interface FigureSection {
  title: string;
  /** The schedule or form, as the software names it. */
  form: string;
  note?: string;
  lines: ReturnLine[];
}

const gifiRows = (rows: StatementLine[]): ReturnLine[] =>
  rows.map((r) => ({ line: String(r.gifi), name: r.name, value: r.amount, enter: true }));

const total = (line: string | number, name: string, value: number, note?: string): ReturnLine =>
  ({ line: String(line), name, value, enter: false, note });

/**
 * Schedule 8 class by class. Column numbers are left out on purpose: CRA has
 * renumbered them between versions of the schedule, and software lays the
 * form out its own way, but every version asks for these five things.
 */
function classRows(s8: Schedule8, cca: string): ReturnLine[] {
  return s8.rows.flatMap((r) => {
    const cl = `Cl ${r.classNumber}`;
    const out: ReturnLine[] = [
      { line: cl, name: `${r.name}: undepreciated capital cost at the start of the year`, value: r.openingUcc, enter: true },
      { line: cl, name: `${r.name}: cost of additions in the year`, value: r.additions, enter: true },
    ];
    if (r.dispositions) {
      out.push({ line: cl, name: `${r.name}: proceeds of dispositions, up to cost`, value: r.dispositions, enter: true });
    }
    out.push({ line: cl, name: `${r.name}: ${cca} claimed`, value: r.claimed, enter: true,
      note: r.claimed < r.maximumCca ? 'Less than the maximum, because you chose to claim less.' : `The maximum, at ${(r.rate * 100).toFixed(0)}%.` });
    out.push(total(cl, `${r.name}: undepreciated capital cost at the end of the year`, r.closingUcc));
    return out;
  });
}

/**
 * The T2, schedule by schedule, as certified software asks for it.
 *
 * Schedule 125 and Schedule 100 are the GIFI financial statements; Schedule 8
 * is capital cost allowance; Schedule 1 takes net income from the books to
 * net income for tax. The tax itself is the software's to compute, so it is
 * shown as a check rather than a figure to type.
 */
export function t2Figures(
  s: GifiStatements, s1: Schedule1, s8: Schedule8, tax: TaxComputation,
): FigureSection[] {
  const sections: FigureSection[] = [];

  sections.push({
    title: 'Income statement', form: 'Schedule 125 (GIFI)',
    note: 'Enter each code and amount. FileClear books no income tax expense, so net income after tax, code 9999, is the same as before tax.',
    lines: [
      ...gifiRows(s.income.revenue),
      total(8299, 'Total revenue', s.income.totalRevenue),
      ...gifiRows(s.income.expenses),
      total(9368, 'Total expenses', s.income.totalExpenses),
      total(9970, 'Net income (loss) before taxes and extraordinary items', s.income.netBeforeTax),
      total(9999, 'Net income (loss) after taxes and extraordinary items', s.income.netBeforeTax),
    ],
  });

  const b = s.balance;
  sections.push({
    title: 'Balance sheet', form: 'Schedule 100 (GIFI)',
    note: b.difference !== 0
      ? 'This balance sheet does not balance, and the software will refuse it. Fix the ledger on the year end screen first.'
      : undefined,
    lines: [
      ...gifiRows(b.currentAssets),
      total(1599, 'Total current assets', b.totalCurrentAssets),
      ...gifiRows(b.capitalAssets),
      total(2599, 'Total assets', b.totalAssets),
      ...gifiRows(b.currentLiabilities),
      total(3139, 'Total current liabilities', b.totalCurrentLiabilities),
      ...gifiRows(b.longTermLiabilities),
      total(3499, 'Total liabilities', b.totalLiabilities),
      ...gifiRows(b.equity),
      total(3620, "Total shareholder equity", b.totalEquity),
      total(3640, "Total liabilities and shareholder equity", b.totalLiabilitiesAndEquity),
    ],
  });

  if (s8.rows.length) {
    sections.push({
      title: 'Capital cost allowance', form: 'Schedule 8',
      note: 'One row per class. Enter the class number, then these amounts.',
      lines: classRows(s8, 'capital cost allowance'),
    });
  }

  const ref = (r: string) => r.replace('S1 line ', '');
  sections.push({
    title: 'Net income for tax', form: 'Schedule 1',
    lines: [
      total('A', 'Net income (loss) after taxes and extraordinary items, from code 9999', s1.netIncomePerBooks),
      ...s1.additions.map((a) => ({ line: ref(a.ref), name: a.label, value: a.amount, enter: true, note: a.why })),
      ...s1.deductions.map((d) => ({ line: ref(d.ref), name: d.label, value: d.amount, enter: true, note: d.why })),
      total(300, 'Net income (loss) for income tax purposes, carried to line 300 of the T2', s1.netIncomeForTax),
    ],
  });

  sections.push({
    title: 'Check the result', form: 'T2',
    note: 'The software works these out from the schedules. If its figures differ by more than a few dollars, a schedule was typed differently from the one above.',
    lines: [
      total(360, 'Taxable income', tax.taxableIncome,
        'Assumes no loss carried forward and no donations. Either would reduce it.'),
      total('', 'Income eligible for the small business deduction', tax.sbdIncome),
      total('', 'Federal tax, after the small business deduction', tax.federalTax),
      total('', `${tax.provinceName || 'Provincial'} tax`, tax.provincialTax),
      total('', 'Total tax payable', tax.totalTax),
    ],
  });

  return sections;
}

/**
 * The T1 with its T2125, as certified software asks for it.
 *
 * The T2125 figures are the business's and are typed in. Everything on the T1
 * itself is the software's to compute from them, and those figures only match
 * FileClear's when the business is the person's only income and they claim
 * nothing beyond the basic personal amount, so they are offered as a check
 * with that said plainly.
 */
export function t1Figures(
  t: T2125Statement, st: Statement, s8: Schedule8, year: SelfEmployedYear,
  taxYear = RATE_YEAR,
): FigureSection[] {
  const sections: FigureSection[] = [];

  sections.push({
    title: 'Income', form: 'T2125, part 3',
    lines: [
      { line: '8299', name: 'Gross business income', value: st.grossRevenue, enter: true,
        note: 'Excluding GST/HST. If the software asks for sales including GST/HST first, it takes the tax back out on the next line, and the result should be this figure.' },
      ...t.otherIncome.map((l) => ({ line: String(l.line), name: `Of which, ${l.name.toLowerCase()}`, value: l.amount, enter: true })),
    ],
  });

  sections.push({
    title: 'Expenses', form: 'T2125, part 5',
    note: t.mealsDisallowed
      ? 'Meals are already at the deductible half. If the software asks for the full amount and halves it itself, enter the full amount instead.'
      : undefined,
    lines: [
      ...t.expenses.map((l) => ({ line: String(l.line), name: l.name, value: l.amount, enter: true })),
      total(9368, 'Total expenses', st.expenses),
    ],
  });

  if (s8.rows.length) {
    sections.push({
      title: 'Capital cost allowance', form: 'T2125, area A',
      note: 'One row per class. Enter the class number, then these amounts.',
      lines: [...classRows(s8, 'CCA'), total(9936, 'Total capital cost allowance', st.cca)],
    });
  }

  sections.push({
    title: 'Net income', form: 'T2125, parts 6 and 7',
    lines: [
      ...(st.businessUseOfHome
        ? [{ line: '9945', name: 'Business use of home', value: st.businessUseOfHome, enter: true,
          note: 'From the business use of home section of the year end screen, entered in part 7.' }]
        : []),
      total(9946, 'Net income (loss)', st.netIncome),
    ],
  });

  // The CPP and tax figures come from one year's tables. For any other year
  // they would be a confident wrong answer to check against, so they are
  // left out and the software's own figures are the ones to trust.
  const sameYear = taxYear === RATE_YEAR;
  sections.push({
    title: 'Check the result', form: 'T1',
    note: sameYear
      ? 'These match only when the business is your only income and you claim nothing beyond the basic personal amount. RRSP contributions, other income or other credits change them, and the software is right when they do.'
      : `FileClear's personal tax and CPP tables are for ${RATE_YEAR}, so it gives no tax figure to check a ${taxYear} return against. The software's figures for ${taxYear} are the ones to use.`,
    lines: [
      total(13499, 'Gross business income', st.grossRevenue),
      total(13500, 'Net business income', st.netIncome),
      ...(sameYear ? [
        total(22200, 'Deduction for CPP contributions on self-employment income', year.cpp.deductible),
        total(26000, 'Taxable income', year.tax.taxableIncome),
        total(42100, 'CPP contributions payable on self-employment income', year.cpp.total),
        total(43500, 'Total payable', year.totalDue),
      ] : []),
    ],
  });

  return sections;
}

/**
 * Sections as one list and back, so a filed T2 or T1 can be kept in the same
 * record as a filed HST return: each line carries its schedule with it.
 */
export function flattenSections(sections: FigureSection[]): ReturnLine[] {
  return sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: `${s.form}|${s.title}` })));
}

export function sectionsFrom(lines: ReturnLine[]): FigureSection[] {
  const out: FigureSection[] = [];
  for (const l of lines) {
    const [form = '', title = ''] = (l.section ?? '|').split('|');
    let s = out[out.length - 1];
    if (!s || s.form !== form || s.title !== title) out.push(s = { form, title, lines: [] });
    s.lines.push(l);
  }
  return out;
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
