import type { CompanyProfile } from './rules/profile';
import type { Filing, Advisory } from './rules/engine';
import { DEFAULT_COUNTER } from './rules/postings';
import type { FiscalYear, GifiStatements, StatementLine } from './rules/yearend';
import { GIFI } from './rules/yearend';
import { CCA_CLASSES, type Schedule8, type AssetRecord } from './rules/cca';
import type { Schedule1, TaxComputation } from './rules/t2';
import type { Comparison } from './rules/compensation';
import type { T4, T5, SlipBox } from './rules/slips';
import type { PayPeriodDeductions, RemitterAdvice } from './rules/payroll';

/**
 * Server rendered HTML. No client framework, because there is no client state
 * worth one: every screen here is a form or a list.
 *
 * The palette and the type roles come from /brand/tokens.css, the same file the
 * marketing pages link, so the application cannot drift away from the site.
 */

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const CHROME = `<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: var(--font-body); font-size: 16.5px; line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--link); text-decoration: underline; text-underline-offset: 2px;
    font-weight: 500; }
  a:hover { color: var(--brand); }
  :focus-visible { outline: 2.5px solid var(--brand); outline-offset: 3px; border-radius: 6px; }
  h1, h2, h3 { font-family: var(--font-display); font-weight: 600;
    letter-spacing: -.035em; line-height: 1.08; margin: 0; text-wrap: balance; }
  h1 { font-size: clamp(2rem, 4.4vw, 2.9rem); }
  h2 { font-size: 1.35rem; }
  h3 { font-size: 1.02rem; font-weight: 700; }
  p { margin: 0 0 1rem; }

  .wrap { max-width: 980px; margin: 0 auto; padding: 0 24px; }
  .narrow { max-width: 640px; }

  header.app { border-bottom: 1px solid var(--line); background: var(--bg);
    position: sticky; top: 0; z-index: 40; }
  .app-in { display: flex; align-items: center; gap: 1.4rem; padding: .9rem 0; }
  .brand { display: flex; align-items: center; gap: .55rem; color: var(--ink);
    font-family: var(--font-display); font-weight: 800; font-size: 1.1rem;
    letter-spacing: -.04em; }
  .brand:hover { text-decoration: none; }
  .brand img { width: 30px; height: 30px; border-radius: 8px; }
  .app-nav { display: flex; gap: 1.3rem; margin-left: 1rem; }
  .app-nav a { color: var(--muted); font-size: .95rem; font-weight: 500; }
  .app-nav a:hover { color: var(--ink); text-decoration: none; }
  .app-nav a.on { color: var(--ink); font-weight: 600; }
  .app-right { margin-left: auto; display: flex; align-items: center; gap: .9rem;
    font-size: .9rem; color: var(--muted); }
  @media (max-width: 720px) { .app-nav { display: none; } }

  .label { font-family: var(--font-mono); font-size: .7rem; letter-spacing: .15em;
    text-transform: uppercase; color: var(--brand); display: block;
    margin: 0 0 .8rem; }

  main { padding: 2.6rem 0 5rem; }

  fieldset { border: 0; margin: 0 0 2.4rem; padding: 0; }
  legend { font-family: var(--font-display); font-weight: 600; font-size: 1.2rem;
    letter-spacing: -.03em; padding: 0; margin-bottom: .3rem; }
  .hint { color: var(--muted); font-size: .95rem; margin: 0 0 1.4rem; }
  /* Headings have no margins of their own, so the space under one is set on
     the pairing rather than letting the lede touch the baseline. */
  h1 + .hint { margin-top: .85rem; }
  .field { margin-bottom: 1.15rem; }
  .field > label { display: block; font-weight: 600; font-size: .93rem; margin-bottom: .35rem; }
  .field .sub { display: block; color: var(--muted); font-size: .85rem;
    font-weight: 400; margin-top: .15rem; }
  input[type=text], input[type=email], input[type=password], input[type=date],
  input[type=number], select {
    width: 100%; padding: .68rem .8rem; font: inherit; font-size: .97rem;
    color: var(--ink); background: var(--surface);
    border: 1px solid var(--line-2); border-radius: 10px;
  }
  input:focus, select:focus { border-color: var(--brand); }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
  .check { display: flex; gap: .65rem; align-items: flex-start; margin-bottom: .85rem; }
  .check input { margin-top: .35rem; flex: none; }
  .check label { font-size: .95rem; }

  .btn { display: inline-flex; align-items: center; justify-content: center;
    padding: .68rem 1.25rem; font: inherit; font-weight: 600; font-size: .95rem;
    cursor: pointer; border: 1.5px solid var(--line-2); background: var(--surface);
    color: var(--ink); border-radius: 6px; white-space: nowrap; }
  .btn:hover { text-decoration: none; background: var(--sunk); }
  .btn.primary { background: var(--primary); border-color: var(--primary);
    color: var(--primary-ink); }
  .btn.primary:hover { filter: brightness(1.15); background: var(--primary); }
  .btn.small { padding: .38rem .85rem; font-size: .85rem; }

  .err, .ok { padding: .85rem 1.1rem; border-radius: 0 10px 10px 0;
    margin-bottom: 1.6rem; font-size: .94rem; }
  .err { background: var(--danger-tint); border-left: 3px solid var(--danger); }
  /* Confirmation, not alarm. Same shape as .err so the two read as one family,
     and the ink stays neutral because nothing here needs a colour to be read. */
  .ok  { background: var(--sunk); border-left: 3px solid var(--ink); }
  .ok b { font-weight: 600; }

  /* Cards, matching the marketing page: rounded, lifted, quiet borders. */
  .sheet { border: 1px solid var(--line); background: var(--surface);
    border-radius: 16px; box-shadow: var(--shadow); margin-bottom: 2rem;
    overflow: hidden; }
  .sheet-head { display: flex; justify-content: space-between; align-items: baseline;
    gap: 1rem; padding: .95rem 1.25rem; border-bottom: 1px solid var(--line);
    background: var(--band); font-family: var(--font-mono); font-size: .72rem;
    letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .frow { display: grid; grid-template-columns: 6.4rem 1fr auto auto;
    gap: .9rem; align-items: center; padding: .85rem 1.25rem;
    border-bottom: 1px solid var(--line); }
  .frow:last-child { border-bottom: 0; }
  .frow.overdue { background: var(--danger-tint); }
  .frow.done { opacity: .5; }
  .frow.done .t { text-decoration: line-through; }
  .frow .d { font-family: var(--font-mono); font-size: .82rem;
    font-variant-numeric: tabular-nums; color: var(--muted); }
  .frow.overdue .d { color: var(--danger); font-weight: 600; }
  .frow .t { font-size: .96rem; font-weight: 500; }
  .frow .f { font-family: var(--font-mono); font-size: .78rem; color: var(--muted);
    white-space: nowrap; }
  .frow form { margin: 0; }
  @media (max-width: 660px) {
    .frow { grid-template-columns: 5.6rem 1fr; }
    .frow .f { grid-column: 2; }
  }

  details.why { margin-top: .4rem; }
  details.why summary { cursor: pointer; font-size: .85rem; color: var(--muted);
    font-weight: 400; }
  details.why p { font-size: .9rem; color: var(--ink-2); margin: .5rem 0 0; }

  .advisory { border: 1px solid var(--line); border-left: 3px solid var(--warn);
    background: var(--warn-tint); padding: .9rem 1.1rem; margin-bottom: .8rem;
    border-radius: 0 12px 12px 0; font-size: .93rem; }
  .advisory.info { border-left-color: var(--line-2); background: var(--band);
    color: var(--ink-2); }
  .advisory b { display: block; margin-bottom: .2rem; }

  .txn-form { border: 1px solid var(--line); border-radius: 16px;
    padding: 1.2rem 1.3rem; margin-bottom: 1.8rem; background: var(--band); }
  .txn-grid { display: grid; grid-template-columns: 9rem 1fr 8rem 8rem 1fr auto;
    gap: .7rem; align-items: end; }
  .txn-grid .field { margin: 0; }
  @media (max-width: 980px) { .txn-grid { grid-template-columns: 1fr 1fr; } }
  .frow .sub { display: block; color: var(--muted); font-size: .82rem;
    font-weight: 400; }
  .frow .num { font-variant-numeric: tabular-nums; font-size: .88rem; color: var(--ink); }
  .frow.total { background: var(--band); }
  .periods { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  /* Separates the stages of a long worksheet, so the page reads as steps
     rather than as one wall of figures. */
  h2.sec { margin: 2.6rem 0 .5rem; padding-top: 1.6rem;
    border-top: 1px solid var(--line); }
  h2.sec + .hint { margin-top: .6rem; }
  .frow .t.muted { color: var(--muted); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
  @media (max-width: 860px) { .two { grid-template-columns: 1fr; } }
  .two .sheet { margin-bottom: 0; }
  .two .sheet.win { border-color: var(--brand); box-shadow: var(--shadow-lg); }
  .two .frow { grid-template-columns: 1fr auto; }
  .verdict { margin: 1.5rem 0; padding: 1.1rem 1.3rem; border-radius: 16px;
    background: var(--band); font-size: .97rem; }
  .verdict.good { background: var(--brand-tint); }
  .verdict b { display: block; margin-bottom: .25rem; }

  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;
    margin: 1.6rem 0; }
  @media (max-width: 660px) { .stats { grid-template-columns: 1fr; } }
  .stat { background: var(--band); border: 1px solid var(--line);
    border-radius: 16px; padding: 1.1rem 1.2rem; }
  .stat b { display: block; font-family: var(--font-mono); font-weight: 500;
    font-size: 1.75rem; letter-spacing: -.03em; line-height: 1.15;
    font-variant-numeric: tabular-nums; }
  .stat span { display: block; color: var(--muted); font-size: .88rem; margin-top: .2rem; }
  .stat.bad b { color: var(--danger); }
  .frow .now { font-family: var(--font-mono); font-size: .66rem; letter-spacing: .08em;
    text-transform: uppercase; color: var(--brand); }

  .steps-bar { font-family: var(--font-mono); font-size: .72rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 1.6rem; }
  .steps-bar b { color: var(--brand); }
</style>`;

