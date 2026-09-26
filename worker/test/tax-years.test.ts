import { describe, expect, it } from 'vitest';
import {
  TABLES, tablesFor, hasTables, cppOnSalary, eiOnSalary, taxOnTaxableIncome, personalTax,
  rrspRoom, RATE_YEAR,
} from '../src/rules/personal';
import { cppOnSelfEmployment, selfEmployedYear } from '../src/rules/selfemployed';
import { t4ForSalary } from '../src/rules/slips';

/**
 * Each tax year on its own figures.
 *
 * The maximums below are CRA's published ones, from the T4127 editions for
 * each year, so a table typed wrong fails here rather than on somebody's slip.
 */

const box = (t: ReturnType<typeof t4ForSalary>, b: string) =>
  t.boxes.find((x) => x.box === b)?.amount ?? 0;

describe('which tables a year gets', () => {
  it('holds 2024, 2025 and 2026', () => {
    expect(Object.keys(TABLES).map(Number)).toEqual([2024, 2025, 2026]);
    expect(hasTables(2025)).toBe(true);
    expect(hasTables(2023)).toBe(false);
  });

  it('falls back to the nearest year held and says which one it used', () => {
    expect(tablesFor(2023).year).toBe(2024);
    expect(tablesFor(2031).year).toBe(2026);
    expect(tablesFor().year).toBe(RATE_YEAR);
  });

  it('keeps every CPP maximum consistent with its own ceilings', () => {
    for (const t of Object.values(TABLES)) {
      expect(Math.round((t.cpp.ympe - t.cpp.exemption) * t.cpp.rate)).toBe(t.cpp.maxContribution);
      expect(Math.round((t.cpp.yampe - t.cpp.ympe) * t.cpp.rate2)).toBe(t.cpp.maxContribution2);
      expect(Math.round(t.ei.maxInsurable * t.ei.rate)).toBe(t.ei.maxPremium);
    }
  });
});

describe('CPP and EI at the maximum, by year', () => {
  it.each([
    [2024, 3_867_50 + 188_00, 1_049_12],
    [2025, 4_034_10 + 396_00, 1_077_48],
    [2026, 4_230_45 + 416_00, 1_123_07],
  ])('%i', (year, cpp, ei) => {
    expect(cppOnSalary(200_000_00, year).employee).toBe(cpp);
    expect(eiOnSalary(200_000_00, true, year).employee).toBe(ei);
    expect(cppOnSelfEmployment(200_000_00, year).total).toBe(cpp * 2);
    expect(cppOnSelfEmployment(200_000_00, year).maximum).toBe(cpp * 2);
  });
});

describe('income tax, by year', () => {
  it('uses 14.5% for the lowest 2025 bracket and the 2025 basic personal amount', () => {
    const t = taxOnTaxableIncome({ taxableIncome: 50_000_00, year: 2025 });
    // 14.5% of $50,000 less 14.5% of $16,129, which lands on a half cent.
    expect(Math.abs(t.federal - (7_250_00 - 2_338_70.5))).toBeLessThanOrEqual(1);
    // 5.05% of $50,000 less 5.05% of $12,747.
    expect(Math.abs(t.ontario - (2_525_00 - 643_72.35))).toBeLessThanOrEqual(1);
    expect(t.healthPremium).toBe(600_00);
  });

  it('gives a different answer for the same income in 2026', () => {
    const a = taxOnTaxableIncome({ taxableIncome: 50_000_00, year: 2025 }).total;
    const b = taxOnTaxableIncome({ taxableIncome: 50_000_00, year: 2026 }).total;
    expect(a).not.toBe(b);
  });

  it('defaults to the current year, so forward looking screens do not move', () => {
    expect(personalTax({ salary: 90_000_00 }).total)
      .toBe(personalTax({ salary: 90_000_00, year: RATE_YEAR }).total);
  });

  it('carries the year through a self-employed return', () => {
    const y = selfEmployedYear(82_000_00, 2025);
    expect(y.year).toBe(2025);
    expect(y.tablesYear).toBe(2025);
    expect(y.cpp.total).toBe(8_860_20);
    expect(selfEmployedYear(82_000_00, 2023).tablesYear).toBe(2024);
  });

  it('earns RRSP room toward the following year\'s limit', () => {
    expect(rrspRoom(500_000_00, 2024)).toBe(32_490_00);
    expect(rrspRoom(500_000_00, 2025)).toBe(33_810_00);
    expect(rrspRoom(500_000_00, 2026)).toBe(35_390_00);
  });
});

describe('a T4 on its own year', () => {
  it('puts 2025 CPP, CPP2 and the 2025 ceiling on a 2025 slip', () => {
    const t = t4ForSalary(100_000_00, 2025);
    expect(box(t, '16')).toBe(4_034_10);
    expect(box(t, '16A')).toBe(396_00);
    expect(box(t, '26')).toBe(71_300_00);
    expect(t.employerCpp).toBe(4_034_10 + 396_00);
  });

  it('uses 2025 EI for an insurable employee', () => {
    const t = t4ForSalary(100_000_00, 2025, true);
    expect(box(t, '18')).toBe(1_077_48);
    expect(box(t, '24')).toBe(65_700_00);
  });

  it('says so when the year has no tables of its own', () => {
    expect(t4ForSalary(60_000_00, 2023).notes[0]).toMatch(/does not hold 2023/);
    expect(t4ForSalary(60_000_00, 2025).notes.join(' ')).not.toMatch(/does not hold/);
  });
});
