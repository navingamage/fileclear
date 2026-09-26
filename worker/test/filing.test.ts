import { describe, expect, it } from 'vitest';
import { computeHst, type LedgerLine } from '../src/rules/hst';
import {
  hstNetfileLines, hstBalance, guideFor, cleanConfirmation,
} from '../src/rules/filing';

/**
 * The figures somebody types into GST/HST NETFILE.
 *
 * The test that matters most is that they reconcile: whatever the line
 * breakdown, net tax on the form has to equal the net tax the HST screen
 * reported, or the person has been told two different things.
 */

const L = (date: string, accountId: string, amount: number, hst: number): LedgerLine =>
  ({ date, accountId, amount, hst });

const ledger = [
  L('2026-01-15', 'sales', 40_000_00, 5_200_00),
  L('2026-02-15', 'sales-zero', 10_000_00, 0),
  L('2026-03-15', 'interest-income', 200_00, 0),
  L('2026-01-20', 'software', 1_000_00, 130_00),
  L('2026-02-20', 'meals', 400_00, 52_00),
  L('2026-03-01', 'equipment', 3_000_00, 390_00),
];
const r = computeHst(ledger, '2026-01-01', '2026-03-31');
const get = (lines: ReturnType<typeof hstNetfileLines>, n: string) =>
  lines.find((l) => l.line === n);

describe('the regular method', () => {
  const lines = hstNetfileLines(r, 'regular');

  it('reconciles to the net tax the HST screen reports', () => {
    expect(get(lines, '109')!.value).toBe(r.netTaxRegular);
  });

  /** The labels that were wrong on the HST screen until this. */
  it('puts HST collected on 103 and credits on 106', () => {
    expect(get(lines, '103')!.value).toBe(r.collected);
    expect(get(lines, '106')!.value).toBe(r.itcs);
  });

  it('splits revenue across 90 and 91 and adds them to 101', () => {
    expect(get(lines, '90')!.value).toBe(40_000_00);
    expect(get(lines, '91')!.value).toBe(10_200_00);
    expect(get(lines, '90')!.value + get(lines, '91')!.value).toBe(get(lines, '101')!.value);
  });

  it('says why zero-rated sales went on 91', () => {
    expect(get(lines, '91')!.note).toMatch(/exports/);
  });

  it('marks the lines CRA calculates as ones to check rather than type', () => {
    for (const n of ['105', '108', '109']) expect(get(lines, n)!.enter).toBe(false);
    for (const n of ['90', '91', '101', '103', '106']) expect(get(lines, n)!.enter).toBe(true);
  });

  it('asks for the lines in the order the form does', () => {
    const order = lines.map((l) => l.line);
    expect(order.slice(0, 5)).toEqual(['90', '91', '101', '103', '104']);
    expect(order.indexOf('106')).toBeLessThan(order.indexOf('109'));
    expect(order.indexOf('110')).toBeGreaterThan(order.indexOf('109'));
  });
});

describe('the Quick Method', () => {
  const lines = hstNetfileLines(r, 'quick');

  it('reconciles to the Quick Method net tax', () => {
    expect(get(lines, '109')!.value).toBe(r.quick.netTax);
  });

  /** CRA: "If you are using the quick method, include the GST/HST." */
  it('puts HST-included sales on 101', () => {
    expect(get(lines, '101')!.value).toBe(r.quick.includedSales + r.exemptRevenue);
  });

  it('claims only capital ITCs on 106 and the 1% credit on 107', () => {
    expect(get(lines, '106')!.value).toBe(r.quick.capitalItcs);
    expect(get(lines, '107')!.value).toBe(r.quick.credit);
  });
});

describe('what is owed', () => {
  it('nets instalments already paid against the balance', () => {
    const lines = hstNetfileLines(r, 'regular', 1_000_00);
    expect(get(lines, '110')!.value).toBe(1_000_00);
    expect(hstBalance(lines)).toBe(r.netTaxRegular - 1_000_00);
  });

  it('turns an overpayment into a refund claimed on 114', () => {
    const lines = hstNetfileLines(r, 'regular', r.netTaxRegular + 500_00);
    expect(get(lines, '114')!.value).toBe(500_00);
    expect(get(lines, '115')).toBeUndefined();
    expect(hstBalance(lines)).toBe(-500_00);
  });
});

describe('which guide a filing gets', () => {
  it('sends every HST return to the HST guide', () => {
    for (const id of ['hst-annual', 'hst-quarterly', 'hst-monthly', 'hst-annual-individual-return']) {
      expect(guideFor(id)).toBe('hst');
    }
  });

  it('has a guide for each annual return FileClear computes', () => {
    expect(guideFor('annual-return-on')).toBe('annual-on');
    expect(guideFor('annual-return-federal')).toBe('annual-federal');
    expect(guideFor('annual-return-bc')).toBe('annual-bc');
    expect(guideFor('annual-return-ab')).toBe('annual-ab');
  });

  it('treats a balance or an instalment as a payment, not a return', () => {
    for (const id of ['t2-balance-ccpc', 't1-balance', 'hst-instalments', 't1-instalments']) {
      expect(guideFor(id)).toBe('payment');
    }
  });

  it('sends the slips to the file screen and the income tax returns to theirs', () => {
    expect(guideFor('t4-slips')).toBe('slips');
    expect(guideFor('t5-slips')).toBe('slips');
    expect(guideFor('t2-return')).toBe('t2');
    expect(guideFor('t1-return')).toBe('t1');
  });

  it('falls back to recording it for anything else', () => {
    expect(guideFor('eht-return')).toBe('general');
  });
});

describe('a confirmation number as pasted', () => {
  it('trims and collapses whitespace without judging the format', () => {
    expect(cleanConfirmation('  1234 5678\n90  ')).toBe('1234 5678 90');
    expect(cleanConfirmation('A-99-XYZ')).toBe('A-99-XYZ');
  });

  it('is bounded', () => {
    expect(cleanConfirmation('x'.repeat(500))).toHaveLength(80);
  });
});
