import { ACCOUNT_BY_ID, ACCOUNTS } from './rules/gifi';

/**
 * The one place a language model is allowed to touch this product.
 *
 * FileClear's whole claim is that its numbers are right, and a model that is
 * confidently wrong about a tax rule is worse than no feature at all. So there
 * is a line, and it is drawn here rather than left to judgement at each call
 * site: a model may **classify, draft or explain**. It may never compute.
 *
 * Concretely that means it can look at "PAYMENT TO 1000234567 ON" and say it
 * smells like a subcontractor, because a person confirms that before it is
 * written. It can turn figures the engine has already worked out into a
 * paragraph. It cannot decide a rate, a deadline, an eligibility, or an amount,
 * and nothing it returns is ever stored as a number.
 *
 * Everything here fails soft. No key, a timeout, a refusal, a malformed answer:
 * all of them degrade to exactly what the product did before the model existed,
 * and none of them fail a request. A bookkeeping page that will not load
 * because an inference provider is having an afternoon is not a trade worth
 * making.
 */

export interface LlmEnv {
  OPENROUTER_API_KEY?: string;
  /** Overridable so a cheaper or better model can be swapped without a deploy. */
  FC_LLM_MODEL?: string;
  FC_PUBLIC_ORIGIN?: string;
}

/**
 * Cheap on purpose. The work is short prompts over small inputs, hundreds of
 * times a month, and paying frontier prices to guess that a coffee shop is a
 * meal would be an odd way to spend money.
 */
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

/** A Worker request should not hang because somebody else's API is slow. */
const TIMEOUT_MS = 12_000;

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface LlmResult { text: string | null; reason?: string; }

/**
 * One call, with everything that can go wrong turned into a null.
 *
 * The caller never sees an exception, because every caller's correct response
 * to a failure is the same: carry on without it.
 */