const HEAD = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/brand/tokens.css">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/brand/mark.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png">
<meta name="theme-color" content="#14110d">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
${CHROME}
</head>
<body>`;

export function shell(title: string, body: string, email?: string, active = ''): string {
  const link = (href: string, label: string) =>
    `<a href="${href}"${active === href ? ' class="on"' : ''}>${label}</a>`;
  return `${HEAD(title)}
<header class="app"><div class="wrap app-in">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="30" height="30">FileClear</a>
  ${email ? `<nav class="app-nav" aria-label="Sections">
    ${link('/dashboard', 'Filings')}${link('/books', 'Books')}${link('/hst', 'HST')}
    ${link('/year-end', 'Year end')}${link('/compensation', 'Pay')}${link('/slips', 'Slips')}
    ${link('/onboarding', 'Company')}</nav>` : ''}
  ${email ? `<div class="app-right"><span>${esc(email)}</span>
    <form method="post" action="/signout" style="margin:0">
      <button class="btn small" type="submit">Sign out</button></form></div>` : ''}
</div></header>
<main><div class="wrap">
${body}
</div></main>
</body></html>`;
}

export function html(body: string, status = 200, extra: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...extra },
  });
}

// --------------------------------------------------------------------- auth

export function authPage(mode: 'in' | 'up', error?: string, email = ''): string {
  const up = mode === 'up';
  return shell(up ? 'Create an account' : 'Sign in', `
<div class="narrow">
  <span class="label">${up ? 'New account' : 'Sign in'}</span>
  <h1>${up ? 'Set up your filing calendar' : 'Welcome back'}</h1>
  <p class="hint">${up
    ? 'One account can hold more than one corporation.'
    : 'Enter the email you signed up with.'}</p>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <form method="post" action="${up ? '/signup' : '/signin'}">
    <div class="field">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required value="${esc(email)}">
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required
        autocomplete="${up ? 'new-password' : 'current-password'}"
        ${up ? 'minlength="10"' : ''}>
      ${up ? '<span class="sub">At least 10 characters. Length is the only rule.</span>' : ''}
    </div>
    <button class="btn primary" type="submit">${up ? 'Create account' : 'Sign in'}</button>
  </form>
  <p class="hint" style="margin-top:1.6rem">
    ${up ? 'Already have an account? <a href="/signin">Sign in</a>.'
         : 'No account yet? <a href="/signup">Create one</a>.'}
  </p>
</div>`);
}

// --------------------------------------------------------------- onboarding

const PROVINCES: [string, string][] = [
  ['ON', 'Ontario'], ['BC', 'British Columbia'], ['AB', 'Alberta'],
  ['SK', 'Saskatchewan'], ['MB', 'Manitoba'], ['QC', 'Quebec'],
  ['NB', 'New Brunswick'], ['NS', 'Nova Scotia'], ['PE', 'Prince Edward Island'],
  ['NL', 'Newfoundland and Labrador'], ['YT', 'Yukon'],
  ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function onboardingPage(
  email: string, p: CompanyProfile, error?: string, welcomed = false,
): string {
  const sel = (v: boolean) => (v ? ' checked' : '');
  return shell('Your corporation', `
