import type { CompanyProfile, MonthDay } from './profile';
import { OBLIGATIONS, type Obligation, type Weight } from './obligations';

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
  /** ISO yyyy-mm-dd. */
  due: string;
  /** ISO yyyy-mm-dd. When to start rather than when it is too late. */
  actionableFrom: string;
  /** The fiscal year this filing settles, labelled by the year the period ended. */
  periodLabel: string;
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

function occurrencesFor(
  ob: Obligation,
  p: CompanyProfile,
  fiscalYear: number,
): { due: string; period: string }[] {
  const yearEnd = yearEndFor(p.fiscalYearEnd, fiscalYear);

  switch (ob.schedule.kind) {
    case 'afterYearEnd':
      return [{
        due: addMonths(yearEnd, ob.schedule.months),
        period: `FY${fiscalYear}`,
      }];

    case 'afterIncorporationAnniversary': {
      const [, im, id] = p.incorporationDate.split('-').map(Number) as [number, number, number];
      const anniversary = iso(fiscalYear, im, id);
      return [{
        due: addDays(anniversary, ob.schedule.days),
        period: `${fiscalYear}`,
      }];
    }

    case 'calendar':
      return [{
        due: iso(fiscalYear, ob.schedule.month, ob.schedule.day),
        period: `${fiscalYear - 1}`,
      }];

    case 'lastDayOf':
      return [{
        due: iso(fiscalYear, ob.schedule.month, daysInMonth(fiscalYear, ob.schedule.month)),
        period: `${fiscalYear - 1}`,
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
        };
      });

    case 'quarterlyAfterQuarterEnd': {
      const months = ob.schedule.months;
      return quarterEnds(p.fiscalYearEnd, yearEnd).map((qEnd, i) => ({
        due: addMonths(qEnd, months),
        period: `FY${fiscalYear} Q${i + 1}`,
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
    .filter((ob) => ob.applies(p))
    .flatMap((ob) => {
      // A corporation owes nothing for a year it did not exist in, and is not
      // required to pay tax instalments in its first tax year.
      if (fiscalYear < incorporationYear) return [];
      if (ob.id === 't2-instalments' && fiscalYear === incorporationYear) return [];

      return occurrencesFor(ob, p, fiscalYear).map((occ) => ({
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
        actionableFrom: addDays(occ.due, -ob.leadDays),
        periodLabel: occ.period,
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
