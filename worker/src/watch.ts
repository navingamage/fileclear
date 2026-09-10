import { WATCHED_SOURCES, upcomingChanges, staleness, type WatchedSource } from './rules/sources';
import { send, type MailEnv } from './email';

/**
 * Watching CRA and Corporations Canada for changes.
 *
 * Everything FileClear computes rests on figures published by somebody else,
 * and those figures move. The product cannot read legislation, but it can
 * notice that the page a number came from is no longer the page it came from,
 * which is enough to send a person to look.
 *
 * The comparison is a hash of the figures a page publishes, not of the page.
 * Government sites rewrite navigation, add banners, and stamp a "date modified"
 * at the foot of every page; hashing the response, or even the visible text,
 * would alert every week and be switched off within a month. Reducing a page to
 * the set of amounts and rates on it means the digest moves when a number moves
 * and stays put when the prose is edited.
 *
 * It is still a heuristic and it is treated as one. An alert says "this page
 * changed, here is what we believe and which file holds it", never "the rate is
 * now X". Deciding what actually changed is a person's job; the machine's job
 * is to make sure the question gets asked.
 */

export interface WatchEnv extends MailEnv {
  DB: D1Database;
  FC_WATCH_TO?: string;
}

export interface SourceResult {
  id: string;
  label: string;
  status: 'unchanged' | 'changed' | 'first-seen' | 'unreachable';
  detail?: string;
}

export interface WatchResult {
  checked: number;
  changed: SourceResult[];
  unreachable: SourceResult[];
  /** Announced changes now inside their lead time. */
  upcoming: ReturnType<typeof upcomingChanges>;
  stale: ReturnType<typeof staleness>;
  emailed: boolean;
}

/**
 * Visible text, near enough.
 *
 * Scripts and styles go first, because their contents are not text even though
 * they sit between tags. Then tags, then entities we care about, then runs of
 * whitespace. What is left changes when the page's words change and not when
 * its markup is reshuffled.
 */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The published figures on a page, and nothing else.
 *
 * The first version of this kept whole sentences containing a digit, which
 * seemed conservative and was useless: navigation links carry no full stop, so
 * an entire menu attached itself to the first sentence with a number in it and
 * every added link looked like a rate change.
 *
 * So take the figures themselves. A published rate or amount always has a
 * decimal point, a thousands comma, or a percent sign; menu items, headings and
 * prose have none of those. Sorting and deduplicating the result means a page
 * can be reordered or reworded freely and the digest only moves when a number
 * does.
 *
 * Bare integers are deliberately excluded. They would drag in the "date
 * modified" stamp at the foot of every canada.ca page, and a watch that fires
 * whenever a page is touched is a watch that gets switched off.
 */
const FIGURE = /\d[\d,]*\.\d+|\d[\d,]*,\d{3}|\d+(?:\.\d+)?\s*(?:%|per cent)/gi;

export function publishedFigures(html: string): string {
  const found = visibleText(html).match(FIGURE) ?? [];
  const normalised = found.map((f) => f.replace(/\s+/g, ' ').toLowerCase());
  return [...new Set(normalised)].sort().join('|');
}

/** FNV-1a, which is plenty for "did this differ from last time". */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function checkOne(
  db: D1Database, source: WatchedSource,
): Promise<SourceResult> {
  let html: string;
  try {
    const response = await fetch(source.url, {
      headers: { 'User-Agent': 'FileClear rate watch (https://fileclear.ca)' },
      cf: { cacheTtl: 0 },
    } as RequestInit);
    if (!response.ok) {
      return { id: source.id, label: source.label, status: 'unreachable',
        detail: `HTTP ${response.status}` };
    }
    html = await response.text();
  } catch (e) {
    return { id: source.id, label: source.label, status: 'unreachable',
      detail: e instanceof Error ? e.message : 'fetch failed' };
  }

  // A figures page with no figures on it is not an unchanged page, it is a page
  // that stopped looking the way it used to. An error page has no figures
  // either, and hashing that to the same empty digest every week would make the
  // watch look healthy while it watched nothing.
  const mode = source.mode ?? 'figures';
  const reduced = mode === 'text' ? visibleText(html) : publishedFigures(html);
  if (!reduced) {
    return { id: source.id, label: source.label, status: 'unreachable',
      detail: mode === 'figures'
        ? 'fetched, but no rates or amounts were found on it'
        : 'fetched, but it had no readable text' };
  }

  const digest = hash(reduced);

  const previous = await db.prepare(
    'SELECT digest FROM source_watch WHERE source_id = ?',
  ).bind(source.id).first<{ digest: string }>();

  await db.prepare(
    `INSERT INTO source_watch (source_id, digest, checked_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT (source_id) DO UPDATE SET digest = excluded.digest,
       checked_at = excluded.checked_at`,
  ).bind(source.id, digest).run();

  if (!previous) return { id: source.id, label: source.label, status: 'first-seen' };
  if (previous.digest === digest) {
    return { id: source.id, label: source.label, status: 'unchanged' };
  }
  return { id: source.id, label: source.label, status: 'changed' };
}

