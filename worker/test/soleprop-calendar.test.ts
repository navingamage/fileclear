import { describe, expect, it } from 'vitest';
import { blankProfile, normalise, type CompanyProfile } from '../src/rules/profile';
import { filingsFor, filingsBetween } from '../src/rules/engine';

/**
 * The calendar a sole proprietor gets, and everything that has to be absent
 * from it.
 *
 * Both halves matter equally. A missing filing reads as nothing owing, and a
 * filing that does not apply reads as a product that was not built for you: a
 * sole proprietor shown a T2 and an annual return stops trusting the dates
 * that are right.
 */

function soleProp(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return normalise({
    ...blankProfile(),
    legalName: 'Jane Doe Design',
    entityType: 'soleProprietorship',
    incorporationDate: '2023-04-01',
    ...over,
  });
}

const ids = (p: CompanyProfile, year: number) =>
  filingsFor(p, year).map((f) => f.obligationId);
const due = (p: CompanyProfile, year: number, id: string) =>
  filingsFor(p, year).filter((f) => f.obligationId === id).map((f) => f.due);

describe('the split that catches everybody', () => {
  /**
   * The filing deadline was extended for self-employed people and the payment
   * deadline was not. Six weeks of interest sit in that gap, and showing one
   * date is how somebody walks into it.
   */
  it('puts the return on 15 June and the money on 30 April', () => {
    const p = soleProp();
    expect(due(p, 2027, 't1-return')).toEqual(['2027-06-15']);
    expect(due(p, 2027, 't1-balance')).toEqual(['2027-04-30']);
  });

  it('does the same thing again in HST for a December year end', () => {
    const p = soleProp({
      hst: { registered: true, period: 'annual', method: 'regular', lastYearNetTax: 0 },
    });
    expect(due(p, 2027, 'hst-annual-individual-payment')).toEqual(['2027-04-30']);
    expect(due(p, 2027, 'hst-annual-individual-return')).toEqual(['2027-06-15']);
  });

  it('does not give a sole proprietor the corporate three month HST date', () => {
    const p = soleProp({
      hst: { registered: true, period: 'annual', method: 'regular', lastYearNetTax: 0 },
    });
    expect(ids(p, 2027)).not.toContain('hst-annual');
  });
});

describe('what a sole proprietor never owes', () => {
  const p = soleProp({
    jurisdiction: 'CBCA',
    paysDividends: true,
    lastYearTaxPayable: 50_000,
    isCCPC: true,
    claimsSmallBusinessDeduction: true,
  });

  it('files no T2 and pays no corporate balance', () => {
    const owed = ids(p, 2027);
    expect(owed).not.toContain('t2-return');
    expect(owed).not.toContain('t2-balance-ccpc');
    expect(owed).not.toContain('t2-balance-general');
    expect(owed).not.toContain('t2-instalments');
    expect(owed).not.toContain('t2-instalments-monthly');
  });

  it('files no annual return to any registry', () => {
    for (const j of ['CBCA', 'ON', 'BC', 'AB'] as const) {
      const owed = ids(soleProp({ jurisdiction: j, lastYearTaxPayable: 50_000 }), 2027);
      expect(owed.filter((id) => id.startsWith('annual-return'))).toEqual([]);
      expect(owed).not.toContain('initial-return-on');
    }
  });

  /**
   * A business with no shares cannot pay a dividend, so `normalise` turns the
   * flag off rather than letting a stale answer from the corporate form
   * produce a T5 for a business with no shareholders.
   */
  it('issues no T5, whatever the form last held', () => {
    expect(p.paysDividends).toBe(false);
    expect(ids(p, 2027)).not.toContain('t5-slips');
  });

  it('is not a CCPC and claims no small business deduction', () => {
    expect(p.isCCPC).toBe(false);
    expect(p.claimsSmallBusinessDeduction).toBe(false);
  });

  it('has a calendar fiscal year whatever was entered', () => {
    const odd = soleProp({ fiscalYearEnd: { month: 9, day: 30 } });
    expect(odd.fiscalYearEnd).toEqual({ month: 12, day: 31 });
  });
});