<div class="narrow">
  <div class="steps-bar"><b>Step 1 of 1</b> &middot; about the corporation</div>
  <h1>Tell us about the corporation.</h1>
  <p class="hint">Every answer changes which filings exist for you, so none of this
  is a formality. All of it comes off your incorporation documents and your last
  return.</p>
  ${welcomed ? `<div class="ok"><b>Account created.</b> A confirmation is on its way to
    ${esc(email)}. If it does not arrive, check the address is right before you rely on
    reminders, because that is where they will go.</div>` : ''}
  ${error ? `<div class="err">${esc(error)}</div>` : ''}

  <form method="post" action="/onboarding">
    <fieldset>
      <legend>The company</legend>
      <div class="field">
        <label for="legalName">Legal name</label>
        <input id="legalName" name="legalName" type="text" required
          value="${esc(p.legalName)}" placeholder="Antipode Technologies Inc.">
      </div>
      <div class="row2">
        <div class="field">
          <label for="jurisdiction">Where incorporated
            <span class="sub">Decides which annual return you owe, and to whom.</span></label>
          <select id="jurisdiction" name="jurisdiction">
            <option value="CBCA"${p.jurisdiction === 'CBCA' ? ' selected' : ''}>Federal (CBCA)</option>
            ${PROVINCES.map(([c, n]) =>
              `<option value="${c}"${p.jurisdiction === c ? ' selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="incorporationDate">Date of incorporation
            <span class="sub">A federal annual return is due 60 days after its anniversary.</span></label>
          <input id="incorporationDate" name="incorporationDate" type="date" required
            value="${esc(p.incorporationDate)}">
        </div>
      </div>
      <div class="field">
        <label>Fiscal year end
          <span class="sub">Not necessarily 31 December. Almost every other date follows it.</span></label>
        <div class="row2">
          <select name="fyeMonth" aria-label="Fiscal year end month">
            ${MONTHS.map((m, i) =>
              `<option value="${i + 1}"${p.fiscalYearEnd.month === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}
          </select>
          <input name="fyeDay" type="number" min="1" max="31" required
            aria-label="Fiscal year end day" value="${p.fiscalYearEnd.day}">
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>Income tax</legend>
      <div class="check">
        <input id="isCCPC" name="isCCPC" type="checkbox"${sel(p.isCCPC)}>
        <label for="isCCPC">Canadian controlled private corporation</label>
      </div>
      <div class="check">
        <input id="claimsSBD" name="claimsSBD" type="checkbox"${sel(p.claimsSmallBusinessDeduction)}>
        <label for="claimsSBD">Claiming the small business deduction
          <span class="sub">Only a CCPC actually claiming it gets three months to pay
          rather than two. If associated corporations have used up the business limit,
          leave this unticked.</span></label>
      </div>
      <div class="row2">
        <div class="field">
          <label for="grossRevenue">Gross revenue last year</label>
          <input id="grossRevenue" name="grossRevenue" type="number" min="0" step="1"
            value="${p.grossRevenue}">
        </div>
        <div class="field">
          <label for="lastYearTaxPayable">Tax payable last year
            <span class="sub">Over $3,000 means instalments.</span></label>
          <input id="lastYearTaxPayable" name="lastYearTaxPayable" type="number" min="0" step="1"
            value="${p.lastYearTaxPayable}">
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>HST</legend>
      <div class="check">
        <input id="hstRegistered" name="hstRegistered" type="checkbox"${sel(p.hst.registered)}>
        <label for="hstRegistered">Registered for GST/HST</label>
      </div>
      <div class="row2">
        <div class="field">
          <label for="hstPeriod">Reporting period</label>
          <select id="hstPeriod" name="hstPeriod">
            ${(['annual', 'quarterly', 'monthly'] as const).map((v) =>
              `<option value="${v}"${p.hst.period === v ? ' selected' : ''}>${v[0]!.toUpperCase() + v.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="hstMethod">Accounting method</label>
          <select id="hstMethod" name="hstMethod">
            <option value="regular"${p.hst.method === 'regular' ? ' selected' : ''}>Regular, with input tax credits</option>
            <option value="quick"${p.hst.method === 'quick' ? ' selected' : ''}>Quick Method</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="hstNetTax">Net HST last year
          <span class="sub">An annual filer at $3,000 or more owes quarterly instalments.</span></label>
        <input id="hstNetTax" name="hstNetTax" type="number" min="0" step="1"
          value="${p.hst.lastYearNetTax}">
      </div>
    </fieldset>

    <fieldset>
      <legend>How you are paid</legend>
      <div class="check">
        <input id="payrollAccount" name="payrollAccount" type="checkbox"${sel(p.payroll.hasAccount)}>
        <label for="payrollAccount">The corporation runs payroll
          <span class="sub">Including a salary to yourself. This adds twelve remittances
          a year and a T4.</span></label>
      </div>
      <div class="row2">
        <div class="field">
          <label for="payrollRemitter">Remitter type</label>
          <select id="payrollRemitter" name="payrollRemitter">
            <option value="regular"${p.payroll.remitter === 'regular' ? ' selected' : ''}>Regular, monthly</option>
            <option value="quarterly"${p.payroll.remitter === 'quarterly' ? ' selected' : ''}>Quarterly</option>
          </select>
        </div>
        <div class="field">
          <label for="onRemuneration">Ontario remuneration</label>
          <input id="onRemuneration" name="onRemuneration" type="number" min="0" step="1"
            value="${p.payroll.ontarioRemuneration}">
        </div>
      </div>
      <div class="check">
        <input id="paysDividends" name="paysDividends" type="checkbox"${sel(p.paysDividends)}>
        <label for="paysDividends">The corporation pays dividends
          <span class="sub">Adds a T5 by the end of February, and no source deductions.</span></label>
      </div>
      <div class="check">
        <input id="isConstruction" name="isConstruction" type="checkbox"${sel(p.isConstruction)}>
        <label for="isConstruction">Construction is the main activity
          <span class="sub">Adds contract payment reporting on a T5018.</span></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Reminders</legend>
      <p class="hint">A calendar you have to remember to open is one you have already
      failed to use, so FileClear emails you before a window closes.</p>
      <div class="check">
        <input id="remindEmail" name="remindEmail" type="checkbox"${sel(p.reminders.email)}>
        <label for="remindEmail">Email me before a filing is due</label>
      </div>
      <div class="field" style="max-width:16rem">
        <label for="remindLeadDays">How many days ahead</label>
        <input id="remindLeadDays" name="remindLeadDays" type="number" min="1" max="90"
          value="${p.reminders.leadDays}">
      </div>
    </fieldset>

    <fieldset>
      <legend>Where you have a permanent establishment</legend>
      <p class="hint">Ontario here is what turns on the employer health tax return.</p>
      ${PROVINCES.map(([c, n]) => `<div class="check">
        <input id="pe-${c}" name="pe" type="checkbox" value="${c}"${
          p.permanentEstablishments.includes(c as never) ? ' checked' : ''}>
        <label for="pe-${c}">${n}</label></div>`).join('')}
    </fieldset>

    <button class="btn primary" type="submit">Build my calendar</button>
  </form>
</div>`, email);
}

// ---------------------------------------------------------------- dashboard

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]!.slice(0, 3)} ${y}`;
}

export function dashboardPage(
  email: string, companyId: string, p: CompanyProfile,
  filings: Filing[], states: Map<string, string>, advisories: Advisory[], today: string,
): string {
  // Grouped by month. A flat list of forty dated rows is a spreadsheet; the
  // month heading is what turns it into something a person can plan against.
  const months: { key: string; label: string; items: Filing[] }[] = [];
  for (const f of filings) {
    const key = f.due.slice(0, 7);
    const [y, m] = key.split('-').map(Number) as [number, number];
    const last = months[months.length - 1];
    if (!last || last.key !== key) {
      months.push({ key, label: `${MONTHS[m - 1]} ${y}`, items: [f] });
    } else {
      last.items.push(f);
    }
  }

  const row = (f: Filing) => {
    const state = states.get(f.id);
    const done = state === 'done';
    const overdue = !done && f.due < today;
    // The lead time is the point: a deadline you learn about on the day is not
    // a deadline you can act on.
    const starting = !done && !overdue && f.actionableFrom <= today;
    return `<div class="frow${done ? ' done' : overdue ? ' overdue' : ''}">
      <span class="d">${fmt(f.due)}${
        starting ? '<br><span class="now">start now</span>' : ''}</span>
      <span class="t">${esc(f.title)}
        <details class="why"><summary>Why, and what happens if it slips</summary>
          <p>${esc(f.detail)}</p>
          <p><b>Start acting</b> ${fmt(f.actionableFrom)}.</p>
          <p><b>If it is late.</b> ${esc(f.penalty)}<br>
          <a href="${esc(f.linkUrl)}" rel="noopener" target="_blank">${esc(f.linkLabel)}</a>,
          from ${esc(f.authority)}.</p>
        </details>
      </span>
      <span class="f">${esc(f.form)}</span>
      <form method="post" action="/filing">
        <input type="hidden" name="company" value="${esc(companyId)}">
        <input type="hidden" name="filing" value="${esc(f.id)}">
        <input type="hidden" name="state" value="${done ? '' : 'done'}">
        <button class="btn small" type="submit">${done ? 'Undo' : 'Done'}</button>
      </form>
    </div>`;
  };

  const outstanding = filings.filter((f) => states.get(f.id) !== 'done');
  const overdue = outstanding.filter((f) => f.due < today).length;
  const next = outstanding.find((f) => f.due >= today);

  return shell(`${p.legalName} filings`, `