/**
 * A weekly sweep of the sources, plus the two checks that need no network.
 *
 * A page being unreachable is reported rather than swallowed. A watch that
 * silently stops working looks exactly like a watch that keeps finding nothing,
 * and the whole point of this is to not be quietly wrong.
 */
export async function watchSources(env: WatchEnv, today: string): Promise<WatchResult> {
  const results: SourceResult[] = [];
  for (const source of WATCHED_SOURCES) {
    results.push(await checkOne(env.DB, source));
  }

  const changed = results.filter((r) => r.status === 'changed');
  const unreachable = results.filter((r) => r.status === 'unreachable');
  const upcoming = upcomingChanges(today);
  const stale = staleness(today);

  const worthSending = changed.length > 0 || unreachable.length > 0
    || upcoming.length > 0 || stale.stale || stale.publishingSeason;

  let emailed = false;
  if (worthSending) {
    const to = env.FC_WATCH_TO;
    if (to) {
      const mail = watchMail({ changed, unreachable, upcoming, stale, checked: results.length });
      const outcome = await send(env, { to, ...mail });
      emailed = outcome.sent;
    }
  }

  return {
    checked: results.length, changed, unreachable, upcoming, stale, emailed,
  };
}

// ------------------------------------------------------------------ mail

const SOURCE_BY_ID = new Map(WATCHED_SOURCES.map((s) => [s.id, s]));

export function watchMail(r: Omit<WatchResult, 'emailed'>): {
  subject: string; text: string; html: string;
} {
  const parts: string[] = [];
  if (r.stale.stale) parts.push('rates are out of date');
  if (r.changed.length) parts.push(`${r.changed.length} source${r.changed.length === 1 ? '' : 's'} changed`);
  if (r.upcoming.length) parts.push(`${r.upcoming.length} change${r.upcoming.length === 1 ? '' : 's'} coming`);
  if (r.unreachable.length) parts.push(`${r.unreachable.length} unreachable`);
  if (!parts.length) parts.push('rate watch');

  const subject = `FileClear rate watch: ${parts.join(', ')}`;

  const lines: string[] = [];

  if (r.stale.message) lines.push(r.stale.message, '');

  if (r.upcoming.length) {
    lines.push('ANNOUNCED CHANGES', '');
    for (const c of r.upcoming) {
      lines.push(`  ${c.effective}  ${c.authority}`);
      lines.push(`     ${c.what}`);
      lines.push(`     Edit: ${c.where}`);
      lines.push(`     ${c.url}`, '');
    }
  }

  if (r.changed.length) {
    lines.push('PAGES THAT CHANGED SINCE THE LAST CHECK', '');
    lines.push('  A change here is a prompt to read, not a rate that moved. The');
    lines.push('  wording may simply have been edited.', '');
    for (const c of r.changed) {
      const s = SOURCE_BY_ID.get(c.id);
      lines.push(`  ${c.label}`);
      if (s) {
        lines.push(`     We hold: ${s.holds}`);
        lines.push(`     Edit: ${s.where}`);
        lines.push(`     ${s.url}`);
      }
      lines.push('');
    }
  }

  if (r.unreachable.length) {
    lines.push('COULD NOT BE CHECKED', '');
    lines.push('  Reported rather than ignored: a watch that has quietly stopped');
    lines.push('  working looks the same as one that keeps finding nothing.', '');
    for (const c of r.unreachable) {
      lines.push(`  ${c.label}: ${c.detail}`);
      const s = SOURCE_BY_ID.get(c.id);
      if (s) lines.push(`     ${s.url}`);
    }
    lines.push('');
  }

  lines.push(`${r.checked} sources checked.`);

  const text = lines.join('\n');
  const html = `<pre style="font:400 13px ui-monospace,Menlo,monospace;white-space:pre-wrap">${
    text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  }</pre>`;

  return { subject, text, html };
}