describe('what it still owes, because CRA treats it the same way', () => {
  it('remits payroll and files T4s if it has employees', () => {
    const p = soleProp({
      payroll: { hasAccount: true, remitter: 'regular', ontarioRemuneration: 90_000 },
    });
    const owed = ids(p, 2027);
    expect(owed).toContain('payroll-remittance-regular');
    expect(owed).toContain('t4-slips');
    expect(owed).toContain('eht-annual');
  });

  it('files the construction return if that is the business', () => {
    expect(ids(soleProp({ isConstruction: true }), 2027)).toContain('t5018');
  });

  it('files quarterly HST on the ordinary dates', () => {
    const p = soleProp({
      hst: { registered: true, period: 'quarterly', method: 'regular', lastYearNetTax: 0 },
    });
    expect(due(p, 2027, 'hst-quarterly'))
      .toEqual(['2027-04-30', '2027-07-31', '2027-10-31', '2028-01-31']);
  });
});

describe('personal instalments', () => {
  const p = soleProp({ lastYearTaxPayable: 9_000 });

  it('falls on the four fixed dates whatever the business does', () => {
    expect(due(p, 2027, 't1-instalments'))
      .toEqual(['2027-03-15', '2027-06-15', '2027-09-15', '2027-12-15']);
  });

  it('is not asked for under $3,000', () => {
    expect(due(soleProp({ lastYearTaxPayable: 2_500 }), 2027, 't1-instalments')).toEqual([]);
  });

  it('is not asked for in the first year', () => {
    const first = soleProp({ incorporationDate: '2027-02-01', lastYearTaxPayable: 9_000 });
    expect(due(first, 2027, 't1-instalments')).toEqual([]);
  });
});

describe('the business name that quietly expires', () => {
  const named = soleProp({
    registeredBusinessName: true,
    businessNameRegisteredOn: '2023-04-01',
  });

  it('comes round every five years and not in between', () => {
    expect(due(named, 2027, 'business-name-renewal')).toEqual([]);
    expect(due(named, 2028, 'business-name-renewal')).toEqual(['2028-04-01']);
    expect(due(named, 2029, 'business-name-renewal')).toEqual([]);
    expect(due(named, 2033, 'business-name-renewal')).toEqual(['2033-04-01']);
  });

  it('is absent for somebody trading under their own name', () => {
    expect(due(soleProp({ registeredBusinessName: false }), 2028, 'business-name-renewal'))
      .toEqual([]);
  });

  it('falls back to the business start date when no registration date was given', () => {
    const p = soleProp({ registeredBusinessName: true, incorporationDate: '2022-06-10' });
    expect(due(p, 2027, 'business-name-renewal')).toEqual(['2027-06-10']);
  });

  it('never appears for a corporation', () => {
    const corp = { ...blankProfile(), incorporationDate: '2023-04-01',
      registeredBusinessName: true };
    expect(due(corp, 2028, 'business-name-renewal')).toEqual([]);
  });
});

describe('a real first year', () => {
  /**
   * Started trading 1 September 2026, registered for HST straight away, no
   * employees. What should the calendar look like through 2027?
   */
  const started = soleProp({
    incorporationDate: '2026-09-01',
    registeredBusinessName: true,
    hst: { registered: true, period: 'annual', method: 'regular', lastYearNetTax: 0 },
  });

  it('asks for the first return and the first payment in 2027', () => {
    const window = filingsBetween(started, '2027-01-01', '2027-12-31');
    const got = window.map((f) => `${f.effectiveDue} ${f.obligationId}`);
    expect(got).toContain('2027-04-30 hst-annual-individual-payment');
    expect(got).toContain('2027-04-30 t1-balance');
    expect(got).toContain('2027-06-15 hst-annual-individual-return');
    expect(got).toContain('2027-06-15 t1-return');
  });

  it('asks for nothing in the four months before trading started', () => {
    const before = filingsBetween(started, '2026-01-01', '2026-08-31');
    expect(before).toEqual([]);
  });

  it('asks for no instalments in the first year', () => {
    const window = filingsBetween(started, '2027-01-01', '2027-12-31');
    expect(window.map((f) => f.obligationId)).not.toContain('t1-instalments');
  });
});

describe('the filing guide can find when the money is due', () => {
  /**
   * The HST return guide looks up the payment filing with the same period to
   * say when to pay. If the two ever stopped sharing a period label the guide
   * would fall back to the return's 15 June date and send somebody into six
   * weeks of interest, so the pairing is pinned here.
   */
  it('gives the HST payment and the HST return the same period', () => {
    const p = soleProp({
      hst: { registered: true, period: 'annual', method: 'regular', lastYearNetTax: 0 },
    });
    const fs = filingsFor(p, 2027);
    const pay = fs.find((f) => f.obligationId === 'hst-annual-individual-payment')!;
    const ret = fs.find((f) => f.obligationId === 'hst-annual-individual-return')!;
    expect(pay.periodLabel).toBe(ret.periodLabel);
    expect(pay.due < ret.due).toBe(true);
  });
});
