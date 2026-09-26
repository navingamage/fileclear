import type { CompanyProfile, MonthDay } from './profile';
import { OBLIGATIONS, type Obligation, type Weight } from './obligations';
import { nextBusinessDay, reasonForShift, isBusinessDay } from './businessdays';

/**
 * Turns a company profile into dated filings.
 *
 * All arithmetic here is on calendar dates in UTC. A filing deadline is a day,
 * not an instant: 30 June is 30 June in Toronto and in Vancouver, and pulling a
 * local timezone into it only creates a class of off-by-one bug that appears
 * twice a year when the offset changes.
 */

export interface Filing {
  /** Stable across regeneration, so a completed filing stays completed. */
  id: string;
  obligationId: string;
  title: string;
  detail: string;
  authority: string;
  form: string;
  weight: Weight;
  penalty: string;
  linkLabel: string;
  linkUrl: string;
  /**
   * ISO yyyy-mm-dd. The statutory date, which is what the id is built from.
   *
   * Kept separate from the date a person actually has to act by, because the
   * id is stored: shifting it for a weekend would untick every filing anybody
   * had ticked off, once, on the day the weekend rule shipped.
   */
  due: string;
  /**
   * ISO yyyy-mm-dd. The day it is really due.
   *
   * CRA, Corporations Canada and the Ontario Business Registry all treat a
   * filing as on time if it arrives on the next business day when the
   * statutory date is a weekend or a holiday. This is that date, and it is
   * what every screen shows and what the reminder sweep counts from.
   */
  effectiveDue: string;
  /** Why the two differ, when they do: 'a Saturday', 'Canada Day'. */
  dueShiftReason?: string;
  /** ISO yyyy-mm-dd. When to start rather than when it is too late. */
  actionableFrom: string;
  /** The fiscal year this filing settles, labelled by the year the period ended. */
  periodLabel: string;
  /** ISO yyyy-mm-dd. The last day of the period reported on. */
  coversUpTo: string;
  /**
   * ISO yyyy-mm-dd. The first day of the period reported on, where the filing
   * is computed over one. Never earlier than the day the business began: a
   * first HST quarter that started before incorporation starts at
   * incorporation, because there is no ledger before it.
   */
  coversFrom?: string;
}

// ---------------------------------------------------------------- date helpers

/** Days in a month, handling February in a leap year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
  const clamped = Math.min(day, daysInMonth(year, month));
  const mm = String(month).padStart(2, '0');
  const dd = String(clamped).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Add months to a date, preserving month ends.
 *
 * Two rules, and the second one is the one that bites.
 *
 * A day that does not exist in the target month clamps back to the last day
 * that does: a 31 August year end plus six months is the last day of February,
 * because 31 February is not a date.
 *
 * A date that is already the last day of its month lands on the last day of the
 * target month, not on the same day number. This is how tax periods actually
 * work and it is not the same as clamping. A 30 June year end plus six months
 * is 31 December, not 30 December, and a quarter ending 30 September is filed
 * one month later on 31 October. Treating that as "the 30th of the later month"
 * moves real deadlines a day early, silently, only for corporations whose year
 * end falls in a 30 day month.
 */
export function addMonths(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const total = (y * 12 + (m - 1)) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const wasMonthEnd = d === daysInMonth(y, m);
  return iso(year, month, wasMonthEnd ? daysInMonth(year, month) : d);
}

export function addDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Move forward by a number of working days, which is not the same as adding
 * days and then skipping to the next open one. CRA's accelerated remittance
 * deadlines are stated in working days and three of them across a long weekend
 * is five or six calendar days.
 */
