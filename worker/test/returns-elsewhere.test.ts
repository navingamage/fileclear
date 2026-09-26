import { describe, expect, it } from 'vitest';
import { schedule1, computeTax } from '../src/rules/t2';
import { fiscalYears, statementsFor } from '../src/rules/yearend';
import { schedule8, type AssetRecord } from '../src/rules/cca';
import { blankProfile } from '../src/rules/profile';
import { ACCOUNT_BY_ID } from '../src/rules/gifi';
import type { LedgerLine } from '../src/rules/hst';
import { statement, selfEmployedYear, t2125Statement } from '../src/rules/selfemployed';
import {
  t2Figures, t1Figures, flattenSections, sectionsFrom, type FigureSection,
} from '../src/rules/filing';

/**
 * The T2 and T1 figures handed to somebody filing through other software.
 *
 * What matters is that they are the year end screen's figures, carried to the
 * lines the software asks for, and that nothing typed from them can disagree
 * with the totals the software works out.
 */

const isCurrent = (id: string): boolean => ACCOUNT_BY_ID.get(id)?.current !== false;
const line = (accountId: string, amount: number, hst = 0, date = '2026-06-01'): LedgerLine =>
  ({ date, accountId, amount, hst, counterAccountId: 'bank' });

const ledger = [
  line('sales', 120_000_00, 15_600_00),
  line('software', 2_000_00, 260_00),
  line('meals', 1_000_00, 130_00),
  line('equipment', 3_000_00, 390_00),
];
const assets: AssetRecord[] = [
  { id: 'a', classNumber: 50, description: 'Laptop', availableForUse: '2026-06-01', costCents: 3_000_00 },
];

/** An exact form name wins over a prefix, so Schedule 1 is not Schedule 125. */
const section = (sections: FigureSection[], form: string) =>
  sections.find((s) => s.form === form) ?? sections.find((s) => s.form.startsWith(form));
const find = (sections: FigureSection[], form: string, ln: string) =>
  section(sections, form)?.lines.find((l) => l.line === ln);
const entered = (sections: FigureSection[], form: string) =>
  section(sections, form)!.lines.filter((l) => l.enter);

describe('the T2, schedule by schedule', () => {
  const p = { ...blankProfile(), legalName: 'Test Inc.', incorporationDate: '2024-01-01' };
  const years = fiscalYears(p, '2027-06-01');
  const year = years.find((y) => y.to === '2026-12-31')!;
  const chain = [...years].reverse().filter((y) => y.to <= year.to);
  const s8 = schedule8(assets, chain);
  const st = statementsFor(ledger, year, isCurrent);
  const s1 = schedule1(st, ledger, year, s8);
  const tax = computeTax(p, year, s1, ledger);
  const sections = t2Figures(st, s1, s8, tax);

  it('has the schedules in the order the software asks for them', () => {
    expect(sections.map((s) => s.form)).toEqual([
      'Schedule 125 (GIFI)', 'Schedule 100 (GIFI)', 'Schedule 8', 'Schedule 1', 'T2']);
  });

  it('types in lines that add up to the totals the software works out', () => {
    const lines = sections[0]!.lines;
    const revenue = lines.filter((l) => l.enter && Number(l.line) < 8299)
      .reduce((n, l) => n + l.value, 0);
    const expenses = lines.filter((l) => l.enter && Number(l.line) > 8299)
      .reduce((n, l) => n + l.value, 0);
    expect(revenue).toBe(find(sections, 'Schedule 125', '8299')!.value);
    expect(expenses).toBe(find(sections, 'Schedule 125', '9368')!.value);
    expect(find(sections, 'Schedule 125', '9999')!.value).toBe(st.income.netBeforeTax);
  });

  it('balances the balance sheet it hands over', () => {
    expect(find(sections, 'Schedule 100', '2599')!.value)
      .toBe(find(sections, 'Schedule 100', '3640')!.value);
  });

  it('carries Schedule 1 to line 300 with the meals add back and the CCA', () => {
    expect(find(sections, 'Schedule 1', '121')!.value).toBe(500_00);
    expect(find(sections, 'Schedule 1', '403')!.value).toBe(s8.totalCca);
    expect(find(sections, 'Schedule 1', '300')!.value).toBe(s1.netIncomeForTax);
    const a = find(sections, 'Schedule 1', 'A')!.value;
    const adds = entered(sections, 'Schedule 1').filter((l) => Number(l.line) < 400)
      .reduce((n, l) => n + l.value, 0);
    const deds = entered(sections, 'Schedule 1').filter((l) => Number(l.line) >= 400)
      .reduce((n, l) => n + l.value, 0);
    expect(a + adds - deds).toBe(s1.netIncomeForTax);
  });

  it('gives the tax only as a check, never as a figure to type', () => {
    expect(sections.at(-1)!.lines.every((l) => !l.enter)).toBe(true);
    expect(find(sections, 'T2', '360')!.value).toBe(tax.taxableIncome);
  });

  it('closes each class at opening plus additions less CCA', () => {
    const cls = sections.find((s) => s.form === 'Schedule 8')!.lines;
    const v = (needle: string) => cls.find((l) => l.name.includes(needle))!.value;
    expect(v('at the start') + v('additions') - v('claimed')).toBe(v('at the end'));
  });

  it('survives being kept as a filed record and read back', () => {
    expect(sectionsFrom(flattenSections(sections)).map((s) => s.lines.length))
      .toEqual(sections.map((s) => s.lines.length));
    expect(sectionsFrom(flattenSections(sections))[3]!.title).toBe('Net income for tax');
  });
});