<span class="label">${esc(p.legalName)} &middot; year end ${MONTHS[p.fiscalYearEnd.month - 1]} ${p.fiscalYearEnd.day}</span>
<h1>What you owe, and when.</h1>

<div class="stats">
  <div class="stat"><b>${outstanding.length}</b><span>outstanding this year</span></div>
  <div class="stat${overdue ? ' bad' : ''}"><b>${overdue}</b><span>overdue</span></div>
  <div class="stat"><b>${next ? fmt(next.due).replace(/ \d{4}$/, '') : 'None'}</b>
    <span>${next ? esc(next.title) : 'nothing coming up'}</span></div>
</div>

<p class="hint">${p.reminders.email
  ? `We will email you ${p.reminders.leadDays} days before each one.`
  : 'Email reminders are off.'}
<a href="/onboarding">Change the company details</a> and this list changes with them.</p>

${advisories.map((a) => `<div class="advisory ${a.severity === 'info' ? 'info' : ''}">
  <b>${esc(a.title)}</b>${esc(a.detail)}</div>`).join('')}

${months.map((m) => `<div class="sheet">
  <div class="sheet-head"><span>${esc(m.label)}</span><span>${m.items.length} ${
    m.items.length === 1 ? 'filing' : 'filings'}</span></div>
  ${m.items.map(row).join('')}
</div>`).join('') || '<div class="sheet"><div class="frow"><span class="t">Nothing due in the next twelve months.</span></div></div>'}`,
  email, '/dashboard');
}

// -------------------------------------------------------------------- books

import { ACCOUNTS, ACCOUNT_BY_ID, type AccountKind } from './rules/gifi';
import { dollars, type HstReturn } from './rules/hst';
import type { TxnRow } from './db';

const KIND_LABEL: Record<AccountKind, string> = {
  revenue: 'Revenue', expense: 'Expenses', asset: 'Assets',
  liability: 'Liabilities', equity: 'Equity',
};

export function booksPage(
  email: string, companyId: string, companyName: string,
  txns: TxnRow[], today: string, error?: string,
): string {
  const grouped: AccountKind[] = ['revenue', 'expense', 'asset', 'liability', 'equity'];
  const options = grouped.map((kind) => `<optgroup label="${KIND_LABEL[kind]}">${
    ACCOUNTS.filter((a) => a.kind === kind)
      .map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')
  }</optgroup>`).join('');

  // Where the money moved. Almost always the bank, so it is preselected and
  // most entries never touch it, but it is what makes the books balance and a
  // balance sheet possible. Only accounts money can sit in are offered:
  // "paid from Rent" is not a thing.
  const counterOptions = ACCOUNTS
    .filter((a) => a.kind === 'asset' || a.kind === 'liability' || a.kind === 'equity')
    .map((a) => `<option value="${a.id}"${a.id === DEFAULT_COUNTER ? ' selected' : ''}>${esc(a.name)}</option>`)
    .join('');

  const rows = txns.map((t) => {
    const a = ACCOUNT_BY_ID.get(t.account_id);
    return `<div class="frow">
      <span class="d">${esc(t.txn_date)}</span>
      <span class="t">${esc(a?.name ?? t.account_id)}
        <span class="sub">${
          ACCOUNT_BY_ID.get(t.counter_account_id)?.name ?? t.counter_account_id
        }${t.description ? ` &middot; ${esc(t.description)}` : ''}</span></span>
      <span class="f">${dollars(t.amount_cents)}</span>
      <span class="f">${t.hst_cents ? dollars(t.hst_cents) : '&mdash;'}</span>
      <form method="post" action="/books/delete">
        <input type="hidden" name="company" value="${esc(companyId)}">
        <input type="hidden" name="id" value="${esc(t.id)}">
        <button class="btn small" type="submit">Remove</button>
      </form>
    </div>`;
  }).join('');

  return shell(`${companyName} books`, `
