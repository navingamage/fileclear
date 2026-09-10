import { describe, expect, it } from 'vitest';
import {
  schedule8, firstYearFactor, CLASS_BY_NUMBER, type AssetRecord,
} from '../src/rules/cca';

const YEARS = [
  { from: '2025-01-01', to: '2025-12-31' },
  { from: '2026-01-01', to: '2026-12-31' },
  { from: '2027-01-01', to: '2027-12-31' },
  { from: '2028-01-01', to: '2028-12-31' },
];

const asset = (over: Partial<AssetRecord> = {}): AssetRecord => ({
  id: 'a1', classNumber: 50, description: 'Laptop',
  availableForUse: '2026-03-01', costCents: 300_000, ...over,
});

describe('the accelerated investment incentive, as enacted', () => {
  /**
   * The half year rule normally allows only half a year's CCA on an addition.
   * The incentive suspends it and adds an enhancement on top, and it is being
   * phased out. Getting the band wrong changes the deduction by a third.
   */
  it('gives three times the normal first year amount up to 2023', () => {
    expect(firstYearFactor('2023-12-31', true)).toBe(1.5);
  });

  it('cancels the half year rule with no enhancement left from 2024 to 2027', () => {
    // "Twice the normal first year amount" is a full year and nothing more.
    expect(firstYearFactor('2026-06-30', true)).toBe(1.0);
    expect(firstYearFactor('2027-12-31', true)).toBe(1.0);
  });

  it('brings the half year rule back in 2028', () => {
    expect(firstYearFactor('2028-01-01', true)).toBe(0.5);
  });

  it('treats a class exempt from the half year rule differently', () => {
    expect(firstYearFactor('2026-06-30', false)).toBe(1.25);
    expect(firstYearFactor('2028-06-30', false)).toBe(1.0);
  });
});

describe('schedule 8', () => {
  it('claims a full year on a 2026 addition, not half', () => {
    const s = schedule8([asset()], YEARS.slice(1, 2));
    const row = s.rows[0]!;
    expect(row.additions).toBe(300_000);
    expect(row.base).toBe(300_000);           // no half year reduction
    expect(row.maximumCca).toBe(165_000);     // 55% of 300,000
    expect(row.closingUcc).toBe(135_000);
  });

  it('halves the base for the same purchase made in 2028', () => {
    const s = schedule8([asset({ availableForUse: '2028-03-01' })], YEARS);
    const row = s.rows[0]!;
    expect(row.base).toBe(150_000);           // half year rule is back
    expect(row.maximumCca).toBe(82_500);
  });

  /**
   * The chain is the point. This year's opening pool is last year's closing
   * pool, and a closing balance that is stored rather than recomputed is a
   * balance that silently goes wrong when an earlier year is corrected.
   */
  it('carries the pool forward year by year', () => {
    const one = schedule8([asset()], YEARS.slice(1, 2)).rows[0]!;
    const two = schedule8([asset()], YEARS.slice(1, 3)).rows[0]!;
    expect(two.openingUcc).toBe(one.closingUcc);         // 135,000
    expect(two.maximumCca).toBe(Math.round(135_000 * 0.55));
    expect(two.closingUcc).toBe(135_000 - two.maximumCca);
  });

  it('lets a smaller claim be chosen, and keeps the rest in the pool', () => {
    const full = schedule8([asset()], YEARS.slice(1, 2)).rows[0]!;
    const part = schedule8([asset()], YEARS.slice(1, 2), { 50: 50_000 }).rows[0]!;
    expect(part.claimed).toBe(50_000);
    expect(part.closingUcc).toBeGreaterThan(full.closingUcc);
    expect(part.closingUcc).toBe(300_000 - 50_000);
  });

  it('refuses a claim larger than the maximum', () => {
    const row = schedule8([asset()], YEARS.slice(1, 2), { 50: 999_999_00 }).rows[0]!;
    expect(row.claimed).toBe(row.maximumCca);
  });

  it('takes recapture into income when a sale empties the pool and more', () => {
    // Bought for 3,000 in 2026, sold for 3,000 in 2027 after claiming 1,650.
    const s = schedule8(
      [asset({ disposedOn: '2027-06-01', proceedsCents: 300_000 })],
      YEARS.slice(1, 3));
    const row = s.rows[0]!;
    expect(row.recapture).toBe(300_000 - 135_000);   // proceeds over the pool
    expect(row.closingUcc).toBe(0);
    expect(s.totalRecapture).toBe(165_000);
  });

  it('caps proceeds at cost and flags the capital gain', () => {
    const s = schedule8(
      [asset({ disposedOn: '2027-06-01', proceedsCents: 500_000 })],
      YEARS.slice(1, 3));
    expect(s.rows[0]!.dispositions).toBe(300_000);   // cost, not proceeds
    expect(s.notes.join(' ')).toMatch(/capital gain/i);
  });

  it('allows a terminal loss when the class empties with a balance left', () => {
    const s = schedule8(
      [asset({ disposedOn: '2027-06-01', proceedsCents: 50_000 })],
      YEARS.slice(1, 3));
    const row = s.rows[0]!;
    expect(row.terminalLoss).toBe(135_000 - 50_000);
    expect(row.maximumCca).toBe(0);
    expect(row.closingUcc).toBe(0);
  });

  it('says nothing about a class it cannot compute', () => {
    const s = schedule8(
      [asset({ classNumber: 13, availableForUse: '2026-03-01' })], YEARS.slice(1, 2));
    expect(s.rows[0]!.maximumCca).toBe(0);
    expect(s.notes.join(' ')).toMatch(/straight line/i);
  });

  it('names the pending proposal rather than quietly claiming the smaller amount', () => {
    const s = schedule8([asset()], YEARS.slice(1, 2));
    expect(s.notes.join(' ')).toMatch(/Fall Economic Statement/);
  });

  /**
   * Class 12 is the case that catches a missing cap. The incentive raises the
   * base by a quarter and the rate is 100%, so an uncapped calculation deducts
   * $500 for a $400 tool. A claim can never take a pool below zero.
   */
  it('writes class 12 off in full, and no further', () => {
    expect(CLASS_BY_NUMBER.get(12)!.rate).toBe(1);
    const s = schedule8(
      [asset({ classNumber: 12, costCents: 40_000 })], YEARS.slice(1, 2));
    const row = s.rows[0]!;
    expect(row.base).toBe(50_000);          // the enhancement is real
    expect(row.maximumCca).toBe(40_000);    // the deduction is still the cost
    expect(row.closingUcc).toBe(0);
  });

  it('never lets a claim drive the pool negative', () => {
    for (const classNumber of [50, 8, 10, 12, 53]) {
      const s = schedule8(
        [asset({ classNumber, costCents: 100_000 })], YEARS.slice(1, 2));
      const row = s.rows[0]!;
      expect(row.claimed).toBeLessThanOrEqual(100_000);
      expect(row.closingUcc).toBeGreaterThanOrEqual(0);
    }
  });

  it('has nothing to report when there are no assets', () => {
    expect(schedule8([], YEARS).rows).toEqual([]);
    expect(schedule8([], []).totalCca).toBe(0);
  });
});