describe('the T1 and its T2125', () => {
  const t = t2125Statement(ledger, '2026-01-01', '2026-12-31');
  const st = statement({ grossRevenue: t.grossRevenue, expenses: t.totalExpenses, cca: 450_00 });
  const year = selfEmployedYear(st.netIncome);
  const sections = t1Figures(t, st, schedule8([], []), year);

  it('puts meals in at the deductible half on line 8523', () => {
    expect(find(sections, 'T2125, part 5', '8523')!.value).toBe(500_00);
  });

  it('carries net income from 9946 to line 13500', () => {
    expect(find(sections, 'T2125, parts 6', '9946')!.value).toBe(st.netIncome);
    expect(find(sections, 'T1', '13500')!.value).toBe(st.netIncome);
  });

  it('checks total payable against what the year end screen says is due', () => {
    expect(find(sections, 'T1', '43500')!.value).toBe(year.totalDue);
    expect(find(sections, 'T1', '42100')!.value).toBe(year.cpp.total);
  });

  it('leaves out the class section when there is no capital property', () => {
    expect(sections.some((s) => s.form === 'T2125, area A')).toBe(false);
  });
});

describe('a T1 for a year FileClear has tables for', () => {
  const t = t2125Statement(ledger, '2025-01-01', '2025-12-31');
  const st = statement({ grossRevenue: 90_000_00, expenses: 8_000_00 });
  const year = selfEmployedYear(st.netIncome, 2025);
  const sections = t1Figures(t, st, schedule8([], []), year, 2025);

  it('checks 2025 CPP against the 2025 ceilings', () => {
    // $82,000 is above both 2025 ceilings, so it is the 2025 maximum:
    // twice $4,034.10 plus twice $396.00.
    expect(find(sections, 'T1', '42100')!.value).toBe(8_860_20);
  });
});

describe('a T1 for a year the tax tables are not for', () => {
  const t = t2125Statement(ledger, '2023-01-01', '2023-12-31');
  const st = statement({ grossRevenue: 100_000_00, expenses: 10_000_00 });
  const sections = t1Figures(t, st, schedule8([], []), selfEmployedYear(st.netIncome, 2023), 2023);
  const check = sections.at(-1)!;

  it('still carries the business income, which no table touches', () => {
    expect(check.lines.map((l) => l.line)).toEqual(['13499', '13500']);
  });

  it('says why there is no tax figure to check against', () => {
    expect(check.note).toMatch(/does not hold 2023/);
  });
});