export function addBusinessDays(dateIso: string, days: number): string {
  let out = dateIso;
  let moved = 0;
  while (moved < days) {
    out = addDays(out, 1);
    if (isBusinessDay(out)) moved++;
  }
  return out;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/**
 * The fiscal year end falling in, or ending, the given calendar year.
 *
 * A 31 December year end in 2026 is 2026-12-31. A 30 June year end in 2026 is
 * 2026-06-30. The label is the calendar year the period closed in, which is how
 * an accountant refers to it.
 */
export function yearEndFor(fye: MonthDay, year: number): string {
  return iso(year, fye.month, fye.day);
}

// ------------------------------------------------------------------- resolution

/**
 * Which fiscal quarter ends fall in a year, given the year end.
 *
 * Quarters are counted back from the year end rather than from January, because
 * a corporation with a 30 June year end has quarters ending in September,
 * December, March and June.
 */
function quarterEnds(fye: MonthDay, yearEndIso: string): string[] {
  return [9, 6, 3, 0].map((back) => addMonths(yearEndIso, -back));
}

/**
 * One occurrence of an obligation.
 *
 * `coversUpTo` is the last day of the period the filing reports on, and it is
 * what decides whether the filing exists at all. A corporation cannot owe a
 * return for a period that ended before it was incorporated, and checking that
 * by year number is not enough: a 31 July year end and an 11 August
 * incorporation fall in the same calendar year, and a year-number check let
 * that corporation be told it owed a T2 for a year ending eleven days before
 * it existed.
 */
interface Occurrence {
  due: string;
  period: string;
  coversUpTo: string;
  /**
   * The first day of the period reported on, where there is a period.
   *
   * Needed to file anything that is computed over a period, which a due date
   * alone cannot say: the HST return for a quarter is the ledger from the day
   * after the previous quarter closed to the day this one did. Left undefined
   * for things that are events rather than periods, such as an annual return
   * to a registry or a one-off registration.
   */
  coversFrom?: string;
}

function occurrencesFor(
  ob: Obligation,
  p: CompanyProfile,
  fiscalYear: number,
): Occurrence[] {
  const yearEnd = yearEndFor(p.fiscalYearEnd, fiscalYear);

  switch (ob.schedule.kind) {
    case 'afterYearEnd':
      return [{
        due: addMonths(yearEnd, ob.schedule.months),
        period: `FY${fiscalYear}`,
        coversUpTo: yearEnd,
        coversFrom: addDays(addMonths(yearEnd, -12), 1),
      }];

    case 'afterIncorporationAnniversary': {
      const [iy, im, id] = p.incorporationDate.split('-').map(Number) as [number, number, number];

      /**
       * Nothing is due in the year of incorporation.
       *
       * Corporations Canada is explicit about this: "you do not file for the
       * year the corporation was incorporated", and "if you file the annual
       * return before the anniversary date, it will not be accepted". So the
       * first return follows the first anniversary, and a calendar that asked
       * for one earlier was asking for a filing the registry would refuse.
       */
      if (fiscalYear <= iy) return [];

      const anniversary = iso(fiscalYear, im, id);
      return [{
        due: addDays(anniversary, ob.schedule.days),
        period: `${fiscalYear}`,
        coversUpTo: anniversary,
      }];
    }

    case 'calendar':
      return [{
        due: iso(fiscalYear, ob.schedule.month, ob.schedule.day),
        period: `${fiscalYear - 1}`,
        // A slip reports the calendar year before the one it is filed in.
        coversUpTo: iso(fiscalYear - 1, 12, 31),
        coversFrom: iso(fiscalYear - 1, 1, 1),
      }];

    case 'lastDayOf':
      return [{
        due: iso(fiscalYear, ob.schedule.month, daysInMonth(fiscalYear, ob.schedule.month)),
        period: `${fiscalYear - 1}`,
        coversUpTo: iso(fiscalYear - 1, 12, 31),
        coversFrom: iso(fiscalYear - 1, 1, 1),
      }];

    case 'monthlyAfter':
      return Array.from({ length: 12 }, (_, i) => {
        const payMonth = i + 1;
        const dueMonth = payMonth === 12 ? 1 : payMonth + 1;
        const dueYear = payMonth === 12 ? fiscalYear + 1 : fiscalYear;
        return {
          due: iso(dueYear, dueMonth, ob.schedule.kind === 'monthlyAfter'
            ? ob.schedule.dayOfNextMonth : 15),
          period: `${fiscalYear}-${String(payMonth).padStart(2, '0')}`,
          coversUpTo: iso(fiscalYear, payMonth, daysInMonth(fiscalYear, payMonth)),
        };
      });

    case 'monthlyAfterMonthEnd':
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const monthEnd = iso(fiscalYear, month, daysInMonth(fiscalYear, month));
        return {
          due: addMonths(monthEnd, ob.schedule.kind === 'monthlyAfterMonthEnd'
            ? ob.schedule.months : 1),
          period: `${fiscalYear}-${String(month).padStart(2, '0')}`,
          coversUpTo: monthEnd,
          coversFrom: iso(fiscalYear, month, 1),
        };
      });

    case 'monthlyOnLastDay':
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const monthEnd = iso(fiscalYear, month, daysInMonth(fiscalYear, month));
        return { due: monthEnd, period: `${fiscalYear}-${String(month).padStart(2, '0')}`,
          coversUpTo: monthEnd };
      });

    /**
     * Calendar quarters, not fiscal ones.
     *
     * CRA's payroll accounts run on the calendar year, so a quarterly remitter
     * with a 30 June year end still remits for the quarters ending in March,
     * June, September and December. Using the fiscal quarters here put every
     * such corporation's four payroll dates in the wrong months.
     */
    case 'afterCalendarQuarter': {
      const day = ob.schedule.kind === 'afterCalendarQuarter'
        ? ob.schedule.dayOfNextMonth : 15;
      return [3, 6, 9, 12].map((m, i) => {
        const qEnd = iso(fiscalYear, m, daysInMonth(fiscalYear, m));
        const dueMonth = m === 12 ? 1 : m + 1;
        const dueYear = m === 12 ? fiscalYear + 1 : fiscalYear;
        return {
          due: iso(dueYear, dueMonth, day),
          period: `${fiscalYear} Q${i + 1}`,
          coversUpTo: qEnd,
        };
      });
    }

    /**
     * Accelerated threshold 1: twice a month.
     *
     * Pay made from the 1st to the 15th is remitted by the 25th of the same
     * month. Pay made from the 16th to the end is remitted by the 10th of the
     * next. Twenty four dates a year, which is why an employer moved into this
     * band by a growing payroll notices the change before the letter arrives.
     */
    case 'semiMonthly':
      return Array.from({ length: 12 }, (_, i) => i + 1).flatMap((month) => {
        const mid = iso(fiscalYear, month, 15);
        const end = iso(fiscalYear, month, daysInMonth(fiscalYear, month));
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? fiscalYear + 1 : fiscalYear;
        const mm = String(month).padStart(2, '0');
        return [
          { due: iso(fiscalYear, month, 25), period: `${fiscalYear}-${mm}a`, coversUpTo: mid },
          { due: iso(nextYear, nextMonth, 10), period: `${fiscalYear}-${mm}b`, coversUpTo: end },
        ];
      });

    /**
     * Accelerated threshold 2: four times a month, three working days after
     * each period closes.
     *
     * "Working days" is CRA's own wording and it means business days, so the
     * count skips weekends and holidays rather than adding three calendar
     * days. At this size a missed remittance is a percentage of a six figure
     * amount, so the arithmetic is worth doing properly.
     */
    case 'fourTimesMonthly':
      return Array.from({ length: 12 }, (_, i) => i + 1).flatMap((month) => {
        const last = daysInMonth(fiscalYear, month);
        const mm = String(month).padStart(2, '0');
        return [7, 14, 21, last].map((d, i) => {
          const close = iso(fiscalYear, month, d);
          return {
            due: addBusinessDays(close, 3),
            period: `${fiscalYear}-${mm}-${i + 1}`,
            coversUpTo: close,
          };
        });
      });

    case 'monthsAfterIncorporationAnniversary': {
      const [iy, im, id] = p.incorporationDate.split('-').map(Number) as [number, number, number];
      if (fiscalYear <= iy) return [];
      const anniversary = iso(fiscalYear, im, id);
      return [{
        due: addMonths(anniversary, ob.schedule.kind === 'monthsAfterIncorporationAnniversary'
          ? ob.schedule.months : 2),
        period: `${fiscalYear}`,
        coversUpTo: anniversary,
      }];
    }

    case 'endOfMonthAfterAnniversary': {
      const [iy, im, id] = p.incorporationDate.split('-').map(Number) as [number, number, number];
      if (fiscalYear <= iy) return [];
      const anniversary = iso(fiscalYear, im, id);
      const dueMonth = im === 12 ? 1 : im + 1;
      const dueYear = im === 12 ? fiscalYear + 1 : fiscalYear;
      return [{
        due: iso(dueYear, dueMonth, daysInMonth(dueYear, dueMonth)),
        period: `${fiscalYear}`,
        coversUpTo: anniversary,
      }];
    }

    /**
     * Fixed dates, whatever the business does. Personal instalments do not move
     * for a fiscal year end because an individual does not have one.
     */
    case 'personalInstalments':
      return [3, 6, 9, 12].map((m, i) => ({
        due: iso(fiscalYear, m, 15),
        period: `${fiscalYear} Q${i + 1}`,
        coversUpTo: iso(fiscalYear, m, 15),
      }));

    case 'everyNYearsFrom': {
      const from = ob.schedule.kind === 'everyNYearsFrom'
        ? ob.schedule.from(p) : p.incorporationDate;
      const years = ob.schedule.kind === 'everyNYearsFrom' ? ob.schedule.years : 5;
      if (!from) return [];
      const startYear = Number(from.slice(0, 4));
      // Only in the years the renewal actually falls due, so a five year cycle
      // produces one occurrence every fifth year rather than one a year.
      if ((fiscalYear - startYear) % years !== 0 || fiscalYear <= startYear) return [];
      return [{
        due: iso(fiscalYear, Number(from.slice(5, 7)), Number(from.slice(8, 10))),
        period: `${fiscalYear}`,
        coversUpTo: from,
      }];
    }

    case 'onceAfterIncorporation': {
      // One occurrence, in the year of incorporation, and never again. Every
      // other schedule here repeats; registering with a province does not.
      const iy = Number(p.incorporationDate.slice(0, 4));
      if (fiscalYear !== iy) return [];
      return [{
        due: addDays(p.incorporationDate, ob.schedule.days),
        period: 'once',
        // The period it covers is the incorporation itself, so it is never
        // filtered out as predating the corporation.
        coversUpTo: p.incorporationDate,
      }];
    }

    case 'quarterlyAfterQuarterEnd': {
      const months = ob.schedule.months;
      return quarterEnds(p.fiscalYearEnd, yearEnd).map((qEnd, i) => ({
        due: addMonths(qEnd, months),
        period: `FY${fiscalYear} Q${i + 1}`,
        coversUpTo: qEnd,
        coversFrom: addDays(addMonths(qEnd, -3), 1),
      }));
    }
  }
}

