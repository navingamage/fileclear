import {
  blankProfile, normalise, type CompanyProfile, type Jurisdiction,
} from './rules/profile';
import {
  filingsBetween, advisoriesFor, addDays, yearEndFor, visibleFilings, type Filing,
} from './rules/engine';
import {
  accountForRequest, createSession, endSession, hashPassword, verifyPassword,
  randomId, sessionCookie, clearedCookie, looksLikeEmail, passwordProblem,
  issueReset, consumeReset, pruneResets, RESET_TOKEN_MINUTES,
} from './auth';
import { hit, clear, prune, addressOf, waitMessage, LIMITS } from './ratelimit';
import {
  saveCompany, activeCompanyFor, companiesFor, setActiveCompany,
  loadCompany, filingStates, setFilingState,
  addTransaction, deleteTransaction, transactionsFor, toLedger,
  assetsFor, addAsset, deleteAsset, ccaClaims,
  employeesFor, addEmployee, deleteEmployee,
  subscriptionFor, recordSubscription, startTrial,
  importRules, rememberImportRule, ledgerFingerprints,
  homeOfficeFor, saveHomeOffice, recordFiled, filedRecords, companyAddedOn,
} from './db';
import { computeHst } from './rules/hst';
import { sweep, recordSweep, torontoNow, SEND_HOUR, type CronEnv } from './cron';
import { readReadiness } from './health';
import { watchSources } from './watch';
import { staleness } from './rules/sources';
import { suggestAccounts, explain } from './llm';
import {
  entitled, checkoutUrl, portalUrl, verifyWebhook, subscriptionFromEvent,
  fetchSubscription, type StripeEnv,
} from './stripe';
import { send, welcomeMail, resetMail } from './email';
import { ACCOUNT_BY_ID, HST_RATE } from './rules/gifi';
import { DEFAULT_COUNTER } from './rules/postings';
import {
  parseCsv, buildPreview, unidentified, applySuggestions, type ImportRow,
} from './rules/csv';
import {
  authPage, onboardingPage, dashboardPage, booksPage, hstPage, yearEndPage,
  compensationPage, slipsPage, billingPage, forgotPage, resetPage,
  importPage, importPreviewPage, onboardingStepPage, ONBOARDING_STEPS,
  shell, html,
  type HstPeriodOption, type Chrome,
  t2125Page, incorporatePage, filePage,
} from './views';
import {
  hstNetfileLines, hstBalance, guideFor, cleanConfirmation, type ReturnLine,
} from './rules/filing';
import { serveDownload, releaseInfo, type DownloadsEnv } from './downloads';
import { homeOffice, type HomeOfficeInput } from './rules/homeoffice';
import { statement, selfEmployedYear, t2125Statement } from './rules/selfemployed';
import { compareIncorporation, crossoverTable } from './rules/incorporate';
import { fiscalYears, statementsFor, shareholderLoans } from './rules/yearend';
import { schedule8, CLASS_BY_NUMBER } from './rules/cca';
import { schedule1, computeTax } from './rules/t2';
import { compareCompensation } from './rules/compensation';
import { t4For, t4ForSalary, t5For, slipDeadline, salaryInLedger } from './rules/slips';
import {
  deductionsFor, remitterAdvice, payrollRun, ontarioEht, type PayFrequency,
} from './rules/payroll';

export interface Env extends CronEnv, StripeEnv, DownloadsEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

/** How long a new account can look around before a card is needed. */
const TRIAL_DAYS = 30;

/**
 * The screens a subscription is actually required for.
 *
 * Deliberately not everything. The calendar and the reminders are what stop
 * somebody missing a deadline, and switching those off the day a trial ends
 * would make FileClear the cause of the penalty it exists to prevent. The
 * screens that compute money are the ones behind the paywall.
 *
 * /incorporate is on the list for consistency rather than enthusiasm. It is the
 * structural twin of /compensation, one decision higher up, and it computes a
 * tax figure the same way. Leaving one of a matched pair open and charging for
 * the other is the kind of arbitrary line that makes a paywall feel arbitrary.
 * The thirty day trial is what lets somebody weighing incorporation use it.
 */
const PAID_PATHS = ['/hst', '/year-end', '/compensation', '/slips', '/incorporate'];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const redirect = (to: string, extra: HeadersInit = {}) =>
  new Response(null, { status: 303, headers: { Location: to, ...extra } });

/** Today in Toronto, as a calendar date. Deadlines are days, not instants. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// -------------------------------------------------------------- form parsing

type FormValue = string | File | null;

const num = (v: FormValue, fallback = 0): number => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const on = (v: FormValue): boolean => v === 'on' || v === 'true';

/**
 * Cents as a figure the explanation guard can match against.
 *
 * Written the same way on both sides, so a model repeating a number it was
 * handed is recognised as repeating it rather than as inventing one.
 */
function factFigure(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-CA')}.${String(abs % 100).padStart(2, '0')}`;
}

/** Dollars typed by a person into cents, or null if it is not a number. */
function money(v: FormValue): number | null {
  const raw = String(v ?? '').replace(/[$,\s]/g, '');
  if (raw === '') return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

/**
 * The fiscal years available on the HST screen, newest first.
 *
 * Periods are the fiscal year rather than the calendar one, because that is
 * what an annual filer reports on and what the quarters are counted back from.
 */
function hstPeriods(fye: { month: number; day: number }, todayIso: string): HstPeriodOption[] {
  const year = Number(todayIso.slice(0, 4));
  const out: HstPeriodOption[] = [];
  for (let y = year; y >= year - 2; y--) {
    out.push({
      id: `fy${y}`,
      label: `FY${y}`,
      from: addDays(yearEndFor(fye, y - 1), 1),
      to: yearEndFor(fye, y),
    });
  }
  return out;
}

/**
 * Folds one step's answers into what is already known.
 *
 * Merging rather than rebuilding is the whole reason the set-up can be split
 * up. A step posts three fields; rebuilding from a blank profile would quietly
 * reset the other thirty, so the second screen would undo the first.
 */
function mergeStep(
  existing: CompanyProfile, step: number, form: FormData,
): { profile: CompanyProfile; error?: string } {
  const p: CompanyProfile = { ...existing };

  if (step === 1) {
    // Asked on its own, before anything else, because everything downstream
    // turns on it and because the wording of the next three steps does too.
    const kind = String(form.get('entityType') ?? 'corporation');
    p.entityType = kind === 'soleProprietorship' ? 'soleProprietorship' : 'corporation';
    p.legalName = String(form.get('legalName') ?? '').trim();
    if (!p.legalName) {
      return { profile: p, error: p.entityType === 'soleProprietorship'
        ? 'The business needs a name, even if it is your own.'
        : 'The corporation needs a legal name.' };
    }
  }

  if (step === 2) {
    p.jurisdiction = String(form.get('jurisdiction') ?? 'ON') as Jurisdiction;
    p.incorporationDate = String(form.get('incorporationDate') ?? '').trim();
    if (p.entityType === 'soleProprietorship') {
      p.registeredBusinessName = on(form.get('registeredBusinessName'));
      if (p.registeredBusinessName && !p.businessNameRegisteredOn) {
        p.businessNameRegisteredOn = p.incorporationDate;
      }
    } else {
      p.fiscalYearEnd = {
        month: Math.min(12, Math.max(1, num(form.get('fyeMonth'), 12))),
        day: Math.min(31, Math.max(1, num(form.get('fyeDay'), 31))),
      };
    }
    const dateLabel = p.entityType === 'soleProprietorship'
      ? 'Enter the date the business started.'
      : 'Enter the date of incorporation, as it appears on the certificate.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.incorporationDate)) {
      return { profile: p, error: dateLabel };
    }
    if (p.incorporationDate > today()) {
      return { profile: p, error: 'That date is in the future.' };
    }
    // Nothing has been asked yet about where it operates, so it starts where it
    // was incorporated and the last step offers the chance to widen it.
    if (!p.permanentEstablishments.length) {
      p.permanentEstablishments = [p.jurisdiction === 'CBCA' ? 'ON' : p.jurisdiction];
    }
  }

  if (step === 3) {
    p.hst = {
      ...p.hst,
      registered: on(form.get('hstRegistered')),
      period: String(form.get('hstPeriod') ?? 'annual') as CompanyProfile['hst']['period'],
      method: String(form.get('hstMethod') ?? 'regular') as CompanyProfile['hst']['method'],
    };
  }

  if (step === 4) {
    p.payroll = { ...p.payroll, hasAccount: on(form.get('payrollAccount')) };
    p.paysDividends = on(form.get('paysDividends'));
    const chosen = form.getAll('pe').map((v) => String(v) as Jurisdiction);
    p.permanentEstablishments = chosen.length
      ? chosen
      : [p.jurisdiction === 'CBCA' ? 'ON' : p.jurisdiction];
  }

  // A business without shares cannot be a CCPC or pay a dividend, and it does
  // not choose a fiscal year end. Applied on every step rather than only on the
  // one that asks, so a person who goes back and changes the answer at step one
  // does not keep an answer that no longer exists.
  return { profile: normalise(p) };
}

