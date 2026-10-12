import type { Filing } from './rules/engine';

/**
 * The filing calendar as a calendar feed.
 *
 * The dashboard is the place to work through filings, and the reminder email is
 * the nudge. This is for the person whose week is run from Outlook or Google
 * Calendar: subscribe once and every filing sits on the day it is due, moving
 * when the profile or a rule changes, because the feed is computed fresh from
 * the profile on every fetch like everything else here.
 *
 * Filings ticked off are left out, so the calendar shows what is still owed.
 *
 * RFC 5545 asks three things that are easy to miss: text escapes commas,
 * semicolons and backslashes, lines fold at 75 octets, and lines end in CRLF.
 */

export function icsText(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets without splitting a character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const compact = (iso: string) => iso.replace(/-/g, '');

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function filingCalendar(filings: Filing[], o: {
  businessName: string; origin: string; leadDays: number; now?: Date;
}): string {
  const stamp = (o.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antipode Technologies//FileClear filings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`${o.businessName || 'Your business'}: filings`)}`,
    // A hint about how often to come back. Clients poll on their own clock
    // anyway; the dashboard is the place for the minute something changes.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];
  for (const f of filings) {
    const shifted = f.dueShiftReason
      ? `\n\nThe statutory date is ${f.due}, ${f.dueShiftReason}, so it is due the next business day.`
      : '';
    lines.push(
      'BEGIN:VEVENT',
      // The filing's own id, which is stable across regeneration, so a date
      // that moves updates the event rather than adding a second one.
      `UID:${icsText(f.id)}@fileclear.ca`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(f.effectiveDue)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(f.effectiveDue))}`,
      `SUMMARY:${icsText(`${f.title} (${f.form})`)}`,
      `DESCRIPTION:${icsText(`${f.authority}. ${f.penalty}${shifted}\n\nFile it: ${o.origin}/file?filing=${encodeURIComponent(f.id)}`)}`,
      `URL:${o.origin}/file?filing=${encodeURIComponent(f.id)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-P${Math.max(1, o.leadDays)}D`,
      `DESCRIPTION:${icsText(`${f.title} is due in ${o.leadDays} days`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