export async function ask(
  env: LlmEnv, system: string, user: string, maxTokens = 400,
): Promise<LlmResult> {
  if (!env.OPENROUTER_API_KEY) return { text: null, reason: 'no OPENROUTER_API_KEY' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // OpenRouter attributes usage by these, which is how spend stays
        // legible when several products share one key.
        'HTTP-Referer': env.FC_PUBLIC_ORIGIN ?? 'https://fileclear.ca',
        'X-Title': 'FileClear',
      },
      body: JSON.stringify({
        model: env.FC_LLM_MODEL ?? DEFAULT_MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!response.ok) {
      return { text: null, reason: `${response.status} ${(await response.text()).slice(0, 120)}` };
    }

    const body = await response.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text ? { text } : { text: null, reason: 'empty response' };
  } catch (e) {
    const reason = e instanceof Error && e.name === 'AbortError'
      ? `timed out after ${TIMEOUT_MS}ms`
      : e instanceof Error ? e.message : 'failed';
    return { text: null, reason };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------ classification

export interface Unknown { index: number; description: string; outflow: boolean; }
export interface Suggestion { index: number; accountId: string }

const CLASSIFY_SYSTEM =
  'You label Canadian business bank transactions with a bookkeeping account. '
  + 'Reply with one line per transaction in the form "index=account-id", nothing else. '
  + 'Use only account ids from the list you are given. If a transaction does not '
  + 'clearly belong to any of them, write "index=unknown" rather than guessing.';

/** The chart, as the model sees it. Built from the real one so it cannot drift. */
export function accountMenu(outflow: boolean): string {
  return ACCOUNTS
    .filter((a) => (outflow ? a.kind === 'expense' : a.kind === 'revenue')
      || a.id === 'equipment' || a.id === 'due-shareholder')
    .map((a) => `${a.id}: ${a.name}${a.hint ? ` (${a.hint})` : ''}`)
    .join('\n');
}

export function classifyPrompt(rows: Unknown[]): string {
  const outflow = rows.some((r) => r.outflow);
  return `Accounts available:\n${accountMenu(outflow)}\n\n`
    + `Transactions:\n${rows.map((r) =>
      `${r.index}: ${r.description} (money ${r.outflow ? 'out' : 'in'})`).join('\n')}`;
}

/**
 * Reads the reply back, keeping only what is real.
 *
 * Every id is checked against the chart of accounts, so a hallucinated account
 * is dropped rather than written. An index that was not asked about is dropped
 * too. The model is a source of suggestions, not a source of truth, and this
 * function is where that distinction is enforced.
 */
export function parseSuggestions(text: string, asked: Unknown[]): Suggestion[] {
  const valid = new Set(asked.map((r) => r.index));
  const out: Suggestion[] = [];
  const seen = new Set<number>();

  for (const line of text.split('\n')) {
    const m = line.match(/(\d+)\s*=\s*([a-z-]+)/i);
    if (!m) continue;
    const index = Number(m[1]);
    const accountId = m[2]!.toLowerCase();
    if (!valid.has(index) || seen.has(index)) continue;
    if (!ACCOUNT_BY_ID.has(accountId)) continue;
    seen.add(index);
    out.push({ index, accountId });
  }
  return out;
}

/**
 * Labels the rows nothing else could identify.
 *
 * Only rows that fell all the way through to the direction fallback are sent:
 * a remembered correction and a keyword match are both better evidence than a
 * model, and sending rows that are already answered would be paying for an
 * opinion nobody needs.
 *
 * One call for the whole statement rather than one per row, because the cost
 * and the latency are both per call.
 */
export async function suggestAccounts(
  env: LlmEnv, rows: Unknown[],
): Promise<{ suggestions: Suggestion[]; reason?: string }> {
  if (!rows.length) return { suggestions: [] };

  // A statement with hundreds of unidentifiable rows is a file that needs
  // looking at, not a bigger prompt.
  const batch = rows.slice(0, 60);
  const result = await ask(env, CLASSIFY_SYSTEM, classifyPrompt(batch), 800);
  if (!result.text) return { suggestions: [], ...(result.reason ? { reason: result.reason } : {}) };

  return { suggestions: parseSuggestions(result.text, batch) };
}

// ------------------------------------------------------------------ explain

const EXPLAIN_SYSTEM =
  'You explain a Canadian corporation\'s tax figures to its director, who is not '
  + 'an accountant. You are given figures that have already been calculated. '
  + 'Never calculate anything, never introduce a number that is not in the input, '
  + 'and never give tax advice or recommend a course of action. Write two or three '
  + 'short plain sentences. No headings, no lists, no greeting.';

/** Every dollar figure the caller supplied, so the answer can be checked. */
export function figuresIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\$?\s?([\d,]+(?:\.\d{1,2})?)/g)) {
    const n = m[1]!.replace(/,/g, '');
    if (n.length) out.add(n);
  }
  return out;
}

/**
 * Whether the explanation invented a figure.
 *
 * This is the guard that makes the feature safe to ship. The model is narrating
 * numbers it was handed, so every number in its answer must be one of them. If
 * it produces a figure that was not in the input it has done arithmetic, which
 * is the one thing it is not allowed to do, and the whole answer is discarded.
 *
 * Small integers are exempt: "two of your filings" and "the first 30,000" are
 * language rather than computation, and a year like 2026 is a label.
 */
export function inventsFigures(answer: string, input: string): string | null {
  const allowed = figuresIn(input);
  for (const m of answer.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)) {
    const raw = m[1]!.replace(/,/g, '');
    if (allowed.has(raw)) continue;
    // Tolerate a figure written without its cents, since that reads better.
    if (allowed.has(`${raw}.00`)) continue;
    if ([...allowed].some((a) => a.split('.')[0] === raw)) continue;
    return `$${m[1]}`;
  }
  return null;
}

export interface Explanation { text: string | null; reason?: string; }

/**
 * Turns figures the engine computed into a paragraph.
 *
 * `facts` is built by the caller from values it already holds. Nothing is
 * inferred here and nothing comes back as a number: the answer is prose that
 * sits beside the figures, and if it disagrees with them it is thrown away.
 */
export async function explain(
  env: LlmEnv, question: string, facts: string,
): Promise<Explanation> {
  const result = await ask(env, EXPLAIN_SYSTEM, `${question}\n\n${facts}`, 300);
  if (!result.text) return { text: null, ...(result.reason ? { reason: result.reason } : {}) };

  const invented = inventsFigures(result.text, facts);
  if (invented) {
    console.log(`explanation discarded: invented ${invented}, which was not in the figures`);
    return { text: null, reason: `invented the figure ${invented}` };
  }
  return { text: result.text };
}