<span class="label">${esc(companyName)} &middot; ledger</span>
<h1>The books.</h1>
<p class="hint">Every line carries the HST that was actually on the document, not a
computed 13%. A supplier outside Canada charges none, and claiming tax that was never
charged is claiming a credit that does not exist.
<a href="/hst">See the HST return</a> this produces.</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}

<form method="post" action="/books" class="txn-form">
  <input type="hidden" name="company" value="${esc(companyId)}">
  <div class="txn-grid">
    <div class="field"><label for="date">Date</label>
      <input id="date" name="date" type="date" required value="${esc(today)}"></div>
    <div class="field"><label for="account">Account</label>
      <select id="account" name="account" required>${options}</select></div>
    <div class="field"><label for="amount">Amount, before HST</label>
      <input id="amount" name="amount" type="text" inputmode="decimal" required placeholder="1000.00"></div>
    <div class="field"><label for="hst">HST on the document</label>
      <input id="hst" name="hst" type="text" inputmode="decimal" placeholder="130.00"></div>
    <div class="field"><label for="counter">Money from or to</label>
      <select id="counter" name="counter" required>${counterOptions}</select></div>
    <div class="field"><label for="description">Description</label>
      <input id="description" name="description" type="text" placeholder="Invoice 014"></div>
    <div class="field"><label>&nbsp;</label>
      <button class="btn primary" type="submit">Add</button></div>
  </div>
</form>

<div class="sheet">
  <div class="sheet-head"><span>Ledger</span><span>${txns.length} entries</span></div>
  ${rows || '<div class="frow"><span class="t">Nothing recorded yet.</span></div>'}
</div>`, email, '/books');
}

// ---------------------------------------------------------------- hst return

/** A selectable fiscal year on the HST screen. */
export interface HstPeriodOption { id: string; label: string; from: string; to: string; }

export function hstPage(
  email: string, companyName: string, r: HstReturn, periods: HstPeriodOption[],
  active: string,
): string {
  const better = r.quickSaves > 0;
  return shell(`${companyName} HST`, `
<span class="label">${esc(companyName)} &middot; HST</span>
<h1>Your HST return.</h1>
<p class="hint">Computed from the ledger, both ways, for
${esc(r.from)} to ${esc(r.to)}.</p>

<div class="periods">${periods.map((o) =>
  `<a class="btn small${o.id === active ? ' primary' : ''}" href="/hst?period=${o.id}">${esc(o.label)}</a>`).join('')}</div>

<div class="two">
  <div class="sheet">
    <div class="sheet-head"><span>Regular method</span><span>GST34</span></div>
    <div class="frow"><span class="t">Line 101 &middot; total revenue</span><span class="f num">${dollars(r.totalRevenue)}</span></div>
    <div class="frow"><span class="t">Line 105 &middot; HST collected</span><span class="f num">${dollars(r.collected)}</span></div>
    <div class="frow"><span class="t">Line 108 &middot; input tax credits</span><span class="f num">${dollars(r.itcs)}</span></div>
    <div class="frow total"><span class="t"><b>Line 109 &middot; net tax</b></span><span class="f num"><b>${dollars(r.netTaxRegular)}</b></span></div>
  </div>

  <div class="sheet${better ? ' win' : ''}">
    <div class="sheet-head"><span>Quick Method</span><span>${(r.quick.rate * 100).toFixed(1)}%</span></div>
    <div class="frow"><span class="t">Sales, HST included</span><span class="f num">${dollars(r.quick.includedSales)}</span></div>
    <div class="frow"><span class="t">At ${(r.quick.rate * 100).toFixed(1)}%</span><span class="f num">${dollars(Math.round(r.quick.includedSales * r.quick.rate))}</span></div>
    <div class="frow"><span class="t">Less the 1% credit</span><span class="f num">${dollars(-r.quick.credit)}</span></div>
    <div class="frow"><span class="t">Less credits on capital</span><span class="f num">${dollars(-r.quick.capitalItcs)}</span></div>
    <div class="frow total"><span class="t"><b>Net tax</b></span><span class="f num"><b>${dollars(r.quick.netTax)}</b></span></div>
  </div>
</div>

<div class="verdict ${better ? 'good' : ''}">
  ${r.quick.eligible
    ? (better
      ? `<b>The Quick Method would have cost ${dollars(r.quickSaves)} less</b>
         over this period. That is the difference between the two columns above,
         computed from your own ledger rather than from a rule of thumb.`
      : `<b>The regular method is cheaper here, by ${dollars(-r.quickSaves)}.</b>
         Your input tax credits are large enough to beat the flat rate, which is
         what happens when a business has heavy taxable costs.`)
    : '<b>The Quick Method is not available at this level of sales.</b>'}
</div>

${r.caveats.map((c) => `<div class="advisory info">${esc(c)}</div>`).join('')}`, email, '/hst');
}

// ------------------------------------------------------------------ year end

/**
 * The year end worksheet.
 *
 * FileClear does not file, so the deliverable is a set of figures with the
 * schedule and line number beside each one. A number with no address is a
 * calculator result; a number that says "Schedule 1, line 403" can be typed
 * into CRA's form by somebody who has never seen one before.
 *
 * The order follows how the return is actually built rather than how it is
 * printed: statements first, then capital cost allowance, then the
 * reconciliation that uses it, then the tax that falls out.
 */
export function yearEndPage(
  email: string, companyName: string,
  years: FiscalYear[], active: FiscalYear,
  s: GifiStatements, s8: Schedule8, s1: Schedule1, tax: TaxComputation,
  assets: AssetRecord[], today: string, error?: string,
): string {
  const rows = (lines: StatementLine[]) => lines.map((l) =>
    `<div class="frow"><span class="d">${l.gifi}</span><span class="t">${esc(l.name)}</span>
     <span class="f num">${dollars(l.amount)}</span></div>`).join('');

  const total = (gifi: number, label: string, amount: number) =>
    `<div class="frow total"><span class="d">${gifi}</span><span class="t"><b>${label}</b></span>
     <span class="f num"><b>${dollars(amount)}</b></span></div>`;

  const classOptions = CCA_CLASSES.map((c) =>
    `<option value="${c.number}">Class ${c.number} &middot; ${esc(c.name)} (${(c.rate * 100).toFixed(0)}%)</option>`).join('');

  return shell(`${companyName} year end`, `
