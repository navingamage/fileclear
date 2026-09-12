import { describe, expect, it } from 'vitest';
import {
  parseSuggestions, classifyPrompt, accountMenu, figuresIn, inventsFigures,
  ask, explain, suggestAccounts, type Unknown,
} from '../src/llm';

const asked: Unknown[] = [
  { index: 0, description: 'PAYMENT TO 100023 ON', outflow: true },
  { index: 2, description: 'SQ *GREEN ROOM', outflow: true },
];

describe('what the model is allowed to say', () => {
  it('keeps a line naming a real account', () => {
    expect(parseSuggestions('0=subcontract\n2=meals', asked))
      .toEqual([{ index: 0, accountId: 'subcontract' }, { index: 2, accountId: 'meals' }]);
  });

  /**
   * The guard that matters. A model will invent an account id that sounds
   * right, and an invented id written to a ledger is a row that rolls up into
   * the wrong GIFI code on a return.
   */
  it('drops an account that does not exist', () => {
    expect(parseSuggestions('0=entertainment-expenses\n2=meals', asked))
      .toEqual([{ index: 2, accountId: 'meals' }]);
  });

  it('drops a row it was not asked about', () => {
    expect(parseSuggestions('7=meals', asked)).toEqual([]);
  });

  it('keeps the first answer when it answers twice', () => {
    expect(parseSuggestions('0=meals\n0=travel', asked))
      .toEqual([{ index: 0, accountId: 'meals' }]);
  });

  it('ignores the chatter models wrap answers in', () => {
    const reply = 'Sure! Here are the labels:\n\n0=subcontract\n2=meals\n\nHope that helps.';
    expect(parseSuggestions(reply, asked)).toHaveLength(2);
  });

  it('returns nothing for an answer with no labels in it', () => {
    expect(parseSuggestions('I cannot determine these.', asked)).toEqual([]);
  });

  it('accepts the unknown the prompt asks for, by dropping it', () => {
    expect(parseSuggestions('0=unknown\n2=meals', asked))
      .toEqual([{ index: 2, accountId: 'meals' }]);
  });
});

describe('the prompt', () => {
  it('offers expenses for money going out', () => {
    const menu = accountMenu(true);
    expect(menu).toMatch(/^meals:/m);
    expect(menu).not.toMatch(/^sales:/m);
  });

  it('offers revenue for money coming in', () => {
    expect(accountMenu(false)).toMatch(/^sales:/m);
  });

  /** Built from the real chart, so a new account cannot be invisible to it. */
  it('carries the hints the chart already writes', () => {
    expect(accountMenu(true)).toMatch(/Only half is deductible/);
  });

  it('names every row it wants an answer for', () => {
    const p = classifyPrompt(asked);
    expect(p).toMatch(/0: PAYMENT TO 100023 ON/);
    expect(p).toMatch(/2: SQ \*GREEN ROOM/);
  });
});

describe('reading figures out of text', () => {
  it('finds them with or without a dollar sign and commas', () => {
    const f = figuresIn('tax $12,200.00 on income of 100000');
    expect(f.has('12200.00')).toBe(true);
    expect(f.has('100000')).toBe(true);
  });
});

describe('the guard against a model doing arithmetic', () => {
  const facts = 'Taxable income: $100,000.00. Total tax payable: $12,200.00.';

  it('accepts an answer that only repeats what it was given', () => {
    expect(inventsFigures(
      'Your corporation owes $12,200.00 on taxable income of $100,000.00.', facts))
      .toBeNull();
  });

  it('accepts a figure written without its cents', () => {
    expect(inventsFigures('You owe $12,200 this year.', facts)).toBeNull();
  });

  /**
   * The whole reason this exists. A model asked to explain a tax figure will
   * cheerfully work out the monthly equivalent, and a number it derived is a
   * number nothing verified.
   */
  it('rejects an answer that worked something out', () => {
    expect(inventsFigures('That is about $1,016.67 a month.', facts))
      .toBe('$1,016.67');
  });

  it('rejects a plausible but absent total', () => {
    expect(inventsFigures('Together that comes to $112,200.00.', facts))
      .toBe('$112,200.00');
  });

  it('ignores a bare number that is not money', () => {
    // "two or three sentences" and a year are language, not computation.
    expect(inventsFigures('In 2026 you owe $12,200.00.', facts)).toBeNull();
  });
});

describe('failing soft', () => {
  const noKey = { FC_PUBLIC_ORIGIN: 'https://fileclear.ca' };

  it('says why rather than throwing when there is no key', async () => {
    const r = await ask(noKey, 'sys', 'user');
    expect(r.text).toBeNull();
    expect(r.reason).toMatch(/OPENROUTER_API_KEY/);
  });

  it('suggests nothing rather than failing', async () => {
    const r = await suggestAccounts(noKey, asked);
    expect(r.suggestions).toEqual([]);
    expect(r.reason).toMatch(/OPENROUTER_API_KEY/);
  });

  it('explains nothing rather than failing', async () => {
    const r = await explain(noKey, 'why?', 'Total tax payable: $1.00.');
    expect(r.text).toBeNull();
  });

  it('does not call out at all when there is nothing to classify', async () => {
    expect(await suggestAccounts({ OPENROUTER_API_KEY: 'k' }, [])).toEqual({ suggestions: [] });
  });

  it('throws away an answer that invented a figure', async () => {
    const env = { OPENROUTER_API_KEY: 'k' };
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'That works out to $999.99 a month.' } }],
    }), { status: 200 })) as unknown as typeof fetch;
    try {
      const r = await explain(env, 'why?', 'Total tax payable: $12,200.00.');
      expect(r.text).toBeNull();
      expect(r.reason).toMatch(/invented/);
    } finally {
      globalThis.fetch = real;
    }
  });

  it('keeps an answer that stayed inside the figures', async () => {
    const env = { OPENROUTER_API_KEY: 'k' };
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'You owe $12,200.00 for the year.' } }],
    }), { status: 200 })) as unknown as typeof fetch;
    try {
      const r = await explain(env, 'why?', 'Total tax payable: $12,200.00.');
      expect(r.text).toBe('You owe $12,200.00 for the year.');
    } finally {
      globalThis.fetch = real;
    }
  });
});
