import { describe, expect, it } from 'vitest';
import {
  parseCsv, detectColumns, detectDateOrder, toIsoDate, toCents,
  accountFor, descriptionKey, rowFingerprint, buildPreview,
} from '../src/rules/csv';

const opts = (over = {}) => ({ remembered: [], existing: new Set<string>(), ...over });

describe('splitting the file', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  /** Bank descriptions contain commas constantly. */
  it('keeps a quoted comma inside one field', () => {
    expect(parseCsv('date,desc\n2026-01-02,"SHOP, TORONTO ON"'))
      .toEqual([['date', 'desc'], ['2026-01-02', 'SHOP, TORONTO ON']]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });

  it('keeps a newline that sits inside quotes', () => {
    expect(parseCsv('a\n"one\ntwo"')).toEqual([['a'], ['one\ntwo']]);
  });

  it('survives carriage returns from a Windows export', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  /** Excel writes a byte order mark, which would otherwise break the first header. */
  it('drops a byte order mark', () => {
    expect(parseCsv('﻿Date,Amount\n2026-01-02,5')[0]![0]).toBe('Date');
  });

  it('drops blank rows rather than importing them', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('working out the columns', () => {
  it('reads a header with one signed amount', () => {
    const c = detectColumns(parseCsv('Date,Description,Amount\n2026-01-02,COFFEE,-5.00'));
    expect(c).toMatchObject({ date: 0, description: 1, amount: 2, hasHeader: true });
  });

  it('reads a header with separate debit and credit columns', () => {
    const c = detectColumns(parseCsv(
      'Date,Description,Withdrawals,Deposits\n2026-01-02,RENT,2000.00,'));
    expect(c).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
  });

  /** Some banks export no header at all, so the shape has to carry it. */
  it('reads a file with no header from the shape of the data', () => {
    const c = detectColumns(parseCsv(
      '2026-01-02,COFFEE SHOP TORONTO,-5.00\n2026-01-03,CLIENT PAYMENT,1000.00'));
    expect(c).toMatchObject({ date: 0, description: 1, amount: 2, hasHeader: false });
  });

  it('says what is missing rather than guessing', () => {
    expect(detectColumns([])).toEqual({ error: 'The file is empty.' });
    expect(detectColumns(parseCsv('Name,Note\nfoo,bar')))
      .toMatchObject({ error: expect.stringMatching(/date/i) });
  });
});

describe('which way round the dates are', () => {
  it('recognises an ISO date immediately', () => {
    expect(detectDateOrder(['2026-01-02'])).toBe('ymd');
  });

  /**
   * One row cannot settle 03/04/2026. The file usually can: a component over
   * twelve has to be a day.
   */
  it('settles day first when a first component exceeds twelve', () => {
    expect(detectDateOrder(['03/04/2026', '25/04/2026'])).toBe('dmy');
  });

  it('settles month first when a second component exceeds twelve', () => {
    expect(detectDateOrder(['04/03/2026', '04/25/2026'])).toBe('mdy');
  });

  /**
   * The case that matters. A silently transposed date moves a transaction into
   * the wrong HST period, so an unsettleable file is refused rather than read.
   */
  it('refuses to choose when nothing in the file settles it', () => {
    expect(detectDateOrder(['03/04/2026', '05/06/2026'])).toBe('ambiguous');
  });

  it('refuses when the file contradicts itself', () => {
    expect(detectDateOrder(['25/04/2026', '04/25/2026'])).toBe('ambiguous');
  });

  it('stops the whole import on an ambiguous file', () => {
    const r = buildPreview(
      parseCsv('Date,Description,Amount\n03/04/2026,A,-5\n05/06/2026,B,-6'), opts());
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toMatch(/either way round/);
  });

  it('accepts an order supplied to settle it', () => {
    const r = buildPreview(
      parseCsv('Date,Description,Amount\n03/04/2026,A,-5'),
      opts({ dateOrder: 'dmy' })) as { rows: { date: string }[] };
    expect(r.rows[0]!.date).toBe('2026-04-03');
  });
});

describe('reading a date', () => {
  it('handles every format a Canadian bank emits', () => {
    expect(toIsoDate('2026-01-02', 'ymd')).toBe('2026-01-02');
    expect(toIsoDate('2026/01/02', 'ymd')).toBe('2026-01-02');
    expect(toIsoDate('02/01/2026', 'dmy')).toBe('2026-01-02');
    expect(toIsoDate('01/02/2026', 'mdy')).toBe('2026-01-02');
    expect(toIsoDate('2 January 2026', 'ymd')).toBe('2026-01-02');
    expect(toIsoDate('2 Jan 2026', 'ymd')).toBe('2026-01-02');
  });

  it('expands a two digit year the way a statement means it', () => {
    expect(toIsoDate('02/01/26', 'dmy')).toBe('2026-01-02');
    expect(toIsoDate('02/01/99', 'dmy')).toBe('1999-01-02');
  });

  it('returns nothing for something that is not a date', () => {
    expect(toIsoDate('not a date', 'ymd')).toBeNull();
    expect(toIsoDate('13/13/2026', 'dmy')).toBeNull();
  });
});

describe('reading an amount', () => {
  it('handles the ways a bank writes money', () => {
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('1,234.56')).toBe(123456);
    expect(toCents('$1,234.56')).toBe(123456);
    expect(toCents('-1234.56')).toBe(-123456);
    expect(toCents('5')).toBe(500);
  });

  /** Brackets mean negative in some exports, which a minus sign check misses. */
  it('reads brackets as negative', () => {
    expect(toCents('(1,234.56)')).toBe(-123456);
  });

  it('treats an empty cell as zero, since a two column export leaves one blank', () => {
    expect(toCents('')).toBe(0);
    expect(toCents('   ')).toBe(0);
  });

  it('refuses something that is not a number', () => {
    expect(toCents('abc')).toBeNull();
  });
});

describe('choosing an account', () => {
  it('recognises a supplier by keyword', () => {
    expect(accountFor('CLOUDFLARE INC', -1000, []).accountId).toBe('software');
    expect(accountFor('TIM HORTONS #123', -500, []).accountId).toBe('meals');
    expect(accountFor('MONTHLY SERVICE CHARGE', -1600, []).accountId).toBe('bank-charges');
  });

  it('falls back on direction when nothing identifies it', () => {
    expect(accountFor('E-TRANSFER', 100000, []).accountId).toBe('sales');
    expect(accountFor('E-TRANSFER', -100000, []).accountId).toBe('office');
    expect(accountFor('E-TRANSFER', -100, []).reason).toBe('direction');
  });

  /**
   * A correction from last month is better evidence than a word list, which is
   * the whole reason the second import is quick.
   */
  it('prefers what was remembered over a keyword', () => {
    const remembered = [{ pattern: 'tim hortons', accountId: 'travel' }];
    const r = accountFor('TIM HORTONS #445', -500, remembered);
    expect(r.accountId).toBe('travel');
    expect(r.reason).toBe('remembered');
  });

  it('ignores a remembered account that has left the chart', () => {
    const r = accountFor('TIM HORTONS', -500, [{ pattern: 'tim hortons', accountId: 'gone' }]);
    expect(r.accountId).toBe('meals');
  });

  /** A card description carries a different reference every time. */
  it('matches on the stable part of a description', () => {
    expect(descriptionKey('CLOUDFLARE INC 8882 SAN FRANCISCO'))
      .toBe(descriptionKey('CLOUDFLARE INC 4471 SAN FRANCISCO'));
  });
});

describe('building the preview', () => {
  const file = 'Date,Description,Amount\n'
    + '2026-01-02,CLOUDFLARE INC 8882,-113.00\n'
    + '2026-01-05,CLIENT PAYMENT,1130.00\n'
    + '2026-01-06,MONTHLY SERVICE CHARGE,-16.00\n';

  it('reads the rows and totals both directions', () => {
    const p = buildPreview(parseCsv(file), opts()) as Exclude<ReturnType<typeof buildPreview>, { error: string }>;
    expect(p.rows).toHaveLength(3);
    expect(p.moneyIn).toBe(113000);
    expect(p.moneyOut).toBe(11300 + 1600);
  });

  /**
   * A bank row is the gross. The ledger holds the amount before tax and the tax
   * beside it, so HST comes out of the total rather than being added to it.
   */
  it('backs HST out of a standard rated row', () => {
    const p = buildPreview(parseCsv(file), opts()) as { rows: { accountId: string; amount: number; hst: number }[] };
    const cloudflare = p.rows[0]!;
    expect(cloudflare.accountId).toBe('software');
    expect(cloudflare.amount + cloudflare.hst).toBe(11300);
    expect(cloudflare.amount).toBe(10000);
    expect(cloudflare.hst).toBe(1300);
  });

  it('leaves an exempt account alone', () => {
    const p = buildPreview(parseCsv(file), opts()) as { rows: { accountId: string; hst: number }[] };
    const charge = p.rows[2]!;
    expect(charge.accountId).toBe('bank-charges');
    expect(charge.hst).toBe(0);
  });

  it('reports a bad row rather than dropping it quietly', () => {
    const p = buildPreview(
      parseCsv('Date,Description,Amount\n2026-01-02,GOOD,-5\nnope,BAD,-5\n'),
      opts()) as { rows: unknown[]; problems: { why: string; line: number }[] };
    expect(p.rows).toHaveLength(1);
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]!.why).toMatch(/date/i);
    expect(p.problems[0]!.line).toBe(3);
  });

  it('flags a row already in the ledger', () => {
    const existing = new Set([rowFingerprint('2026-01-05', 113000, 'CLIENT PAYMENT')]);
    const p = buildPreview(parseCsv(file), opts({ existing })) as { rows: { duplicate: boolean }[] };
    expect(p.rows.map((r) => r.duplicate)).toEqual([false, true, false]);
  });

  it('flags a row repeated inside the same file', () => {
    const twice = 'Date,Description,Amount\n2026-01-02,SAME,-5\n2026-01-02,SAME,-5\n';
    const p = buildPreview(parseCsv(twice), opts()) as { rows: { duplicate: boolean }[] };
    expect(p.rows.map((r) => r.duplicate)).toEqual([false, true]);
  });

  it('handles a two column export, where the column is the sign', () => {
    const p = buildPreview(
      parseCsv('Date,Description,Withdrawals,Deposits\n'
        + '2026-01-02,RENT,2260.00,\n2026-01-05,INVOICE,,1130.00\n'),
      opts()) as { rows: { signed: number; accountId: string }[] };
    expect(p.rows[0]!.signed).toBe(-226000);
    expect(p.rows[1]!.signed).toBe(113000);
    expect(p.rows[0]!.accountId).toBe('rent');
  });

  it('writes nothing, because a preview is for looking at', () => {
    const before = JSON.stringify(parseCsv(file));
    buildPreview(parseCsv(file), opts());
    expect(JSON.stringify(parseCsv(file))).toBe(before);
  });
});
