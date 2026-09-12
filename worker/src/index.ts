import { blankProfile, type CompanyProfile, type Jurisdiction } from './rules/profile';
import { filingsBetween, advisoriesFor, addDays, yearEndFor } from './rules/engine';
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
} from './db';
import { computeHst } from './rules/hst';
import { sweep, torontoNow, SEND_HOUR, type CronEnv } from './cron';
import { watchSources } from './watch';
import { staleness } from './rules/sources';
import {
  entitled, checkoutUrl, portalUrl, verifyWebhook, subscriptionFromEvent,
  fetchSubscription, type StripeEnv,
} from './stripe';
import { send, welcomeMail, resetMail } from './email';
import { ACCOUNT_BY_ID, HST_RATE } from './rules/gifi';
import { DEFAULT_COUNTER } from './rules/postings';
import { parseCsv, buildPreview, type ImportRow } from './rules/csv';
import {
  authPage, onboardingPage, dashboardPage, booksPage, hstPage, yearEndPage,
  compensationPage, slipsPage, billingPage, forgotPage, resetPage,
  importPage, importPreviewPage, shell, html,
  type HstPeriodOption, type Chrome,
} from './views';
import { fiscalYears, statementsFor, shareholderLoans } from './rules/yearend';
import { schedule8, CLASS_BY_NUMBER } from './rules/cca';
import { schedule1, computeTax } from './rules/t2';
import { compareCompensation } from './rules/compensation';
import { t4For, t4ForSalary, t5For, slipDeadline, salaryInLedger } from './rules/slips';
import {
  deductionsFor, remitterAdvice, payrollRun, ontarioEht, type PayFrequency,
} from './rules/payroll';

export interface Env extends CronEnv, StripeEnv {
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
 */
const PAID_PATHS = ['/hst', '/year-end', '/compensation', '/slips'];

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

function profileFromForm(form: FormData): { profile: CompanyProfile; error?: string } {
  const p = blankProfile();
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

  if (!p.legalName) return { profile: p, error: 'The corporation needs a legal name.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.incorporationDate)) {
    return { profile: p, error: 'Enter the date of incorporation.' };
  }
  if (p.incorporationDate > today()) {
    return { profile: p, error: 'The date of incorporation is in the future.' };
  }
  // A CCPC flag off with the deduction claimed is contradictory, and the
  // deduction is the half that decides the payment deadline, so it loses.
  if (!p.isCCPC) p.claimsSmallBusinessDeduction = false;
  return { profile: p };
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

    ctx.waitUntil(sweep(env, now.date).then((r) => {
      console.log(`sweep ${now.date}: ${r.emailed}/${r.companies} companies emailed, `
        + `${r.filings} filings` + (r.skipped.length ? `, skipped ${r.skipped.join('; ')}` : ''));
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
      if (request.method === 'GET') return html(authPage(path === '/signup' ? 'up' : 'in'));

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

    if (path === '/signout') {
      await endSession(env.DB, request);
      return redirect('/', { 'Set-Cookie': clearedCookie() });
    }

    // ------------------------------------------------------- authenticated
    const needsAccount = ['/dashboard', '/onboarding', '/filing', '/books',
      '/books/delete', '/hst', '/year-end', '/assets', '/assets/delete',
      '/compensation', '/slips', '/employees', '/employees/delete',
      '/companies', '/billing', '/billing/checkout', '/billing/portal'].includes(path);
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
      // ?new=1 adds a corporation rather than editing the current one. A second
      // company is a thing that happens to people, and it should not mean a
      // second account.
      const adding = url.searchParams.get('new') === '1';
      const existing = adding ? null : company;

      if (request.method === 'GET') {
        return html(onboardingPage(account.email, existing?.profile ?? blankProfile(),
          undefined, url.searchParams.get('welcome') === '1', adding, chrome));
      }
      const { profile, error } = profileFromForm(await request.formData());
      if (error) {
        return html(onboardingPage(account.email, profile, error, false, adding, chrome), 400);
      }

      const id = existing?.id ?? randomId(16);
      await saveCompany(env.DB, id, account.id, profile);
      // A newly added corporation becomes the one being looked at, since that
      // is why it was just typed in.
      if (!existing) await setActiveCompany(env.DB, account.id, id);
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
      const filings = filingsBetween(company.profile, from, addDays(from, 365));
      const [states, txns] = await Promise.all([
        filingStates(env.DB, company.id),
        transactionsFor(env.DB, company.id),
      ]);

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

      return html(dashboardPage(
        account.email, company.id, company.profile, filings, states,
        advisories, from, chrome,
      ));
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

      if (path === '/assets/delete' && request.method === 'POST') {
        const form = await request.formData();
        await deleteAsset(env.DB, company.id, String(form.get('id') ?? ''));
        return redirect('/year-end');
      }

      let problem: string | null = null;
      if (path === '/assets' && request.method === 'POST') {
        const form = await request.formData();
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
      const s1 = schedule1(statements, ledger, active, s8);
      const tax = computeTax(company.profile, active, s1, ledger);

      return html(yearEndPage(
        account.email, company.profile.legalName, years, active,
        statements, s8, s1, tax, assets, today(), problem ?? undefined,
        chrome,
      ), problem ? 400 : 200);
    }

    if (path === '/compensation' && account) {
      if (!company) return redirect('/onboarding');

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
        chrome), problem ? 400 : 200);
    }

    // A signed in visitor landing on the marketing page wants their calendar.
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
