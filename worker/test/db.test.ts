import { describe, expect, it } from 'vitest';
import { rowToProfile, profileToColumns, type CompanyRow } from '../src/db';
import { blankProfile } from '../src/rules/profile';
import { filingsFor } from '../src/rules/engine';

/**
 * The mapping between a row and a profile is the one place that knows both
 * shapes, so a mistake here silently changes somebody's filing calendar without
 * changing anything visible in the engine.
 */

const row = (over: Partial<CompanyRow> = {}): CompanyRow => ({
  id: 'c1', account_id: 'a1',
  legal_name: 'Antipode Technologies Inc.',
  jurisdiction: 'ON', incorporation_date: '2024-03-15',
  fye_month: 12, fye_day: 31,
  is_ccpc: 1, claims_sbd: 1,
  gross_revenue: 150000, last_year_tax_payable: 9000,
  hst_registered: 1, hst_period: 'annual', hst_method: 'regular', hst_last_year_net_tax: 8000,
  payroll_account: 1, payroll_remitter: 'regular', payroll_on_remuneration: 90000,
  pays_dividends: 1, is_construction: 0,
  ...over,
});

describe('row to profile', () => {
  it('round trips through columns unchanged', () => {
    const p = rowToProfile(row(), ['ON']);
    const cols = profileToColumns(p);
    const back = rowToProfile({ ...row(), ...cols } as CompanyRow, ['ON']);
    expect(back).toEqual(p);
  });

  it('turns integers into booleans', () => {
    const p = rowToProfile(row({ is_ccpc: 0, pays_dividends: 0, hst_registered: 0 }), []);
    expect(p.isCCPC).toBe(false);
    expect(p.paysDividends).toBe(false);
    expect(p.hst.registered).toBe(false);
  });

  /**
   * A bad enum should not lock a company out of its own dashboard, so it falls
   * back to the commonest case rather than throwing.
   */
  it('falls back on an unrecognised value instead of throwing', () => {
    const p = rowToProfile(row({
      jurisdiction: 'ZZ', hst_period: 'fortnightly', hst_method: 'magic',
      payroll_remitter: 'whenever',
    }), ['ZZ']);
    expect(p.jurisdiction).toBe('ON');
    expect(p.hst.period).toBe('annual');
    expect(p.hst.method).toBe('regular');
    expect(p.payroll.remitter).toBe('regular');
  });

  it('deduplicates provinces', () => {
    const p = rowToProfile(row(), ['ON', 'ON', 'BC']);
    expect(p.permanentEstablishments).toEqual(['ON', 'BC']);
  });

  it('rounds money to whole dollars on the way in', () => {
    const p = blankProfile();
    p.grossRevenue = 1234.56;
    p.hst.lastYearNetTax = 99.9;
    const cols = profileToColumns(p);
    expect(cols.gross_revenue).toBe(1235);
    expect(cols.hst_last_year_net_tax).toBe(100);
  });

  it('writes every column the engine reads', () => {
    const cols = profileToColumns(rowToProfile(row(), ['ON']));
    for (const c of ['jurisdiction', 'incorporation_date', 'fye_month', 'fye_day',
      'is_ccpc', 'claims_sbd', 'hst_registered', 'hst_period', 'payroll_account',
      'pays_dividends', 'is_construction', 'last_year_tax_payable']) {
      expect(cols).toHaveProperty(c);
    }
  });
});

describe('a stored company produces the calendar it should', () => {
  it('gives an Ontario CCPC with payroll the full set', () => {
    const p = rowToProfile(row(), ['ON']);
    const ids = new Set(filingsFor(p, 2027).map((f) => f.obligationId));
    expect(ids).toContain('t2-return');
    expect(ids).toContain('t2-balance-ccpc');
    expect(ids).toContain('annual-return-on');
    expect(ids).toContain('hst-annual');
    expect(ids).toContain('t4-slips');
    expect(ids).toContain('t5-slips');
    expect(ids).toContain('eht-annual');
    expect(ids).not.toContain('annual-return-federal');
  });

  it('swaps the annual return when the jurisdiction changes', () => {
    const p = rowToProfile(row({ jurisdiction: 'CBCA' }), ['ON']);
    const ids = new Set(filingsFor(p, 2027).map((f) => f.obligationId));
    expect(ids).toContain('annual-return-federal');
    expect(ids).not.toContain('annual-return-on');
  });
});