<span class="label">${esc(companyName)} &middot; year end</span>
<h1>${esc(active.label)}, and what it owes.</h1>
<p class="hint">${esc(active.from)} to ${esc(active.to)}${active.ended ? '' : ', still open'}.
Every figure below names the schedule and line it belongs on. FileClear works
the numbers out; it does not file them.</p>

<div class="periods">${years.map((y) =>
  `<a class="btn small${y.id === active.id ? ' primary' : ''}" href="/year-end?year=${y.id}">${esc(y.label)}${y.ended ? '' : ' (open)'}</a>`).join('')}</div>

${error ? `<div class="err">${esc(error)}</div>` : ''}

${active.ended ? '' : `<div class="advisory"><b>This year has not finished.</b>
  The figures are correct as far as the ledger goes, but there is no return to
  file until ${esc(active.to)}.</div>`}

<div class="two">
  <div class="sheet">
    <div class="sheet-head"><span>Income statement</span><span>Schedule 125</span></div>
    ${rows(s.income.revenue)}
    ${total(GIFI.totalRevenue, 'Total revenue', s.income.totalRevenue)}
    ${rows(s.income.expenses)}
    ${total(GIFI.totalExpenses, 'Total expenses', s.income.totalExpenses)}
    ${total(GIFI.netBeforeTax, 'Net income before tax', s.income.netBeforeTax)}
  </div>

  <div class="sheet">
    <div class="sheet-head"><span>Balance sheet at ${esc(active.to)}</span><span>Schedule 100</span></div>
    ${rows(s.balance.currentAssets)}
    ${total(GIFI.totalCurrentAssets, 'Total current assets', s.balance.totalCurrentAssets)}
    ${rows(s.balance.capitalAssets)}
    ${total(GIFI.totalAssets, 'Total assets', s.balance.totalAssets)}
    ${rows(s.balance.currentLiabilities)}
    ${rows(s.balance.longTermLiabilities)}
    ${total(GIFI.totalLiabilities, 'Total liabilities', s.balance.totalLiabilities)}
    ${rows(s.balance.equity)}
    ${total(GIFI.totalEquity, 'Total equity', s.balance.totalEquity)}
    ${total(GIFI.totalLiabilitiesAndEquity, 'Liabilities and equity', s.balance.totalLiabilitiesAndEquity)}
  </div>
</div>

${s.balance.difference !== 0 ? `<div class="advisory"><b>The balance sheet is out by
  ${dollars(s.balance.difference)}.</b> Assets should equal liabilities plus equity.
  A difference means a transaction is recorded against the wrong account, and the
  return built on it will be wrong too. This is shown rather than hidden because
  quietly plugging the gap is how a wrong return gets filed with confidence.</div>` : ''}

<h2 class="sec">Capital assets</h2>
<p class="hint">A laptop is not an expense. It joins a class, and a share of that
class is deducted each year. Record it in the ledger so the money leaves the bank,
and here so the deduction is right.</p>

<form method="post" action="/assets" class="txn-form">
  <div class="txn-grid">
    <div class="field"><label for="a-date">Available for use</label>
      <input id="a-date" name="date" type="date" required value="${esc(today)}"></div>
    <div class="field"><label for="a-class">Class</label>
      <select id="a-class" name="class">${classOptions}</select></div>
    <div class="field"><label for="a-cost">Cost</label>
      <input id="a-cost" name="cost" type="text" inputmode="decimal" placeholder="3000.00" required></div>
    <div class="field"><label for="a-desc">What it is</label>
      <input id="a-desc" name="description" type="text" placeholder="MacBook Pro"></div>
    <div class="field"><button class="btn primary" type="submit">Add</button></div>
  </div>
</form>

<div class="sheet">
  <div class="sheet-head"><span>Register</span><span>${assets.length} item${assets.length === 1 ? '' : 's'}</span></div>
  ${assets.length === 0
    ? '<div class="frow"><span class="t muted">Nothing yet.</span></div>'
    : assets.map((a) => `<div class="frow">
        <span class="d">${esc(a.availableForUse)}</span>
        <span class="t">${esc(a.description || 'Asset')}
          <span class="sub">Class ${a.classNumber}${a.disposedOn ? ` &middot; disposed ${esc(a.disposedOn)}` : ''}</span></span>
        <span class="f num">${dollars(a.costCents)}</span>
        <form method="post" action="/assets/delete">
          <input type="hidden" name="id" value="${esc(a.id)}">
          <button class="btn small" type="submit">Remove</button></form>
      </div>`).join('')}
</div>

<div class="sheet">
  <div class="sheet-head"><span>Capital cost allowance</span><span>Schedule 8</span></div>
  ${s8.rows.length === 0
    ? '<div class="frow"><span class="t muted">No classes open.</span></div>'
    : s8.rows.map((r) => `<div class="frow">
        <span class="d">Cl ${r.classNumber}</span>
        <span class="t">${esc(r.name)}
          <span class="sub">Opening ${dollars(r.openingUcc)} &middot; additions ${dollars(r.additions)}${
            r.dispositions ? ` &middot; disposals ${dollars(r.dispositions)}` : ''} &middot; ${(r.rate * 100).toFixed(0)}% of ${dollars(r.base)}
            &middot; closing ${dollars(r.closingUcc)}</span></span>
        <span class="f num">${dollars(r.claimed)}</span>
      </div>`).join('')}
  ${s8.rows.length ? `<div class="frow total"><span class="d"></span>
    <span class="t"><b>Total capital cost allowance</b></span>
    <span class="f num"><b>${dollars(s8.totalCca)}</b></span></div>` : ''}
</div>
${s8.notes.map((n) => `<div class="advisory info">${esc(n)}</div>`).join('')}

