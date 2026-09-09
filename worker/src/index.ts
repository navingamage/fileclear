import { blankProfile, type CompanyProfile, type Jurisdiction } from './rules/profile';
import { filingsBetween, advisoriesFor, addDays, yearEndFor } from './rules/engine';
import {
  accountForRequest, createSession, endSession, hashPassword, verifyPassword,
  randomId, sessionCookie, clearedCookie, looksLikeEmail, passwordProblem,
} from './auth';
import {
  saveCompany, firstCompanyFor, loadCompany, filingStates, setFilingState,
  addTransaction, deleteTransaction, transactionsFor, toLedger,
} from './db';
import { computeHst } from './rules/hst';
import { sweep, torontoNow, SEND_HOUR, type CronEnv } from './cron';
import { ACCOUNT_BY_ID } from './rules/gifi';
import {
  authPage, onboardingPage, dashboardPage, booksPage, hstPage, shell, html,
  type HstPeriodOption,
} from './views';

export interface Env extends CronEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

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
  p.permanentEstablishments = form.getAll('pe').map((v) => String(v) as Jurisdiction);
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
    ctx.waitUntil(sweep(env, now.date).then((r) => {
      console.log(`sweep ${now.date}: ${r.emailed}/${r.companies} companies emailed, `
        + `${r.filings} filings` + (r.skipped.length ? `, skipped ${r.skipped.join('; ')}` : ''));
    }));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // www is redirected at the edge by a rule, so anything arriving here on it
    // is a misconfiguration rather than a request to serve.
    if (url.hostname.startsWith('www.')) {
      return Response.redirect(`https://fileclear.ca${url.pathname}${url.search}`, 301);
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
        const session = await createSession(env.DB, id);
        return redirect('/onboarding', { 'Set-Cookie': sessionCookie(session) });
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
      const session = await createSession(env.DB, row.id);
      return redirect('/dashboard', { 'Set-Cookie': sessionCookie(session) });
    }

    if (path === '/signout') {
      await endSession(env.DB, request);
      return redirect('/', { 'Set-Cookie': clearedCookie() });
    }

    // ------------------------------------------------------- authenticated
    const needsAccount = ['/dashboard', '/onboarding', '/filing', '/books',
      '/books/delete', '/hst'].includes(path);
    if (needsAccount && !account) return redirect('/signin');

    if (path === '/onboarding' && account) {
      const existing = await firstCompanyFor(env.DB, account.id);
      if (request.method === 'GET') {
        return html(onboardingPage(account.email, existing?.profile ?? blankProfile()));
      }
      const { profile, error } = profileFromForm(await request.formData());
      if (error) return html(onboardingPage(account.email, profile, error), 400);
      await saveCompany(env.DB, existing?.id ?? randomId(16), account.id, profile);
      return redirect('/dashboard');
    }

    if (path === '/dashboard' && account) {
      const company = await firstCompanyFor(env.DB, account.id);
      if (!company) return redirect('/onboarding');

      const from = today();
      const filings = filingsBetween(company.profile, from, addDays(from, 365));
      const states = await filingStates(env.DB, company.id);
      return html(dashboardPage(
        account.email, company.id, company.profile, filings, states,
        advisoriesFor(company.profile), from,
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
      const company = await firstCompanyFor(env.DB, account.id);
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
        const amount = money(form.get('amount'));
        const hst = money(form.get('hst'));

        let problem: string | null = null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problem = 'Enter a date.';
        else if (!ACCOUNT_BY_ID.has(accountId)) problem = 'Choose an account.';
        else if (amount === null || amount === 0) problem = 'Enter an amount.';
        else if (hst === null) problem = 'The HST amount is not a number.';

        if (problem) {
          const txns = await transactionsFor(env.DB, company.id);
          return html(booksPage(account.email, company.id, company.profile.legalName,
            txns, today(), problem), 400);
        }
        await addTransaction(env.DB, randomId(16), company.id, {
          txn_date: date, account_id: accountId,
          amount_cents: amount!, hst_cents: hst ?? 0,
          description: String(form.get('description') ?? '').slice(0, 200),
        });
        return redirect('/books');
      }

      const txns = await transactionsFor(env.DB, company.id);
      return html(booksPage(account.email, company.id, company.profile.legalName,
        txns, today()));
    }

    if (path === '/hst' && account) {
      const company = await firstCompanyFor(env.DB, account.id);
      if (!company) return redirect('/onboarding');

      const options = hstPeriods(company.profile.fiscalYearEnd, today());
      const wanted = url.searchParams.get('period');
      const chosen = options.find((o) => o.id === wanted) ?? options[0]!;
      const rows = await transactionsFor(env.DB, company.id, chosen.from, chosen.to);
      const ret = computeHst(toLedger(rows), chosen.from, chosen.to);
      return html(hstPage(account.email, company.profile.legalName, ret, options, chosen.id));
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