/**
 * Every filing this corporation owes for the given fiscal year.
 *
 * `fiscalYear` is the calendar year the fiscal year ends in, so a corporation
 * with a 30 June year end asking for 2026 gets the year that closed 30 June 2026
 * and the deadlines that follow it.
 */
export function filingsFor(
  p: CompanyProfile,
  fiscalYear: number,
  rules: Obligation[] = OBLIGATIONS,
): Filing[] {
  const incorporationYear = p.incorporationDate
    ? Number(p.incorporationDate.slice(0, 4))
    : fiscalYear;

  return rules
    // A sole proprietor should never be shown a T2, and a corporation should
    // never be shown a T2125. Filtering on the entity before the predicate
    // keeps each rule's `applies` about the thing it is actually testing.
    .filter((ob) => !ob.entities || ob.entities.includes(p.entityType))
    .filter((ob) => ob.applies(p))
    .flatMap((ob) => {
      // A corporation is not required to pay tax instalments in its first year.
      // The rule says so itself now: this was a comparison against one rule id,
      // and splitting instalments into monthly and quarterly walked past it.
      if (ob.notInFirstYear && fiscalYear === incorporationYear) return [];

      return occurrencesFor(ob, p, fiscalYear)
        // Nothing is owed for a period that closed before the corporation
        // existed. This replaces a comparison of year numbers, which could not
        // tell 2026-07-31 from 2026-08-11 and so produced a T2 for a year that
        // ended before incorporation.
        .filter((occ) => !p.incorporationDate || occ.coversUpTo >= p.incorporationDate)
        .map((occ) => ({
        id: `${ob.id}|${occ.period}|${occ.due}`,
        obligationId: ob.id,
        title: ob.title,
        detail: ob.detail,
        authority: ob.authority,
        form: ob.form,
        weight: ob.weight,
        penalty: ob.penalty,
        linkLabel: ob.link.label,
        linkUrl: ob.link.url,
        due: occ.due,
        effectiveDue: nextBusinessDay(occ.due),
        dueShiftReason: reasonForShift(occ.due),
        actionableFrom: addDays(occ.due, -ob.leadDays),
        periodLabel: occ.period,
        coversUpTo: occ.coversUpTo,
        coversFrom: occ.coversFrom && p.incorporationDate && occ.coversFrom < p.incorporationDate
          ? p.incorporationDate : occ.coversFrom,
      }));
    })
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.obligationId.localeCompare(b.obligationId)));
}

