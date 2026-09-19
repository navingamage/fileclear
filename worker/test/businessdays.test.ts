import { describe, expect, it } from 'vitest';
import {
  easterSunday, holidays, isBusinessDay, nextBusinessDay, dayOfWeek, reasonForShift,
} from '../src/rules/businessdays';

/**
 * A deadline on a day the office is shut is not the deadline. Getting this
 * wrong in the safe direction costs a weekend; getting it wrong in the other
 * direction costs interest.
 */

describe('Easter', () => {
  // Checked against published dates rather than derived, because the algorithm
  // is the thing under test.
  it('lands where the calendar says', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2030)).toBe('2030-04-21');
  });

  it('puts Good Friday two days before it', () => {
    const gf = holidays(2026).find((h) => h.name === 'Good Friday')!;
    expect(gf.date).toBe('2026-04-03');
    expect(dayOfWeek(gf.date)).toBe(5);
  });
});

describe('the fixed and floating holidays', () => {
  it('finds Victoria Day on the Monday before 25 May', () => {
    expect(holidays(2026).find((h) => h.name === 'Victoria Day')!.date).toBe('2026-05-18');
    expect(holidays(2027).find((h) => h.name === 'Victoria Day')!.date).toBe('2027-05-24');
  });

  it('finds Labour Day on the first Monday of September', () => {
    expect(holidays(2026).find((h) => h.name === 'Labour Day')!.date).toBe('2026-09-07');
  });

  it('finds Thanksgiving on the second Monday of October', () => {
    expect(holidays(2026).find((h) => h.name === 'Thanksgiving')!.date).toBe('2026-10-12');
  });

  it('moves a weekend holiday to the Monday', () => {
    // 1 November 2026 is a Sunday, so Remembrance Day is a Wednesday and stays
    // put; Canada Day 2029 is a Sunday and is observed on the Monday.
    expect(holidays(2029).find((h) => h.name === 'Canada Day')!.date).toBe('2029-07-02');
  });

  /**
   * Christmas on a Saturday is the case that collapses two holidays into one
   * if it is not handled: both would land on the Monday.
   */
  it('keeps Christmas and Boxing Day on separate days', () => {
    for (const y of [2027, 2028, 2029, 2030, 2031, 2032]) {
      const h = holidays(y);
      const xmas = h.find((x) => x.name === 'Christmas Day')!.date;
      const boxing = h.find((x) => x.name === 'Boxing Day')!.date;
      expect(boxing > xmas).toBe(true);
      expect(isBusinessDay(boxing)).toBe(false);
    }
  });
});

describe('moving a deadline forward', () => {
  it('leaves an ordinary weekday alone', () => {
    expect(nextBusinessDay('2026-06-30')).toBe('2026-06-30'); // a Tuesday
  });

  it('moves a Saturday to the Monday', () => {
    // 31 October 2026 is a Saturday: a quarterly HST return for a 30 September
    // quarter end.
    expect(dayOfWeek('2026-10-31')).toBe(6);
    expect(nextBusinessDay('2026-10-31')).toBe('2026-11-02');
  });

  it('moves a Sunday to the Monday', () => {
    expect(dayOfWeek('2027-02-28')).toBe(0);
    expect(nextBusinessDay('2027-02-28')).toBe('2027-03-01');
  });

  /**
   * The case worth having a test for. A 30 June year end produces a
   * 31 December deadline every year, and the last week of December is the most
   * heavily closed week in the calendar.
   */
  it('steps over Christmas and the New Year together', () => {
    // 31 December 2027 is a Friday and a business day.
    expect(nextBusinessDay('2027-12-31')).toBe('2027-12-31');
    // 25 December 2026 is a Friday, so Boxing Day is observed on the Monday
    // the 28th, and a deadline on the 26th lands on the 29th.
    expect(nextBusinessDay('2026-12-26')).toBe('2026-12-29');
  });

  it('never moves a date backwards', () => {
    for (let y = 2025; y <= 2035; y++) {
      for (const d of ['01-01', '04-30', '06-15', '12-25', '12-31']) {
        const date = `${y}-${d}`;
        expect(nextBusinessDay(date) >= date).toBe(true);
      }
    }
  });

  it('always finds a business day within a week', () => {
    for (let y = 2025; y <= 2035; y++) {
      for (const h of holidays(y)) expect(isBusinessDay(nextBusinessDay(h.date))).toBe(true);
    }
  });
});

describe('saying why', () => {
  it('names the weekend or the holiday', () => {
    expect(reasonForShift('2026-06-30')).toBeUndefined();
    expect(reasonForShift('2026-10-31')).toBe('a Saturday');
    expect(reasonForShift('2027-02-28')).toBe('a Sunday');
    expect(reasonForShift('2026-07-01')).toBe('Canada Day');
  });
});