<h2 class="sec">From the books to taxable income</h2>
<div class="sheet">
  <div class="sheet-head"><span>Reconciliation</span><span>Schedule 1</span></div>
  <div class="frow"><span class="d">9970</span><span class="t">Net income per the books</span>
    <span class="f num">${dollars(s1.netIncomePerBooks)}</span></div>
  ${s1.additions.map((a) => `<div class="frow"><span class="d">${esc(a.ref.replace('S1 line ', ''))}</span>
    <span class="t">${esc(a.label)}<span class="sub">${esc(a.why)}</span></span>
    <span class="f num">+${dollars(a.amount)}</span></div>`).join('')}
  ${s1.deductions.map((d) => `<div class="frow"><span class="d">${esc(d.ref.replace('S1 line ', ''))}</span>
    <span class="t">${esc(d.label)}<span class="sub">${esc(d.why)}</span></span>
    <span class="f num">-${dollars(d.amount)}</span></div>`).join('')}
  <div class="frow total"><span class="d">300</span>
    <span class="t"><b>Net income for tax purposes</b></span>
    <span class="f num"><b>${dollars(s1.netIncomeForTax)}</b></span></div>
</div>

<h2 class="sec">The tax</h2>
<div class="sheet">
  <div class="sheet-head"><span>Part I and Ontario</span><span>T2 page 8</span></div>
  <div class="frow"><span class="d">360</span><span class="t">Taxable income</span>
    <span class="f num">${dollars(tax.taxableIncome)}</span></div>
  <div class="frow"><span class="d">400</span>
    <span class="t">At the small business rate
      <span class="sub">9% federal and 3.2% Ontario, up to the business limit of ${dollars(tax.proratedLimit)}.</span></span>
    <span class="f num">${dollars(tax.sbdIncome)}</span></div>
  ${tax.generalIncome ? `<div class="frow"><span class="d">405</span>
    <span class="t">At the general rate<span class="sub">15% federal and 11.5% Ontario.</span></span>
    <span class="f num">${dollars(tax.generalIncome)}</span></div>` : ''}
  <div class="frow"><span class="d">700</span><span class="t">Federal tax</span>
    <span class="f num">${dollars(tax.federalTax)}</span></div>
  <div class="frow"><span class="d">760</span><span class="t">Ontario tax</span>
    <span class="f num">${dollars(tax.ontarioTax)}</span></div>
  <div class="frow total"><span class="d">770</span>
    <span class="t"><b>Total tax payable</b>
      <span class="sub">${(tax.effectiveRate * 100).toFixed(1)}% of taxable income.</span></span>
    <span class="f num"><b>${dollars(tax.totalTax)}</b></span></div>
</div>

${tax.instalmentsRequired ? `<div class="advisory"><b>Instalments are required next year.</b>
  Tax payable is over $3,000, so next year is paid in advance rather than in one
  go. The base is ${dollars(tax.instalmentBase)}, and the instalments show up on
  your filing calendar.</div>` : ''}

${tax.notes.map((n) => `<div class="advisory info">${esc(n)}</div>`).join('')}

<div class="advisory info"><b>This is a worksheet, not a return.</b>
  FileClear is not certified by CRA and does not transmit anything. Every figure
  above names where it goes, so it can be entered into CRA's own form or into
  software that files. The authority for each number is the schedule it names.</div>
`, email, '/year-end');
}

// -------------------------------------------------------------- compensation

/**
 * Salary against dividends, both columns, no verdict.
 *
 * The page is built so the eye lands on the two net figures and then on what
 * the arithmetic cannot see. Printing a winner would be advice, and the
 * difference is usually small enough that RRSP room, CPP, and whether a lender
 * wants to see employment income decide it instead.
 */
export function compensationPage(
  email: string, companyName: string, c: Comparison,
  available: number, kind: 'eligible' | 'nonEligible',
): string {
  const col = (title: string, note: string, r: Comparison['salary'], rows: [string, number, string?][]) => `
  <div class="sheet">
    <div class="sheet-head"><span>${title}</span><span>${note}</span></div>
    ${rows.map(([label, amount, sub]) => `<div class="frow">
      <span class="t">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</span>
      <span class="f num">${dollars(amount)}</span></div>`).join('')}
    <div class="frow total"><span class="t"><b>In your hands</b>
      <span class="sub">${(r.effectiveRate * 100).toFixed(1)}% of it went in tax.</span></span>
      <span class="f num"><b>${dollars(r.netToPerson)}</b></span></div>
  </div>`;

  return shell(`${companyName} compensation`, `
<span class="label">${esc(companyName)} &middot; taking money out</span>
<h1>Salary, or dividends.</h1>
<p class="hint">Both computed on ${c.year} Ontario rates, for one person with no other
income. FileClear shows the arithmetic for each and stops there: the gap is usually
small enough that something other than tax decides it.</p>

<form method="get" action="/compensation" class="txn-form">
  <div class="txn-grid">
    <div class="field"><label for="amount">To take out of the corporation</label>
      <input id="amount" name="amount" type="text" inputmode="decimal"
        value="${(available / 100).toFixed(0)}"></div>
    <div class="field"><label for="kind">Dividend type</label>
      <select id="kind" name="kind">
        <option value="nonEligible"${kind === 'nonEligible' ? ' selected' : ''}>Non-eligible, from small business income</option>
        <option value="eligible"${kind === 'eligible' ? ' selected' : ''}>Eligible, from generally taxed income</option>
      </select></div>
    <div class="field"><button class="btn primary" type="submit">Compare</button></div>
  </div>
</form>

<div class="two">
  ${col('Salary', 'T4', c.salary, [
    ['Salary paid', c.salary.salary, 'Deductible, so the corporation pays no tax on it.'],
    ['Employer CPP', c.salary.employerCpp, 'A cost of paying a salary with no dividend equivalent.'],
    ['Employee CPP withheld', -c.salary.employeeCpp],
    ['Personal tax', -c.salary.personalTax],
  ])}
  ${col('Dividend', 'T5', c.dividend, [
    ['Corporate tax first', -c.dividend.corporateTax, 'A dividend is not deductible, so this layer comes first.'],
    ['Dividend declared', c.dividend.dividend],
    ['Personal tax', -c.dividend.personalTax,
      `Computed on ${dollars(Math.round(c.dividend.dividend * (kind === 'eligible' ? 1.38 : 1.15)))} after the gross up, less the dividend tax credits.`],
  ])}
</div>