/**
 * Filings across a window of fiscal years, which is what a calendar view needs:
 * the year just ended is still generating deadlines while the current one runs.
 */
export function filingsBetween(
  p: CompanyProfile,
  fromIso: string,
  toIso: string,
  rules: Obligation[] = OBLIGATIONS,
): Filing[] {
  const fromYear = Number(fromIso.slice(0, 4)) - 1;
  const toYear = Number(toIso.slice(0, 4)) + 1;
  const out: Filing[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(...filingsFor(p, y, rules));
  return out
    .filter((f) => f.due >= fromIso && f.due <= toIso)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.obligationId.localeCompare(b.obligationId)));
}

/**
 * Things worth telling a director that are not deadlines: thresholds they are
 * approaching, and elections they may be leaving money on.
 */
export interface Advisory {
  id: string;
  severity: 'warn' | 'info';
  title: string;
  detail: string;
}

export function advisoriesFor(p: CompanyProfile): Advisory[] {
  const out: Advisory[] = [];

  if (p.hst.registered && p.hst.period === 'annual' && p.grossRevenue > 1_500_000) {
    out.push({
      id: 'hst-period-change',
      severity: 'warn',
      title: 'HST filing may be moving to quarterly',
      detail:
        'Annual filing is for taxable supplies up to $1.5 million. Above that CRA '
        + 'assigns quarterly periods, which changes four dates in your year.',
    });
  }

  if (p.grossRevenue > 1_000_000) {
    out.push({
      id: 't2-internet-filing',
      severity: 'info',
      title: 'The T2 must be filed electronically',
      detail:
        'Corporations over $1 million in gross revenue are required to file the T2 '
        + 'by internet. Paper filing is no longer an option at your size.',
    });
  }

  if (p.hst.registered && p.hst.method === 'regular' && p.grossRevenue > 0
      && p.grossRevenue <= 400_000) {
    out.push({
      id: 'quick-method-eligible',
      severity: 'info',
      title: 'You may be eligible for the Quick Method',
      detail:
        'Under $400,000 in taxable supplies you can elect to remit a flat rate of '
        + 'HST-included sales instead of tracking input tax credits. Whether it wins '
        + 'depends on how much HST you actually pay out.',
    });
  }

  if (p.payroll.hasAccount && p.payroll.ontarioRemuneration > 1_000_000) {
    out.push({
      id: 'eht-exemption-lost',
      severity: 'warn',
      title: 'Employer health tax exemption may no longer apply',
      detail:
        'The exemption for eligible private employers phases out on higher Ontario '
        + 'payroll. Above the threshold, EHT is payable on the full amount.',
    });
  }

  /**
   * The annual returns FileClear does not compute.
   *
   * Four jurisdictions are covered: federal, Ontario, British Columbia and
   * Alberta. A corporation incorporated anywhere else owes an annual return to
   * its own registry and would have seen nothing at all, which reads as nothing
   * owing. Saying "we do not compute this, and here is who does" is the only
   * honest option, because inventing a date for a registry we have not checked
   * is the failure this product exists to prevent.
   */
  const COMPUTED_REGISTRIES: string[] = ['CBCA', 'ON', 'BC', 'AB'];
  if (!COMPUTED_REGISTRIES.includes(p.jurisdiction)) {
    out.push({
      id: 'annual-return-not-computed',
      severity: 'warn',
      title: `FileClear does not compute the ${p.jurisdiction} annual return`,
      detail:
        'Your corporation owes an annual return to the registry it was incorporated '
        + 'with, and that date is not on this calendar. FileClear computes the federal, '
        + 'Ontario, British Columbia and Alberta returns. Everything else on your '
        + 'calendar is complete; this one has to be tracked with your registry until '
        + 'it is added here.',
    });
  }

  /**
   * WSIB arrives from a direction nobody is watching, the same way the Ontario
   * employer health tax does. It is not CRA, it is not on the T2, and the
   * registration clock starts from the first hire rather than from anything
   * FileClear knows, so this is a question rather than a date.
   */
  if (p.payroll.hasAccount && p.permanentEstablishments.includes('ON')) {
    out.push({
      id: 'wsib-registration',
      severity: 'info',
      title: 'WSIB registration may be required',
      detail:
        'Most Ontario employers have to register with the Workplace Safety and '
        + 'Insurance Board within ten days of hiring their first worker, and then '
        + 'report and pay premiums on their own schedule. A few industries are exempt '
        + 'and directors of a corporation are not automatically covered by their own '
        + 'account. FileClear cannot date this one, because the clock starts from a '
        + 'hire rather than from anything in your profile.',
    });
  }

  if (!p.hst.registered && p.grossRevenue > 30_000) {
    out.push({
      id: 'hst-registration-required',
      severity: 'warn',
      title: 'HST registration is likely required',
      detail:
        'The small supplier threshold is $30,000 in taxable supplies. Past it, '
        + 'registration is mandatory and the obligation starts before the paperwork does.',
    });
  }

  return out;
}

/**
 * What the calendar shows: everything coming up, and anything that fell due
 * while FileClear was watching and was never ticked off.
 *
 * The calendar used to ask the engine for filings from today onwards and
 * nothing earlier, so a filing that was missed disappeared from it the morning
 * after its deadline, and the overdue count could only ever read zero. For a
 * product whose purpose is deadlines that is the worst way to be wrong: the
 * one filing that most needs attention is the one that silently goes.
 *
 * `watchingSince` bounds the look back to the day the business was added.
 * Without it a company set up today with a 2019 incorporation would open on
 * years of payroll remittances and HST returns marked overdue, every one of
 * which was filed somewhere else before FileClear existed for it. Past filings
 * that were ticked off are left out: they are done, and the calendar is for
 * what is not.
 */
export function visibleFilings(
  p: CompanyProfile, today: string, watchingSince: string,
  done: (id: string) => boolean,
  rules: Obligation[] = OBLIGATIONS,
): Filing[] {
  const since = watchingSince > today ? today : watchingSince;
  return filingsBetween(p, since, addDays(today, 365), rules)
    .filter((f) => f.effectiveDue >= today || (f.effectiveDue >= since && !done(f.id)));
}
