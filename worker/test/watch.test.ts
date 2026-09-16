import { describe, expect, it } from 'vitest';
import { visibleText, publishedFigures, hash, watchMail } from '../src/watch';
import {
  staleness, upcomingChanges, SCHEDULED_CHANGES, WATCHED_SOURCES,
} from '../src/rules/sources';
import { RATE_YEAR } from '../src/rules/personal';

describe('reducing a page to what matters', () => {
  it('drops markup but keeps the words', () => {
    expect(visibleText('<p>The rate is <b>5.95%</b>.</p>'))
      .toBe('The rate is 5.95% .');
  });

  /**
   * Script and style contents sit between tags but are not text. Stripping tags
   * alone would leave minified JavaScript in the comparison, and that changes
   * on every deploy of the government's own site.
   */
  it('drops script and style contents entirely', () => {
    const html = '<style>.a{color:red}</style><script>var x=Date.now()</script><p>Rate 5.95%</p>';
    expect(visibleText(html)).toBe('Rate 5.95%');
  });

  it('drops comments, which is where build stamps hide', () => {
    expect(visibleText('<!-- built 2026-09-10 --><p>Rate 5.95%</p>')).toBe('Rate 5.95%');
  });

  it('collapses whitespace so reformatting is not a change', () => {
    const a = visibleText('<p>Rate\n\n   5.95%</p>');
    const b = visibleText('<p>Rate 5.95%</p>');
    expect(a).toBe(b);
  });

  it('keeps the figures and discards the prose around them', () => {
    const html = '<p>Navigation and breadcrumbs. The rate is 5.95 per cent. '
      + 'Contact us for help.</p>';
    const kept = publishedFigures(html);
    expect(kept).toMatch(/5\.95/);
    expect(kept).not.toMatch(/Contact us/);
    expect(kept).not.toMatch(/breadcrumbs/);
  });

  /**
   * Every canada.ca page carries a "date modified" stamp at the foot. Counting
   * bare integers as figures would fire the watch whenever a page was touched,
   * which is exactly the alarm nobody reads.
   */
  it('ignores a date modified stamp', () => {
    expect(publishedFigures('<p>Date modified: 2026-09-10</p>')).toBe('');
    expect(publishedFigures('<p>Rate 5.95%. Date modified: 2026-09-10</p>'))
      .toBe(publishedFigures('<p>Rate 5.95%. Date modified: 2027-02-28</p>'));
  });

  it('is unmoved by the order the figures appear in', () => {
    expect(publishedFigures('<p>4,230.45 then 5.95%</p>'))
      .toBe(publishedFigures('<p>5.95% then 4,230.45</p>'));
  });
});

