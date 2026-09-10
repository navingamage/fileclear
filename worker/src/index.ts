import { blankProfile, type CompanyProfile, type Jurisdiction } from './rules/profile';
import { filingsBetween, advisoriesFor, addDays, yearEndFor } from './rules/engine';
import {
  accountForRequest, createSession, endSession, hashPassword, verifyPassword,
  randomId, sessionCookie, clearedCookie, looksLikeEmail, passwordProblem,
} from './auth';
import {
  saveCompany, activeCompanyFor, companiesFor, setActiveCompany,
  loadCompany, filingStates, setFilingState,
  addTransaction, deleteTransaction, transactionsFor, toLedger,
  assetsFor, addAsset, deleteAsset, ccaClaims,
  employeesFor, addEmployee, deleteEmployee,
} from './db';
import { computeHst } from './rules/hst';
import { sweep, torontoNow, SEND_HOUR, type CronEnv } from './cron';
import { watchSources } from './watch';
import { staleness } from './rules/sources';
import { send, welcomeMail } from './email';
import { ACCOUNT_BY_ID } from './rules/gifi';
import { DEFAULT_COUNTER } from './rules/postings';
import {
  authPage, onboardingPage, dashboardPage, booksPage, hstPage, yearEndPage,
  compensationPage, slipsPage, shell, html,
  type HstPeriodOption, type Chrome,
} from './views';
import { fiscalYears, statementsFor } from './rules/yearend';
import { schedule8, CLASS_BY_NUMBER } from './rules/cca';
import { schedule1, computeTax } from './rules/t2';
import { compareCompensation } from './rules/compensation';
import { t4For, t4ForSalary, t5For, slipDeadline, salaryInLedger } from './rules/slips';
import {
  deductionsFor, remitterAdvice, payrollRun, ontarioEht, type PayFrequency,
} from './rules/payroll';

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

        // Confirms the address works, which is the only proof either side has
        // that reminders will arrive. Not awaited: a slow mail API must not sit
        // between somebody pressing the button and their account opening, and
        // an unsendable welcome is not a reason to fail a signup that already
        // succeeded. The outcome is logged either way.
        const origin = env.FC_PUBLIC_ORIGIN ?? url.origin;
        ctx.waitUntil(
          send(env, { to: email, ...welcomeMail(email, origin) })
            .then((r) => { if (!r.sent) console.log(`welcome mail to ${email}: ${r.reason}`); }));

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
      const session = await createSession(env.DB, row.id);
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
      '/companies'].includes(path);
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
      const states = await filingStates(env.DB, company.id);
      return html(dashboardPage(
        account.email, company.id, company.profile, filings, states,
        advisoriesFor(company.profile), from, chrome,
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