<div class="verdict${c.salaryAdvantage > 0 ? ' good' : ''}">
  ${c.salaryAdvantage === 0
    ? '<b>The two routes land in the same place.</b>'
    : `<b>${c.salaryAdvantage > 0 ? 'Salary' : 'Dividends'} put
       ${dollars(Math.abs(c.salaryAdvantage))} more in your hands.</b>`}
  ${c.salaryTaxAdvantage > 0
    ? `On tax alone salary is the cheaper route, by ${dollars(c.salaryTaxAdvantage)}.
       ${c.salaryAdvantage < 0
         ? `It still leaves less cash because ${dollars(c.gapFromCpp)} of CPP came out
            of it, which is more than the whole gap. CPP buys a pension rather than
            paying for roads, so whether that counts as a cost is your call and not
            an arithmetic one.`
         : ''}`
    : c.salaryTaxAdvantage < 0
      ? `Dividends are cheaper in tax too, by ${dollars(-c.salaryTaxAdvantage)}${
          c.gapFromCpp ? `, and the salary route paid ${dollars(c.gapFromCpp)} of CPP on top` : ''}.`
      : 'The tax is identical either way.'}
</div>

<h2 class="sec">What the arithmetic cannot see</h2>
${c.considerations.map((x) => `<div class="advisory info">${esc(x)}</div>`).join('')}

<h2 class="sec">What this does not include</h2>
${c.caveats.map((x) => `<div class="advisory">${esc(x)}</div>`).join('')}

<div class="advisory info"><b>FileClear does not tell you which to pick.</b>
  It computes both so the decision is made on numbers rather than on folklore.
  Whether you want CPP in thirty years, or RRSP room, or employment income a
  lender will underwrite, are not questions a tax calculation can answer.</div>
`, email, '/compensation');
}

// -------------------------------------------------------------------- slips

/**
 * The slips and the remittances, filled in from the ledger.
 *
 * The calendar already says when a T4 is due. This is what goes on it, which is
 * where people actually get stuck, and every box carries its number so it can
 * be transcribed into CRA's form without a guide open beside it.
 */
export function slipsPage(
  email: string, companyName: string,
  years: number[], year: number, t4: T4, t5: T5, deadline: string,
  pay: PayPeriodDeductions | null, advice: RemitterAdvice | null,
): string {
  const boxes = (rows: SlipBox[]) => rows.map((b) => `<div class="frow">
    <span class="d">${b.box}</span>
    <span class="t">${esc(b.label)}${b.note ? `<span class="sub">${esc(b.note)}</span>` : ''}</span>
    <span class="f num">${dollars(b.amount)}</span></div>`).join('');

  const nothing = t4.boxes.every((b) => b.amount === 0) && t5.boxes.every((b) => b.amount === 0);

  return shell(`${companyName} slips`, `
<span class="label">${esc(companyName)} &middot; slips and remittances</span>
<h1>What goes on the slips.</h1>
<p class="hint">Filled in from what the ledger says was paid, so the figures agree
with the books rather than being typed twice. Both slips are due
${esc(deadline)}.</p>

<div class="periods">${years.map((y) =>
  `<a class="btn small${y === year ? ' primary' : ''}" href="/slips?year=${y}">${y}</a>`).join('')}</div>

<div class="advisory"><b>These are calendar year slips.</b>
  A T4 and a T5 cover January to December whatever your fiscal year end is. Only
  the T2 follows the fiscal year. Lining the slips up with the year end instead
  produces figures CRA cannot match to your remittance account.</div>

${nothing ? `<div class="advisory info">Nothing was paid as salary or dividends in
  ${year}, so there is no slip to file. If that is wrong, the ledger is missing
  entries: a salary belongs on the salaries account and a dividend on dividends
  declared.</div>` : ''}

${t4.boxes.some((b) => b.amount !== 0) ? `
<h2 class="sec">T4, statement of remuneration paid</h2>
<div class="sheet">
  <div class="sheet-head"><span>${year}</span><span>T4</span></div>
  ${boxes(t4.boxes)}
</div>
<div class="sheet">
  <div class="sheet-head"><span>For the T4 Summary</span><span>Employer share</span></div>
  <div class="frow"><span class="d">27</span>
    <span class="t">Employer CPP contributions
      <span class="sub">Matches box 16 and 16A together. A cost to the corporation, not a withholding.</span></span>
    <span class="f num">${dollars(t4.employerCpp)}</span></div>
</div>
${t4.notes.map((n) => `<div class="advisory info">${esc(n)}</div>`).join('')}` : ''}

${pay ? `
<h2 class="sec">Each pay period</h2>
<p class="hint">Monthly, annualised the way CRA's own formula does it, so twelve
withholdings add up to the year's tax instead of leaving a balance in April.</p>
<div class="sheet">
  <div class="sheet-head"><span>One month</span><span>PD7A</span></div>
  <div class="frow"><span class="t">Gross pay</span><span class="f num">${dollars(pay.gross)}</span></div>
  <div class="frow"><span class="t">Income tax withheld</span><span class="f num">-${dollars(pay.incomeTax)}</span></div>
  <div class="frow"><span class="t">CPP withheld</span><span class="f num">-${dollars(pay.cpp + pay.cpp2)}</span></div>
  <div class="frow total"><span class="t"><b>Net pay</b></span><span class="f num"><b>${dollars(pay.netPay)}</b></span></div>
  <div class="frow"><span class="t">Employer CPP
    <span class="sub">Paid by the corporation on top, not deducted from the cheque.</span></span>
    <span class="f num">${dollars(pay.employerCpp)}</span></div>
  <div class="frow total"><span class="t"><b>Remit to CRA</b>
    <span class="sub">Income tax plus both halves of CPP, on one PD7A.</span></span>
    <span class="f num"><b>${dollars(pay.remittance)}</b></span></div>
</div>
<div class="advisory"><b>Late is expensive out of proportion.</b>
  The penalty is a percentage of the whole remittance rather than of any shortfall,
  starting at 3% from the first day late and reaching 10%. On this remittance one
  day late costs ${dollars(Math.round(pay.remittance * 0.03))}.</div>
${advice?.warning ? `<div class="advisory">${esc(advice.warning)}</div>` : ''}` : ''}

${t5.boxes.some((b) => b.amount !== 0) ? `
<h2 class="sec">T5, statement of investment income</h2>
<div class="sheet">
  <div class="sheet-head"><span>${year}</span><span>T5</span></div>
  ${boxes(t5.boxes)}
</div>
${t5.notes.map((n) => `<div class="advisory info">${esc(n)}</div>`).join('')}` : ''}

<div class="advisory info"><b>A worksheet, not a filing.</b>
  FileClear is not certified by CRA and transmits nothing. These are the numbers
  to enter, with the box each belongs in.</div>
`, email, '/slips');
}