describe('the digest', () => {
  it('is stable for the same text', () => {
    expect(hash('The rate is 5.95%')).toBe(hash('The rate is 5.95%'));
  });

  it('moves when a figure moves', () => {
    expect(hash('The rate is 5.95%')).not.toBe(hash('The rate is 6.05%'));
  });

  /**
   * The whole design rests on this: a page whose navigation was rewritten but
   * whose figures did not move has to produce the same digest, or the watch
   * cries wolf until it is switched off.
   */
  it('ignores a navigation rewrite that leaves the figures alone', () => {
    const before = '<nav><a>Home</a></nav><p>The rate is 5.95 per cent.</p>';
    const after = '<nav><a>Home</a><a>Français</a><a>Sign in</a></nav>'
      + '<p>The rate is 5.95 per cent.</p>';
    expect(hash(publishedFigures(before))).toBe(hash(publishedFigures(after)));
  });

  it('ignores a rewording that leaves the figures alone', () => {
    const before = '<p>The maximum contribution is 4,230.45 for the year.</p>';
    const after = '<p>For 2026 the maximum an employee contributes is 4,230.45.</p>';
    expect(hash(publishedFigures(before))).toBe(hash(publishedFigures(after)));
  });

  it('notices when a figure inside the prose moves', () => {
    const before = '<p>The maximum is 4,230.45 for the year.</p>';
    const after = '<p>The maximum is 4,412.90 for the year.</p>';
    expect(hash(publishedFigures(before))).not.toBe(hash(publishedFigures(after)));
  });

  it('notices a rate moving by a hundredth of a point', () => {
    expect(hash(publishedFigures('<p>5.95%</p>')))
      .not.toBe(hash(publishedFigures('<p>5.96%</p>')));
  });

  it('is always eight hex characters', () => {
    for (const s of ['', 'a', 'a much longer string with 123 numbers in it']) {
      expect(hash(s)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe('staleness, the check that cannot fail', () => {
  it('is quiet during the year the rates belong to', () => {
    const s = staleness(`${RATE_YEAR}-06-01`);
    expect(s.stale).toBe(false);
    expect(s.message).toBeUndefined();
  });

  it('speaks up the moment the year turns', () => {
    const s = staleness(`${RATE_YEAR + 1}-01-01`);
    expect(s.stale).toBe(true);
    expect(s.message).toMatch(new RegExp(`${RATE_YEAR} rates`));
    expect(s.message).toMatch(/estimate/);
  });

  /** CRA publishes the following year's figures in November. */
  it('warns in November that the next year figures are out', () => {
    const s = staleness(`${RATE_YEAR}-11-15`);
    expect(s.stale).toBe(false);
    expect(s.publishingSeason).toBe(true);
    expect(s.message).toMatch(/November/);
  });

  it('does not call it publishing season once it is already stale', () => {
    expect(staleness(`${RATE_YEAR + 1}-11-15`).publishingSeason).toBe(false);
  });
});

describe('announced changes', () => {
  /**
   * The point of `where` is that somebody reading the alert does not have to go
   * looking. It asserted a src/ path, which assumed every change is a code
   * edit; tightening DMARC is a DNS record, so the assertion has to be that it
   * names somewhere specific rather than that it names a file.
   */
  it('every entry names somewhere specific to change', () => {
    for (const c of SCHEDULED_CHANGES) {
      expect(c.where, c.effective).toMatch(/src\/|record|DNS/i);
      expect(c.where.length, c.effective).toBeGreaterThan(12);
      expect(c.url, c.effective).toMatch(/^https:\/\//);
      expect(c.leadDays, c.effective).toBeGreaterThan(0);
    }
  });

  it('points most of them at a file, since most are code', () => {
    const inCode = SCHEDULED_CHANGES.filter((c) => /src\//.test(c.where));
    expect(inCode.length).toBeGreaterThan(SCHEDULED_CHANGES.length / 2);
  });

  it('warns before the change rather than after', () => {
    // Ontario's dividend credit falls on 1 January 2027 with 120 days of lead.
    expect(upcomingChanges('2026-09-15').some((c) => c.what.includes('2.9863'))).toBe(true);
    expect(upcomingChanges('2026-06-01').some((c) => c.what.includes('2.9863'))).toBe(false);
  });

  it('keeps warning for a month afterwards', () => {
    // A change that landed while nobody was looking must not vanish silently.
    expect(upcomingChanges('2027-01-20').some((c) => c.effective === '2027-01-01')).toBe(true);
    expect(upcomingChanges('2027-03-01').some((c) => c.effective === '2027-01-01')).toBe(false);
  });

  it('lists them soonest first', () => {
    const dates = upcomingChanges('2027-08-01').map((c) => c.effective);
    expect([...dates].sort()).toEqual(dates);
  });

  it('knows the indexation that happens every January', () => {
    expect(SCHEDULED_CHANGES.some((c) => /indexed/i.test(c.what))).toBe(true);
  });
});

describe('the watched sources', () => {
  it('all point at a government domain', () => {
    for (const s of WATCHED_SOURCES) {
      expect(s.url).toMatch(/^https:\/\/(www\.canada\.ca|ised-isde\.canada\.ca|www\.ontario\.ca)\//);
    }
  });

  it('each says what we hold and where it lives', () => {
    for (const s of WATCHED_SOURCES) {
      expect(s.holds.length).toBeGreaterThan(10);
      expect(s.where).toMatch(/src\//);
    }
  });

  it('covers Corporations Canada as well as CRA', () => {
    const authorities = new Set(WATCHED_SOURCES.map((s) => s.authority));
    expect(authorities.has('CRA')).toBe(true);
    expect(authorities.has('Corporations Canada')).toBe(true);
  });

  it('has no duplicate ids', () => {
    const ids = WATCHED_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('a page that stops looking like itself', () => {
  /**
   * The empty digest is the trap. A page that yields no figures hashes to the
   * FNV offset basis, and so does an error page, so a broken watch would report
   * "unchanged" every week and look healthy while watching nothing.
   */
  it('produces the same empty reduction for no figures and for an error page', () => {
    expect(publishedFigures('<p>Nothing numeric here at all.</p>')).toBe('');
    expect(publishedFigures('<h1>Page not found</h1>')).toBe('');
  });

  it('marks the prose page as text mode rather than leaving it empty', () => {
    const prose = WATCHED_SOURCES.find((s) => s.id === 'corporations-canada-annual-return')!;
    expect(prose.mode).toBe('text');
    // It is the only one: everything else publishes figures.
    expect(WATCHED_SOURCES.filter((s) => s.mode === 'text')).toHaveLength(1);
  });
});

describe('the alert', () => {
  const changed = [{ id: 'cpp-rates', label: 'CPP contribution rates', status: 'changed' as const }];

  it('says what we hold and which file to edit, not what the new rate is', () => {
    const m = watchMail({
      checked: 7, changed, unreachable: [],
      upcoming: [], stale: staleness(`${RATE_YEAR}-06-01`),
    });
    expect(m.text).toMatch(/We hold: YMPE 74,600/);
    expect(m.text).toMatch(/src\/rules\/personal\.ts/);
    // It must not claim to know the new value, because it does not.
    expect(m.text).toMatch(/prompt to read, not a rate that moved/);
  });

  it('reports an unreachable page rather than swallowing it', () => {
    const m = watchMail({
      checked: 7, changed: [],
      unreachable: [{ id: 'aii', label: 'Accelerated investment incentive',
        status: 'unreachable', detail: 'HTTP 404' }],
      upcoming: [], stale: staleness(`${RATE_YEAR}-06-01`),
    });
    expect(m.subject).toMatch(/unreachable/);
    expect(m.text).toMatch(/HTTP 404/);
    expect(m.text).toMatch(/quietly stopped/);
  });

  it('leads the subject with staleness, which outranks everything else', () => {
    const m = watchMail({
      checked: 7, changed, unreachable: [],
      upcoming: [], stale: staleness(`${RATE_YEAR + 1}-03-01`),
    });
    expect(m.subject).toMatch(/^FileClear rate watch: rates are out of date/);
  });

  it('escapes the html copy', () => {
    const m = watchMail({
      checked: 1, changed: [], unreachable: [],
      upcoming: [{
        effective: '2027-01-01', authority: 'CRA', leadDays: 30,
        what: '<script>alert(1)</script>', where: 'src/x.ts', url: 'https://x.test',
      }],
      stale: staleness(`${RATE_YEAR}-06-01`),
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
});