function profileFromForm(form: FormData): { profile: CompanyProfile; error?: string } {
  const p = blankProfile();
  const kind = String(form.get('entityType') ?? 'corporation');
  p.entityType = kind === 'soleProprietorship' ? 'soleProprietorship' : 'corporation';
  p.registeredBusinessName = on(form.get('registeredBusinessName'));
  const registeredOn = String(form.get('businessNameRegisteredOn') ?? '').trim();
  p.businessNameRegisteredOn = /^\d{4}-\d{2}-\d{2}$/.test(registeredOn)
    ? registeredOn : undefined;
  p.legalName = String(form.get('legalName') ?? '').trim();
  p.jurisdiction = String(form.get('jurisdiction') ?? 'ON') as Jurisdiction;
  p.incorporationDate = String(form.get('incorporationDate') ?? '').trim();
  p.fiscalYearEnd = {
    month: Math.min(12, Math.max(1, num(form.get('fyeMonth'), 12))),
    day: Math.min(31, Math.max(1, num(form.get('fyeDay'), 31))),
  };
  p.isCCPC = on(form.get('isCCPC'));
  p.claimsSmallBusinessDeduction = on(form.get('claimsSBD'));
  p.grossRevenue = num(form.get('grossRevenue'));
  p.lastYearTaxPayable = num(form.get('lastYearTaxPayable'));
  p.hst = {
    registered: on(form.get('hstRegistered')),
    period: String(form.get('hstPeriod') ?? 'annual') as CompanyProfile['hst']['period'],
    method: String(form.get('hstMethod') ?? 'regular') as CompanyProfile['hst']['method'],
    lastYearNetTax: num(form.get('hstNetTax')),
  };
  p.payroll = {
    hasAccount: on(form.get('payrollAccount')),
    remitter: String(form.get('payrollRemitter') ?? 'regular') as CompanyProfile['payroll']['remitter'],
    ontarioRemuneration: num(form.get('onRemuneration')),
  };
  p.paysDividends = on(form.get('paysDividends'));
  p.isConstruction = on(form.get('isConstruction'));
  // At least one, always. A corporation with no permanent establishment anywhere
  // is not a thing, and an empty list silently switches off provincial tax and
  // the employer health tax rather than raising an error. Falling back to where
  // it was incorporated is the answer that is right almost every time, and for a
  // federal corporation Ontario is the assumption the rest of this product makes.
  const chosen = form.getAll('pe').map((v) => String(v) as Jurisdiction);
  p.permanentEstablishments = chosen.length
    ? chosen
    : [p.jurisdiction === 'CBCA' ? 'ON' : p.jurisdiction];
  p.reminders = {
    email: on(form.get('remindEmail')),
    leadDays: Math.max(1, Math.min(90, num(form.get('remindLeadDays'), 14))),
  };

  const sole = p.entityType === 'soleProprietorship';
  if (!p.legalName) {
    return { profile: p, error: sole
      ? 'The business needs a name, even if it is your own.'
      : 'The corporation needs a legal name.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.incorporationDate)) {
    return { profile: p, error: sole
      ? 'Enter the date the business started.' : 'Enter the date of incorporation.' };
  }
  if (p.incorporationDate > today()) {
    return { profile: p, error: 'That date is in the future.' };
  }
  // A CCPC flag off with the deduction claimed is contradictory, and the
  // deduction is the half that decides the payment deadline, so it loses.
  if (!p.isCCPC) p.claimsSmallBusinessDeduction = false;
  // And normalise has the last word, because a sole proprietorship cannot be a
  // CCPC at all whatever the form said.
  return { profile: normalise(p) };
}

/**
 * A filing by its stable id, which carries its own statutory due date: the
 * obligation, the period and the date, joined by bars. Searching the day
 * either side of that date finds it without recomputing every year there is.
 */
function findFiling(p: CompanyProfile, id: string): Filing | undefined {
  const due = id.split('|')[2] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return undefined;
  return filingsBetween(p, addDays(due, -1), addDays(due, 1)).find((f) => f.id === id);
}

/** The GST/HST return for exactly the period a filing covers. */
async function hstLinesFor(
  env: Env, companyId: string, p: CompanyProfile, filing: Filing, instalments: number,
): Promise<ReturnLine[] | undefined> {
  if (!filing.coversFrom) return undefined;
  const rows = await transactionsFor(env.DB, companyId, filing.coversFrom, filing.coversUpTo);
  const r = computeHst(toLedger(rows), filing.coversFrom, filing.coversUpTo);
  return hstNetfileLines(r, p.hst.method, instalments);
}

// -------------------------------------------------------------------- routes

export default {
  /**
   * Cloudflare crons are UTC and Ontario changes offset twice a year, so both
   * candidate hours are scheduled and the wrong one returns immediately. That
   * is 12:00 UTC through the winter and 11:00 through the summer, with no
   * configuration change in March or November.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = torontoNow();
    if (now.hour !== SEND_HOUR) return;

    // Expired reset tokens and spent throttle counters, swept with the rest.
    // Neither is large, but a table that only ever grows is a slow leak.
    ctx.waitUntil(Promise.all([pruneResets(env.DB), prune(env)]).then(([, rows]) => {
      console.log(`housekeeping ${now.date}: ${rows} throttle rows cleared`);
    }));

    ctx.waitUntil(sweep(env, now.date).then(async (r) => {
      console.log(`sweep ${now.date}: ${r.emailed}/${r.companies} companies emailed, `
        + `${r.filings} filings` + (r.skipped.length ? `, skipped ${r.skipped.join('; ')}` : ''));
      // Recorded as well as logged, because the log is the thing nobody reads
      // and a failed send that only appears there is a failure nobody finds.
      // Reported rather than thrown: a run that sent the mail and could not
      // write down that it sent it is still a run that sent the mail.
      await recordSweep(env, now.date, r).catch((err: unknown) => {
        console.error(`sweep ${now.date}: could not record the run: ${err}`);
      });
    }));

    // The rate watch runs weekly rather than daily. Government pages do not
    // change often enough to be worth seven requests a week, and an alert that
    // arrives every morning is an alert nobody reads.
    if (new Date(`${now.date}T12:00:00Z`).getUTCDay() === 1) {
      ctx.waitUntil(watchSources(env, now.date).then((r) => {
        console.log(`rate watch ${now.date}: ${r.checked} checked, `
          + `${r.changed.length} changed, ${r.unreachable.length} unreachable, `
          + `${r.upcoming.length} announced, stale=${r.stale.stale}, emailed=${r.emailed}`);
      }));
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // www is redirected at the edge by a rule, so anything arriving here on it
    // is a misconfiguration rather than a request to serve.
    if (url.hostname.startsWith('www.')) {
      return Response.redirect(`https://fileclear.ca${url.pathname}${url.search}`, 301);
    }

    /**
     * The desktop builds and the feed the desktop app updates from.
     *
     * Before session handling, because electron-updater sends no cookie and
     * these are public files: the protection against a tampered build is the
     * code signature on it, not an access control on the bucket.
     */
    if (path.startsWith('/download/')) {
      return serveDownload(request, env, path.slice('/download/'.length));
    }
    /**
     * Whether the product is working, not whether the Worker is up.
     *
     * Plain text, one fact per line, and a 503 when something is wrong, so
     * the Antipode monitor can show the reason rather than a colour. It is
     * deliberately readable by a person with curl, because the first thing
     * anybody does with a red dot is go and look.
     *
     * Nothing is cached. A readiness answer served from a cache is a readiness
     * answer about the past.
     */
    if (path === '/readyz') {
      const state = await readReadiness(env.DB, Boolean(env.ZEPTOMAIL_TOKEN && env.FC_MAIL_FROM));
      return new Response(`${state.ok ? 'ok' : 'not ok'}\n${state.lines.join('\n')}\n`, {
        status: state.ok ? 200 : 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (path === '/api/release') return releaseInfo(env);

    // Stripe's webhook, before any session handling: it arrives with no cookie
    // and proves itself with a signature instead.
    if (path === '/stripe/webhook' && request.method === 'POST') {
      if (!env.STRIPE_WEBHOOK_SECRET) return new Response('not configured', { status: 503 });
      const payload = await request.text();
      const signature = request.headers.get('stripe-signature') ?? '';
      const check = await verifyWebhook(env.STRIPE_WEBHOOK_SECRET, payload, signature);
      if (!check.ok) {
        console.log(`stripe webhook rejected: ${check.reason}`);
        return new Response('bad signature', { status: 400 });
      }

      const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
      const parsed = subscriptionFromEvent(event);
      if (parsed) {
        // A checkout event says a subscription exists but not what it contains,
        // so the subscription is read back from Stripe, which is the authority.
        const full = parsed.currentPeriodEnd === 0 && parsed.subscriptionId
          ? (await fetchSubscription(env, parsed.subscriptionId)) ?? parsed
          : parsed;
        const recorded = await recordSubscription(env.DB,
          { ...full, accountId: full.accountId ?? parsed.accountId });
        console.log(`stripe ${event.type}: ${recorded ? 'recorded' : 'no matching account'}`);
      }
      // Always 200 once the signature is good. Stripe retries a non 200, and
      // retrying an event this product does not act on achieves nothing.
      return new Response('ok');
    }

    const account = await accountForRequest(env.DB, request);

    // ------------------------------------------------------------ public
    if (path === '/signup' || path === '/signin') {
      if (account) return redirect('/dashboard');
      if (request.method === 'GET') {
        return html(authPage(path === '/signup' ? 'up' : 'in', undefined, '',
          url.searchParams.get('out') === '1'));
      }

      const form = await request.formData();
      const email = String(form.get('email') ?? '').trim();
      const password = String(form.get('password') ?? '');
      const mode = path === '/signup' ? 'up' : 'in';

      if (!looksLikeEmail(email)) {
        return html(authPage(mode, 'That does not look like an email address.', email), 400);
      }

      // Counted before the password is checked, so the throttle costs an
      // attacker the attempt whether or not they guessed.
      const ip = addressOf(request);
      const byIp = await hit(env, `${mode}:ip:${ip}`,
        mode === 'up' ? LIMITS.signupByIp : LIMITS.signinByIp);
      const byAccount = mode === 'in'
        ? await hit(env, `in:acct:${email.toLowerCase()}`, LIMITS.signinByAccount)
        : { allowed: true, remaining: 99, retryAfter: 0 };

      if (!byIp.allowed || !byAccount.allowed) {
        const wait = Math.max(byIp.retryAfter, byAccount.retryAfter);
        return html(authPage(mode,
          `Too many attempts. ${waitMessage(wait)}`, email), 429,
        { 'Retry-After': String(wait) });
      }

      if (mode === 'up') {
        const problem = passwordProblem(password);
        if (problem) return html(authPage(mode, problem, email), 400);
        const existing = await env.DB.prepare(
          'SELECT id FROM accounts WHERE lower(email) = lower(?)').bind(email).first();
        if (existing) {
          return html(authPage(mode, 'An account already exists for that address.', email), 400);
        }
        const id = randomId(16);
        await env.DB.prepare('INSERT INTO accounts (id, email, password) VALUES (?, ?, ?)')
          .bind(id, email, await hashPassword(password)).run();

        // Confirms the address works, which is the only proof either side has
        // that reminders will arrive. Not awaited: a slow mail API must not sit
        // between somebody pressing the button and their account opening, and
        // an unsendable welcome is not a reason to fail a signup that already
        // succeeded. The outcome is logged either way.
        const origin = env.FC_PUBLIC_ORIGIN ?? url.origin;
        ctx.waitUntil(
          send(env, { to: email, ...welcomeMail(email, origin) })
            .then((r) => { if (!r.sent) console.log(`welcome mail to ${email}: ${r.reason}`); }));

        await startTrial(env.DB, id, TRIAL_DAYS, today());

        const session = await createSession(env.DB, id);
        return redirect('/onboarding?welcome=1', { 'Set-Cookie': sessionCookie(session) });
      }

      const row = await env.DB.prepare(
        'SELECT id, password FROM accounts WHERE lower(email) = lower(?)')
        .bind(email).first<{ id: string; password: string }>();
      // The same message either way, so this does not answer whether an address
      // has an account here.
      const bad = 'That email and password do not match an account.';
      if (!row || !(await verifyPassword(password, row.password))) {
        return html(authPage(mode, bad, email), 400);
      }
      await env.DB.prepare("UPDATE accounts SET last_seen_at = datetime('now') WHERE id = ?")
        .bind(row.id).run();
      // Somebody who fumbles their password nine times and then gets it right
      // should not be left one attempt from a lockout.
      await clear(env, `in:acct:${email.toLowerCase()}`);
      await clear(env, `in:ip:${ip}`);
      const session = await createSession(env.DB, row.id);
      return redirect('/dashboard', { 'Set-Cookie': sessionCookie(session) });
    }

    if (path === '/forgot') {
      if (account) return redirect('/dashboard');
      if (request.method === 'GET') return html(forgotPage());

      const form = await request.formData();
      const email = String(form.get('email') ?? '').trim();
      if (!looksLikeEmail(email)) {
        return html(forgotPage(false, email, 'That does not look like an email address.'), 400);
      }

      // Limited hardest of the three. Each request sends mail to an address
      // nobody has proved they own, so an open endpoint here is a way to use
      // this product to post somebody else's inbox.
      const ip = addressOf(request);
      const byIp = await hit(env, `reset:ip:${ip}`, LIMITS.resetByIp);
      const byAccount = await hit(env, `reset:acct:${email.toLowerCase()}`, LIMITS.resetByAccount);
      if (!byIp.allowed || !byAccount.allowed) {
        const wait = Math.max(byIp.retryAfter, byAccount.retryAfter);
        return html(forgotPage(false, email,
          `Too many requests. ${waitMessage(wait)}`), 429, { 'Retry-After': String(wait) });
      }

      const issued = await issueReset(env.DB, email);
      if (issued) {
        const origin = env.FC_PUBLIC_ORIGIN ?? url.origin;
        ctx.waitUntil(
          send(env, { to: email, ...resetMail(origin, issued.issue.token, RESET_TOKEN_MINUTES) })
            .then((r) => { if (!r.sent) console.log(`reset mail to ${email}: ${r.reason}`); }));
      }
      // The same page whether or not the address has an account. Answering
      // differently is a way to find out who banks here.
      return html(forgotPage(true, email));
    }

    if (path === '/reset') {
      if (request.method === 'GET') {
        return html(resetPage(url.searchParams.get('token') ?? ''));
      }
      const form = await request.formData();
      const token = String(form.get('token') ?? '');
      const password = String(form.get('password') ?? '');

      const problem = passwordProblem(password);
      if (problem) return html(resetPage(token, problem), 400);

      const outcome = await consumeReset(env.DB, token, password);
      if (!outcome.ok) return html(resetPage(token, undefined, true), 400);

      // Straight in, since they have just proved control of the address and
      // every other session was ended by the reset.
      const session = await createSession(env.DB, outcome.accountId);
      return redirect('/dashboard', { 'Set-Cookie': sessionCookie(session) });
    }

    // To the sign in page rather than the front page. The front page is a sales
    // pitch, and somebody who has just signed out has already bought; in the
    // desktop app it was worse, because it put the marketing site in an app
    // window. The notice says what happened, since a sign in form alone looks
    // like being thrown out rather than having left.
    if (path === '/signout') {
      await endSession(env.DB, request);
      return redirect('/signin?out=1', { 'Set-Cookie': clearedCookie() });
    }

    // ------------------------------------------------------- authenticated
    const needsAccount = ['/dashboard', '/onboarding', '/filing', '/books',
      '/books/delete', '/hst', '/year-end', '/assets', '/assets/delete',
      '/compensation', '/slips', '/employees', '/employees/delete',
      '/companies', '/billing', '/billing/checkout', '/billing/portal',
      '/incorporate', '/file', '/file/record'].includes(path);
    if (needsAccount && !account) return redirect('/signin');

    // Resolved once per request rather than per screen: which corporation is
    // being worked on, and what every page needs in its header. Seven routes
    // used to look this up independently.
    const company = account ? await activeCompanyFor(env.DB, account.id) : null;
    const chrome: Chrome = account
      ? {
        rates: staleness(today()),
        companies: await companiesFor(env.DB, account.id),
        activeCompanyId: company?.id,
        entityType: company?.profile.entityType,
      }
      : {};

    // Entitlement, checked once. The calendar and the reminders stay open past
    // the trial on purpose: switching off the thing that stops somebody missing
    // a deadline would make FileClear the cause of the penalty it exists to
    // prevent. The screens that compute money are what a subscription buys.
    const billing = account
      ? await subscriptionFor(env.DB, account.id)
      : { sub: null, customerId: null, trialEndsAt: null };
    const access = entitled(billing.sub, billing.trialEndsAt, new Date(), today());

    if (account && PAID_PATHS.includes(path) && !access.allowed) {
      return redirect('/billing');
    }

    if (path === '/billing' && account) {
      // A price identifier means nothing to the person paying it.
      const planLabel = !billing.sub?.plan ? '\u2014'
        : billing.sub.plan === env.FC_PRICE_YEARLY ? 'Yearly, $290 CAD'
        : billing.sub.plan === env.FC_PRICE_MONTHLY ? 'Monthly, $29 CAD'
        : 'Subscribed';
      return html(billingPage(
        account.email, access, billing.sub, !!billing.customerId, billing.trialEndsAt,
        2900, 29000, planLabel, url.searchParams.get('paid') === '1',
        url.searchParams.get('error') ?? undefined, chrome));
    }

    if (path === '/billing/checkout' && account && request.method === 'POST') {
      const form = await request.formData();
      const plan = String(form.get('plan')) === 'yearly' ? 'yearly' : 'monthly';
      const result = await checkoutUrl(
        env, account.id, account.email, plan, billing.customerId ?? undefined);
      if ('error' in result) {
        console.log(`checkout failed for ${account.id}: ${result.error}`);
        return redirect('/billing?error=Could+not+reach+Stripe.+Nothing+was+charged.');
      }
      return redirect(result.url);
    }

    if (path === '/billing/portal' && account && request.method === 'POST') {
      if (!billing.customerId) return redirect('/billing');
      const result = await portalUrl(env, billing.customerId);
      if ('error' in result) {
        console.log(`portal failed for ${account.id}: ${result.error}`);
        return redirect('/billing?error=Could+not+open+the+billing+portal.');
      }
      return redirect(result.url);
    }

    if (path === '/onboarding' && account) {
      const adding = url.searchParams.get('new') === '1';
      const existing = adding ? null : company;

      // The step parameter is what says a set-up is in progress, not whether a
      // corporation exists. It exists from step one onward, because each step
      // saves, so keying off it would drop somebody into the full edit form the
      // moment they answered the first four questions.
      const setup = url.searchParams.has('step') || !existing;
      const step = Math.min(ONBOARDING_STEPS.length,
        Math.max(1, Number(url.searchParams.get('step') ?? 1) || 1));
      const welcomed = url.searchParams.get('welcome') === '1';

      if (request.method === 'GET') {
        if (setup && !url.searchParams.has('step')) {
          const qs = new URLSearchParams({ step: '1' });
          if (adding) qs.set('new', '1');
          if (welcomed) qs.set('welcome', '1');
          return redirect(`/onboarding?${qs}`);
        }
        if (setup) {
          // Answers from earlier steps are already saved, so a half finished
          // set-up survives a closed tab.
          const partial = adding ? null : await activeCompanyFor(env.DB, account.id);
          return html(onboardingStepPage(account.email, step,
            partial?.profile ?? blankProfile(), undefined, welcomed, chrome));
        }
        return html(onboardingPage(account.email, existing.profile,
          undefined, welcomed, adding, chrome));
      }

      const form = await request.formData();

      if (setup) {
        const base = adding ? blankProfile()
          : (await activeCompanyFor(env.DB, account.id))?.profile ?? blankProfile();
        const { profile, error } = mergeStep(base, step, form);
        if (error) {
          return html(onboardingStepPage(account.email, step, profile, error,
            false, chrome), 400);
        }

        // Saved at every step, so the calendar exists from the first one and a
        // person who stops after it still has something.
        const current = adding ? null : await activeCompanyFor(env.DB, account.id);
        const id = current?.id ?? randomId(16);
        await saveCompany(env.DB, id, account.id, profile);
        if (!current) await setActiveCompany(env.DB, account.id, id);

        return step < ONBOARDING_STEPS.length
          ? redirect(`/onboarding?step=${step + 1}`)
          : redirect('/dashboard');
      }

      const { profile, error } = profileFromForm(form);
      if (error) {
        return html(onboardingPage(account.email, profile, error, false, adding, chrome), 400);
      }
      await saveCompany(env.DB, existing.id, account.id, profile);
      return redirect('/dashboard');
    }

    if (path === '/companies' && account) {
      if (request.method === 'POST') {
        const form = await request.formData();
        await setActiveCompany(env.DB, account.id, String(form.get('id') ?? ''));
        return redirect(String(form.get('back') ?? '/dashboard'));
      }
      return redirect('/dashboard');
    }

    if (path === '/dashboard' && account) {
      if (!company) return redirect('/onboarding');

      const from = today();
      const [states, txns, addedOn] = await Promise.all([
        filingStates(env.DB, company.id),
        transactionsFor(env.DB, company.id),
        companyAddedOn(env.DB, company.id),
      ]);
      const filings = visibleFilings(company.profile, from, addedOn || from,
        (id) => states.get(id) === 'done');

      // A shareholder loan is the one thing the ledger knows about that the
      // calendar cannot see, because its deadline comes from a balance rather
      // than from the company profile. It joins the advisories so it appears
      // where somebody is already looking.
      const loans = shareholderLoans(
        toLedger(txns), fiscalYears(company.profile, from), from);
      const advisories = [
        ...loans.map((l) => ({
          id: `shareholder-loan-${l.yearEnd}`,
          severity: 'warn' as const,
          title: l.overdue
            ? 'A shareholder loan passed its repayment deadline'
            : 'A shareholder loan has to be repaid',
          detail: l.message,
        })),
        ...advisoriesFor(company.profile),
      ];

      const filed = await filedRecords(env.DB, company.id);
      return html(dashboardPage(
        account.email, company.id, company.profile, filings, states,
        advisories, from, chrome, filed,
      ));
    }

    /**
     * Filing a return: the guide for one filing, and recording it as filed.
     *
     * Open after a trial ends, like the calendar it hangs off, because the
     * step that stops a penalty is not the place to put a paywall. The HST
     * figures inside it are the exception, since those are the HST screen's
     * figures and the HST screen is paid: without a subscription the guide
     * still walks through filing and points at where the figures are.
     */
    if (path === '/file' && account) {
      if (!company) return redirect('/onboarding');
      const filing = findFiling(company.profile, url.searchParams.get('filing') ?? '');
      if (!filing) return redirect('/dashboard');

      const kind = guideFor(filing.obligationId);
      const record = (await filedRecords(env.DB, company.id)).get(filing.id);
      const instalments = money(url.searchParams.get('instalments')) ?? 0;

      let lines: ReturnLine[] | undefined;
      let balance: number | undefined;
      if (kind === 'hst' && access.allowed) {
        if (record?.figures.length) {
          // What was filed stays what was filed, whatever the ledger does now.
          lines = record.figures as ReturnLine[];
        } else {
          lines = await hstLinesFor(env, company.id, company.profile, filing, instalments);
        }
        balance = lines ? hstBalance(lines) : undefined;
      }

      // When the money is due, which is not always when the return is. An
      // unincorporated annual HST filer files by 15 June and pays by 30 April,
      // the same split as the personal return, and a guide that said "pay by
      // 15 June" would walk somebody straight into six weeks of interest.
      const payBy = filing.obligationId === 'hst-annual-individual-return'
        ? filingsBetween(company.profile, addDays(filing.due, -60), filing.due)
          .find((f) => f.obligationId === 'hst-annual-individual-payment'
            && f.periodLabel === filing.periodLabel)?.effectiveDue ?? filing.effectiveDue
        : filing.effectiveDue;

      return html(filePage(account.email, company.profile.legalName, {
        kind: kind === 'hst' && !lines ? 'general' : kind,
        filing, lines, balance, instalments, payBy,
        method: company.profile.hst.method, record,
        sole: company.profile.entityType === 'soleProprietorship',
      }, today(), undefined, chrome));
    }

    if (path === '/file/record' && account && request.method === 'POST') {
      if (!company) return redirect('/onboarding');
      const form = await request.formData();
      const filing = findFiling(company.profile, String(form.get('filing') ?? ''));
      if (!filing) return redirect('/dashboard');

      const filedOn = String(form.get('filedOn') ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filedOn) || filedOn > today()) {
        return redirect(`/file?filing=${encodeURIComponent(filing.id)}`);
      }

      // The figures are recomputed here rather than taken from the form, so the
      // record is what FileClear computed and not whatever came back in a
      // hidden field.
      let figures: ReturnLine[] = [];
      if (guideFor(filing.obligationId) === 'hst' && access.allowed) {
        const instalments = money(form.get('instalments')) ?? 0;
        figures = (await hstLinesFor(env, company.id, company.profile, filing, instalments)) ?? [];
      }

      await recordFiled(env.DB, company.id, {
        filingId: filing.id,
        filedOn,
        confirmation: cleanConfirmation(String(form.get('confirmation') ?? '')),
        figures,
      });
      return redirect(`/file?filing=${encodeURIComponent(filing.id)}`);
    }

    if (path === '/filing' && account && request.method === 'POST') {
      const form = await request.formData();
      const companyId = String(form.get('company') ?? '');
      const filingId = String(form.get('filing') ?? '');
      const raw = String(form.get('state') ?? '');
      const state = raw === 'done' || raw === 'dismissed' ? raw : null;

      // Checked rather than trusted: the company id comes off a form.
      const owned = await loadCompany(env.DB, companyId, account.id);
      if (!owned || !filingId) return redirect('/dashboard');
      await setFilingState(env.DB, companyId, filingId, state);
      return redirect('/dashboard');
    }

    if ((path === '/books' || path === '/books/delete') && account) {
      if (!company) return redirect('/onboarding');

      if (path === '/books/delete' && request.method === 'POST') {
        const form = await request.formData();
        await deleteTransaction(env.DB, company.id, String(form.get('id') ?? ''));
        return redirect('/books');
      }

      if (request.method === 'POST') {
        const form = await request.formData();
        const date = String(form.get('date') ?? '').trim();
        const accountId = String(form.get('account') ?? '');
        const counterId = String(form.get('counter') ?? DEFAULT_COUNTER) || DEFAULT_COUNTER;
        const amount = money(form.get('amount'));
        const hst = money(form.get('hst'));

        let problem: string | null = null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problem = 'Enter a date.';
        else if (!ACCOUNT_BY_ID.has(accountId)) problem = 'Choose an account.';
        else if (!ACCOUNT_BY_ID.has(counterId)) problem = 'Choose where the money moved.';
        else if (accountId === counterId) problem = 'The two sides have to be different accounts.';
        else if (amount === null || amount === 0) problem = 'Enter an amount.';
        else if (hst === null) problem = 'The HST amount is not a number.';

        if (problem) {
          const txns = await transactionsFor(env.DB, company.id);
          return html(booksPage(account.email, company.id, company.profile.legalName,
            txns, today(), problem, chrome), 400);
        }
        await addTransaction(env.DB, randomId(16), company.id, {
          txn_date: date, account_id: accountId,
          amount_cents: amount!, hst_cents: hst ?? 0,
          counter_account_id: counterId,
          description: String(form.get('description') ?? '').slice(0, 200),
        });
        return redirect('/books');
      }

      const txns = await transactionsFor(env.DB, company.id);
      return html(booksPage(account.email, company.id, company.profile.legalName,
        txns, today(), undefined, chrome));
    }

    if (path.startsWith('/books/import') && account) {
      if (!company) return redirect('/onboarding');

      if (path === '/books/import' && request.method === 'GET') {
        return html(importPage(account.email, company.profile.legalName,
          undefined, chrome));
      }

      if (path === '/books/import' && request.method === 'POST') {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File) || file.size === 0) {
          return html(importPage(account.email, company.profile.legalName,
            'Choose a file to read.', chrome), 400);
        }
        // A statement is a few hundred rows. Anything much larger is not one,
        // and reading it into a Worker's memory is how the request dies.
        if (file.size > 2_000_000) {
          return html(importPage(account.email, company.profile.legalName,
            'That file is larger than 2 MB, which is bigger than any bank statement. '
            + 'Export a single account over a single period.', chrome), 400);
        }

        const order = String(form.get('order') ?? '');
        const [remembered, existing] = await Promise.all([
          importRules(env.DB, company.id),
          ledgerFingerprints(env.DB, company.id),
        ]);

        const preview = buildPreview(parseCsv(await file.text()), {
          remembered,
          existing,
          ...(order === 'dmy' || order === 'mdy' ? { dateOrder: order } : {}),
        });

        if ('error' in preview) {
          return html(importPage(account.email, company.profile.legalName,
            preview.error, chrome), 400);
        }
        if (!preview.rows.length) {
          return html(importPage(account.email, company.profile.legalName,
            'Nothing in that file could be read as a transaction.', chrome), 400);
        }

        // Only the rows nothing else could identify. A remembered correction
        // and a keyword both outrank a model, and asking about rows that are
        // already answered would be paying for an opinion nobody needs.
        const unknowns = unidentified(preview.rows);
        if (unknowns.length) {
          const { suggestions, reason } = await suggestAccounts(env, unknowns);
          if (reason) console.log(`import suggestions unavailable: ${reason}`);
          if (suggestions.length) {
            preview.rows = applySuggestions(preview.rows, suggestions);
          }
        }

        // The rows travel through the confirm step in the form rather than in a
        // session, so an abandoned import leaves nothing behind to clean up.
        const payload = JSON.stringify(preview.rows);
        return html(importPreviewPage(account.email, company.profile.legalName,
          preview, payload, chrome));
      }

      if (path === '/books/import/confirm' && request.method === 'POST') {
        const form = await request.formData();
        let rows: ImportRow[];
        try {
          rows = JSON.parse(String(form.get('payload') ?? '[]')) as ImportRow[];
        } catch {
          return redirect('/books/import');
        }

        const take = new Set(form.getAll('take').map((v) => Number(String(v))));
        const writes = [];
        let corrections = 0;

        for (let i = 0; i < rows.length; i++) {
          if (!take.has(i)) continue;
          const row = rows[i]!;
          const chosen = String(form.get(`account-${i}`) ?? row.accountId);
          if (!ACCOUNT_BY_ID.has(chosen)) continue;

          // Choosing a different account than the guess is the signal worth
          // keeping: it is a person saying what this supplier actually is.
          if (chosen !== row.accountId) {
            await rememberImportRule(env.DB, company.id, row.description, chosen);
            corrections++;
          }

          const account = ACCOUNT_BY_ID.get(chosen)!;
          // The HST split was computed for the guessed account. A different
          // account can have a different treatment, so it is recomputed rather
          // than carried over.
          const gross = Math.abs(row.signed);
          const carries = account.hst === 'standard';
          const amount = carries ? Math.round(gross / (1 + HST_RATE)) : gross;

          writes.push({
            txn_date: row.date,
            account_id: chosen,
            amount_cents: amount,
            hst_cents: carries ? gross - amount : 0,
            counter_account_id: DEFAULT_COUNTER,
            description: row.description.slice(0, 200),
          });
        }

        for (const w of writes) {
          await addTransaction(env.DB, randomId(16), company.id, w);
        }
        console.log(`import: ${writes.length} rows written, ${corrections} corrections learned`);
        return redirect('/books');
      }
    }

    if (path === '/hst' && account) {
      if (!company) return redirect('/onboarding');

      const options = hstPeriods(company.profile.fiscalYearEnd, today());
      const wanted = url.searchParams.get('period');
      const chosen = options.find((o) => o.id === wanted) ?? options[0]!;
      const rows = await transactionsFor(env.DB, company.id, chosen.from, chosen.to);
      const ret = computeHst(toLedger(rows), chosen.from, chosen.to);
      return html(hstPage(account.email, company.profile.legalName, ret, options,
        chosen.id, chrome));
    }

    if ((path === '/year-end' || path === '/assets' || path === '/assets/delete') && account) {
      if (!company) return redirect('/onboarding');

      // Read once. Three paths land here and a request body can only be
      // consumed once, so a second formData() on the same request returns
      // nothing and the failure looks like an empty form rather than a bug.
      const form = request.method === 'POST' ? await request.formData() : null;

      if (path === '/assets/delete' && form) {
        await deleteAsset(env.DB, company.id, String(form.get('id') ?? ''));
        return redirect('/year-end');
      }

      let problem: string | null = null;
      if (path === '/assets' && form) {
        const date = String(form.get('date') ?? '').trim();
        const classNumber = Number(form.get('class'));
        const cost = money(form.get('cost'));

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problem = 'Enter the date it became available for use.';
        else if (!CLASS_BY_NUMBER.has(classNumber)) problem = 'Choose a class.';
        else if (cost === null || cost <= 0) problem = 'Enter what it cost.';

        if (!problem) {
          await addAsset(env.DB, randomId(16), company.id, {
            classNumber, availableForUse: date, costCents: cost!,
            description: String(form.get('description') ?? '').slice(0, 120),
          });
          return redirect('/year-end');
        }
      }

      const years = fiscalYears(company.profile, today());
      if (!years.length) return redirect('/onboarding');
      const wanted = url.searchParams.get('year');
      // The year that just closed is the one somebody wants, so an open year is
      // only the default when it is the only one there is.
      const active = years.find((y) => y.id === wanted)
        ?? years.find((y) => y.ended) ?? years[0]!;

      // Everything up to and including the year being reported, oldest first.
      // Schedule 8 needs the whole chain, because this year's opening pool is
      // last year's closing pool all the way back to the first purchase.
      const chain = [...years].reverse().filter((y) => y.to <= active.to);

      const [rows, assets, claims] = await Promise.all([
        transactionsFor(env.DB, company.id),
        assetsFor(env.DB, company.id),
        ccaClaims(env.DB, company.id, active.to),
      ]);
      const ledger = toLedger(rows);

      const isCurrent = (id: string) => ACCOUNT_BY_ID.get(id)?.current !== false;
      const statements = statementsFor(ledger, active, isCurrent);
      const s8 = schedule8(assets, chain, claims);

      /**
       * An unincorporated business stops somewhere else entirely.
       *
       * The statements and the capital cost allowance above are the same
       * arithmetic, so they are shared. What cannot be shared is everything
       * after: there is no corporate tax, no Schedule 1 reconciliation and no
       * second taxpayer, and the only figure that answers "what do I owe" is a
       * personal one.
       */
      if (company.profile.entityType === 'soleProprietorship') {
        if (path === '/year-end' && form?.get('what') === 'home') {
          const area = (k: string) => Math.max(0, Number(form!.get(k)) || 0);
          const hours = String(form!.get('hoursPerWeek') ?? '').trim();
          const input: HomeOfficeInput = {
            homeArea: area('homeArea'),
            workArea: area('workArea'),
            // Empty means a room used only for the business, which is not
            // prorated by time at all. Zero would mean it is never used.
            hoursPerWeek: hours === '' ? undefined : Math.max(0, Math.min(168, Number(hours) || 0)),
            rent: money(form!.get('rent')) ?? 0,
            mortgageInterest: money(form!.get('mortgageInterest')) ?? 0,
            propertyTax: money(form!.get('propertyTax')) ?? 0,
            homeInsurance: money(form!.get('homeInsurance')) ?? 0,
            utilities: money(form!.get('utilities')) ?? 0,
            maintenance: money(form!.get('maintenance')) ?? 0,
          };
          if (input.homeArea <= 0 || input.workArea <= 0) {
            problem = 'Enter the area of the home and the area used for the business.';
          } else if (input.workArea > input.homeArea) {
            problem = 'The work space cannot be larger than the home.';
          } else {
            await saveHomeOffice(env.DB, company.id, active.to, input);
            return redirect(`/year-end?year=${encodeURIComponent(active.id)}`);
          }
        }

        const homeInput = await homeOfficeFor(env.DB, company.id, active.to);
        const home = homeInput ? homeOffice(homeInput) : null;

        // By T2125 line, not by GIFI code, and with meals at the allowable
        // half: see t2125Statement for why the GIFI statement was the wrong
        // source for an unincorporated return.
        const t2125 = t2125Statement(ledger, active.from, active.to);
        const st = statement({
          grossRevenue: t2125.grossRevenue,
          expenses: t2125.totalExpenses,
          cca: s8.totalCca,
          homeOfficeClaim: home?.claim ?? 0,
        });
        const year = selfEmployedYear(st.netIncome);

        const facts = [
          `Fiscal year: ${active.from} to ${active.to}.`,
          `Gross business income: ${factFigure(st.grossRevenue)}.`,
          `Total expenses: ${factFigure(st.expenses)}.`,
          `Business use of home claimed: ${factFigure(st.businessUseOfHome)}.`,
          `Net business income: ${factFigure(st.netIncome)}.`,
          `Taxable income: ${factFigure(year.tax.taxableIncome)}.`,
          `Income tax: ${factFigure(year.tax.total)}.`,
          `CPP on self-employment: ${factFigure(year.cpp.total)}.`,
          `Total due on 30 April: ${factFigure(year.totalDue)}.`,
        ].join(' ');

        const said = st.netIncome > 0
          ? await explain(env,
            'Explain in plain words what this sole proprietor owes for the year, and '
            + 'that CPP is a pension contribution rather than tax.', facts)
          : { text: null as string | null, reason: undefined as string | undefined };
        if (said.reason) console.log(`T2125 explanation unavailable: ${said.reason}`);

        return html(t2125Page(
          account.email, company.profile.legalName, years, active,
          t2125, s8, st, year, home, homeInput,
          problem ?? undefined, chrome, said.text ?? undefined,
        ), problem ? 400 : 200);
      }

      const s1 = schedule1(statements, ledger, active, s8);
      const tax = computeTax(company.profile, active, s1, ledger);

      // Prose beside the figures, never instead of them. Everything here was
      // computed before the model saw it, and llm.ts discards any answer
      // carrying a number that is not in this string.
      const facts = [
        `Fiscal year: ${active.from} to ${active.to}.`,
        `Net income per the books: ${factFigure(s1.netIncomePerBooks)}.`,
        `Net income for tax purposes: ${factFigure(s1.netIncomeForTax)}.`,
        `Taxable income: ${factFigure(tax.taxableIncome)}.`,
        `Income at the small business rate: ${factFigure(tax.sbdIncome)}.`,
        `Income at the general rate: ${factFigure(tax.generalIncome)}.`,
        `Federal tax: ${factFigure(tax.federalTax)}.`,
        `${tax.provinceName || 'Provincial'} tax: ${factFigure(tax.provincialTax)}.`,
        `Total tax payable: ${factFigure(tax.totalTax)}.`,
        `Capital cost allowance claimed: ${factFigure(s8.totalCca)}.`,
      ].join(' ');

      const plain = tax.taxableIncome > 0
        ? await explain(env,
          'Explain in plain words what this corporation owes for the year and where '
          + 'that figure came from.', facts)
        : { text: null as string | null, reason: undefined as string | undefined };
      if (plain.reason) console.log(`year end explanation unavailable: ${plain.reason}`);

      return html(yearEndPage(
        account.email, company.profile.legalName, years, active,
        statements, s8, s1, tax, assets, today(), problem ?? undefined,
        chrome, plain.text ?? undefined,
      ), problem ? 400 : 200);
    }

    /**
     * Whether to incorporate, which is the sole proprietor's version of the
     * salary and dividend question: the decision that sits one level above
     * everything else the product computes.
     *
     * Open to a corporation too, because somebody who already incorporated is
     * entitled to see whether it was worth it, and because an owner whose
     * income has fallen may be asking the question in the other direction.
     */
    if (path === '/incorporate' && account) {
      if (!company) return redirect('/onboarding');

      // Defaults to what the books actually show rather than to a round number,
      // the same way the compensation screen does.
      const years = fiscalYears(company.profile, today());
      const active = years.find((y) => y.ended) ?? years[0];
      let profit = 100_000_00;
      if (active) {
        const rows = await transactionsFor(env.DB, company.id, active.from, active.to);
        const statements = statementsFor(toLedger(rows), active,
          (id) => ACCOUNT_BY_ID.get(id)?.current !== false);
        if (statements.income.netBeforeTax > 0) profit = statements.income.netBeforeTax;
      }

      const askedProfit = money(url.searchParams.get('profit'));
      if (askedProfit !== null && askedProfit > 0) profit = askedProfit;
      profit = Math.min(profit, 100_000_000_00);

      // The draw is what actually decides the answer, so it is a control rather
      // than an assumption. Defaulting it to the whole profit would make
      // incorporating look pointless at every level, which is the case where it
      // genuinely is and not the case most people are in.
      const askedDraw = money(url.searchParams.get('draw'));
      const draw = askedDraw !== null && askedDraw >= 0
        ? Math.min(askedDraw, profit)
        : Math.min(profit, 80_000_00);

      const year = Number(today().slice(0, 4));
      const comparison = compareIncorporation(profit, draw, year);
      return html(incorporatePage(
        account.email, company.profile.legalName, comparison,
        crossoverTable(draw, year), chrome));
    }

    if (path === '/compensation' && account) {
      if (!company) return redirect('/onboarding');
      // A sole proprietor has no salary or dividend to choose between: there is
      // no second taxpayer to pay one. The question one level up is the one
      // they are actually asking.
      if (company.profile.entityType === 'soleProprietorship') return redirect('/incorporate');

      // Defaults to what the year actually produced, so the first view is about
      // this corporation rather than a round number.
      const years = fiscalYears(company.profile, today());
      const active = years.find((y) => y.ended) ?? years[0];
      let available = 100_000_00;
      if (active) {
        const rows = await transactionsFor(env.DB, company.id, active.from, active.to);
        const statements = statementsFor(toLedger(rows), active,
          (id) => ACCOUNT_BY_ID.get(id)?.current !== false);
        if (statements.income.netBeforeTax > 0) available = statements.income.netBeforeTax;
      }

      const asked = money(url.searchParams.get('amount'));
      if (asked !== null && asked > 0) available = asked;
      available = Math.min(available, 100_000_000_00);

      const kind = url.searchParams.get('kind') === 'eligible' ? 'eligible' : 'nonEligible';
      const comparison = compareCompensation(company.profile, available, kind);
      return html(compensationPage(
        account.email, company.profile.legalName, comparison, available, kind, chrome));
    }

    if ((path === '/slips' || path === '/employees' || path === '/employees/delete')
        && account) {
      if (!company) return redirect('/onboarding');

      if (path === '/employees/delete' && request.method === 'POST') {
        const form = await request.formData();
        await deleteEmployee(env.DB, company.id, String(form.get('id') ?? ''));
        return redirect('/slips');
      }

      let problem: string | null = null;
      if (path === '/employees' && request.method === 'POST') {
        const form = await request.formData();
        const name = String(form.get('name') ?? '').trim().slice(0, 80);
        const salary = money(form.get('salary'));
        const shares = Number(String(form.get('shares') ?? '0').replace(/[^0-9.]/g, ''));
        const frequency = String(form.get('frequency') ?? 'monthly');

        if (!name) problem = 'Enter a name.';
        else if (salary === null || salary <= 0) problem = 'Enter an annual salary.';
        else if (!Number.isFinite(shares) || shares < 0 || shares > 100) {
          problem = 'Voting shares have to be between 0 and 100 per cent.';
        } else if (!['monthly', 'semi-monthly', 'biweekly', 'weekly'].includes(frequency)) {
          problem = 'Choose how often they are paid.';
        }

        if (!problem) {
          await addEmployee(env.DB, randomId(16), company.id, {
            name, annualSalary: salary!, votingSharePct: shares,
            frequency: frequency as PayFrequency,
          });
          return redirect('/slips');
        }
      }

      // Calendar years, not fiscal ones. The slips do not follow the year end
      // and offering fiscal years here would invite exactly the mistake the
      // page warns about.
      const thisYear = Number(today().slice(0, 4));
      const since = Number(company.profile.incorporationDate.slice(0, 4)) || thisYear;
      const years: number[] = [];
      for (let y = thisYear; y >= since && years.length < 8; y--) years.push(y);

      const asked = Number(url.searchParams.get('year'));
      // Last year by default: the slips being worked on are for the year that
      // has finished, not the one in progress.
      const year = years.includes(asked) ? asked : (years[1] ?? years[0]!);

      const [rows, employees] = await Promise.all([
        transactionsFor(env.DB, company.id, `${year}-01-01`, `${year}-12-31`),
        employeesFor(env.DB, company.id),
      ]);
      const ledger = toLedger(rows);
      const t5 = t5For(ledger, year);
      const ledgerSalary = salaryInLedger(ledger, year);

      // With a register, one slip per person. Without one, the ledger's salary
      // account is the whole payroll, which is what a one person corporation
      // has and all it needs.
      const run = employees.length ? payrollRun(employees) : null;
      const t4s = run
        ? run.lines.map((l) =>
          t4ForSalary(l.annualSalary, year, l.insurable, l.employee.name))
        : [t4For(ledger, year)];

      const annualRemittance = run
        ? run.annualRemittance
        : (ledgerSalary > 0 ? deductionsFor(ledgerSalary).remittance * 12 : 0);
      const advice = annualRemittance > 0
        ? remitterAdvice(company.profile.payroll.remitter, annualRemittance)
        : null;

      const remuneration = run ? run.totalSalary : ledgerSalary;
      const eht = remuneration > 0
        && company.profile.permanentEstablishments.includes('ON')
        ? ontarioEht(remuneration) : null;

      return html(slipsPage(account.email, company.profile.legalName,
        years, year, t4s, t5, slipDeadline(year),
        run, advice, eht, employees, ledgerSalary, problem ?? undefined,
        chrome, company.profile.entityType), problem ? 400 : 200);
    }

    // A signed in visitor landing on the marketing page wants their calendar.
    /**
     * What the desktop app puts on its dock icon.
     *
     * Small and cheap on purpose: the app asks for it every half hour, and a
     * badge is worth having only if getting it costs less than opening the
     * screen would. It carries no filing detail, because a number on an icon
     * is a prompt to look rather than an answer.
     *
     * Unauthenticated gets a 401 rather than a zero. A signed out app showing
     * a clean badge would be reporting that nothing is due, which it cannot
     * know, and that is exactly the wrong thing for a deadline product to
     * imply.
     */
    if (path === '/api/summary') {
      if (!account || !company) {
        return json({ signedIn: false }, 401);
      }
      const from = today();
      const filings = filingsBetween(company.profile, from, addDays(from, 30));
      const states = await filingStates(env.DB, company.id);
      const open = filings.filter((f) => states.get(f.id) !== 'done');
      const overdue = open.filter((f) => f.effectiveDue < from);
      const next = open.find((f) => f.effectiveDue >= from);
      return json({
        signedIn: true,
        business: company.profile.legalName,
        overdue: overdue.length,
        dueWithin30Days: open.length - overdue.length,
        next: next ? { title: next.title, form: next.form, due: next.effectiveDue } : null,
      });
    }

    if (path === '/' && account) return redirect('/dashboard');

    // ------------------------------------------------------------- assets
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;

    return html(shell('Not found', `
      <div class="narrow">
        <span class="label">404</span>
        <h1>That page is not here.</h1>
        <p class="hint">It may have moved, or the link may be wrong.</p>
        <a class="btn primary" href="/">Back to the start</a>
      </div>`), 404);
  },
};
