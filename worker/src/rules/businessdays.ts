/**
 * When a deadline lands on a day nobody is open.
 *
 * CRA's rule is short and load bearing: "when a due date falls on a Saturday, a
 * Sunday, or a public holiday recognised by the CRA, your payment is considered
 * on time if we receive it on the next business day." Corporations Canada and
 * the Ontario Business Registry work the same way, because none of them can
 * receive a filing on a day they are shut.
 *
 * FileClear computed the statutory date and stopped there, which is right about
 * the statute and wrong about the deadline. A T2 balance falling on Sunday
 * 30 June was being shown as due on the Sunday, so a director who paid on the
 * Monday believed they were a day late and a director who wanted the weekend
 * thought they could not have it. Both are avoidable.
 *
 * So the statutory date is kept and an effective date is computed beside it.
 * The statutory date is what identifies the filing, which matters because
 * filing ids are stored: moving them would untick everything anyone had ticked.
 *
 * Only the federal list plus Ontario's is here, because that is where the
 * product files. A holiday in a province FileClear does not yet compute for
 * would be a claim it cannot support.
 */

/**
 * Easter Sunday, by the anonymous Gregorian algorithm.
 *
 * Needed because Good Friday moves, and Good Friday is the only federal holiday
 * in the run up to the 30 April personal balance date.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shift(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return t.toISOString().slice(0, 10);
}

/** Day of week, 0 Sunday to 6 Saturday, in UTC because a date here is a day. */
export function dayOfWeek(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The nth given weekday of a month, e.g. the first Monday of September. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const offset = (weekday - dayOfWeek(first) + 7) % 7;
  return shift(first, offset + (n - 1) * 7);
}

/** The Monday on or before a date, which is how Victoria Day is defined. */
function mondayOnOrBefore(dateIso: string): string {
  const dow = dayOfWeek(dateIso);
  return shift(dateIso, dow === 0 ? -6 : 1 - dow);
}

/**
 * When a fixed date holiday falls at the weekend it is observed on the Monday,
 * which is what decides whether the office is open.
 */
function observed(dateIso: string): string {
  const dow = dayOfWeek(dateIso);
  if (dow === 6) return shift(dateIso, 2);
  if (dow === 0) return shift(dateIso, 1);
  return dateIso;
}

export interface Holiday { date: string; name: string }

/**
 * The days CRA and the Ontario ministries are closed, for one year.
 *
 * Boxing Day is included because CRA lists it, and 26 December matters more
 * than it looks: a 30 June year end produces a 31 December date every year, and
 * the week it falls in has three holidays in it.
 */
export function holidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const out: Holiday[] = [
    { date: observed(`${year}-01-01`), name: "New Year's Day" },
    { date: shift(easter, -2), name: 'Good Friday' },
    { date: shift(easter, 1), name: 'Easter Monday' },
    { date: mondayOnOrBefore(`${year}-05-24`), name: 'Victoria Day' },
    { date: observed(`${year}-07-01`), name: 'Canada Day' },
    { date: nthWeekday(year, 8, 1, 1), name: 'Civic Holiday' },
    { date: nthWeekday(year, 9, 1, 1), name: 'Labour Day' },
    { date: observed(`${year}-09-30`), name: 'National Day for Truth and Reconciliation' },
    { date: nthWeekday(year, 10, 1, 2), name: 'Thanksgiving' },
    { date: observed(`${year}-11-11`), name: 'Remembrance Day' },
    { date: observed(`${year}-12-25`), name: 'Christmas Day' },
    { date: observed(`${year}-12-26`), name: 'Boxing Day' },
  ];

  // Christmas on a Saturday puts Boxing Day on the Monday and Christmas on the
  // Monday too, which would be one office closure counted as two. Push the
  // second one on rather than letting them collide.
  const xmas = out.find((h) => h.name === 'Christmas Day')!;
  const boxing = out.find((h) => h.name === 'Boxing Day')!;
  if (boxing.date <= xmas.date) boxing.date = shift(xmas.date, 1);
  if (dayOfWeek(boxing.date) === 6) boxing.date = shift(boxing.date, 2);
  if (dayOfWeek(boxing.date) === 0) boxing.date = shift(boxing.date, 1);

  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

const cache = new Map<number, Set<string>>();

function holidaySet(year: number): Set<string> {
  let s = cache.get(year);
  if (!s) {
    s = new Set(holidays(year).map((h) => h.date));
    cache.set(year, s);
  }
  return s;
}

export function isBusinessDay(dateIso: string): boolean {
  const dow = dayOfWeek(dateIso);
  if (dow === 0 || dow === 6) return false;
  return !holidaySet(Number(dateIso.slice(0, 4))).has(dateIso);
}

/**
 * The day a filing due on `dateIso` is actually due.
 *
 * Forward, never backward. Somebody who reads an earlier date files early,
 * which costs nothing; somebody who reads a later date than the law allows
 * files late, which costs money. The asymmetry decides the direction.
 */
export function nextBusinessDay(dateIso: string): string {
  let d = dateIso;
  for (let i = 0; i < 10 && !isBusinessDay(d); i++) d = shift(d, 1);
  return d;
}

/** Why a date moved, for a user who wants to know rather than be told. */
export function reasonForShift(statutory: string): string | undefined {
  if (isBusinessDay(statutory)) return undefined;
  const dow = dayOfWeek(statutory);
  if (dow === 6) return 'a Saturday';
  if (dow === 0) return 'a Sunday';
  const named = holidays(Number(statutory.slice(0, 4))).find((h) => h.date === statutory);
  return named ? named.name : 'a holiday';
}
