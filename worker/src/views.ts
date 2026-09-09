import type { CompanyProfile } from './rules/profile';
import type { Filing, Advisory } from './rules/engine';

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
  h1, h2, h3 { font-family: var(--font-display); font-weight: 500;
    letter-spacing: -.028em; line-height: 1.08; margin: 0; text-wrap: balance; }
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

  .err { background: var(--danger-tint); border-left: 3px solid var(--danger);
    padding: .85rem 1.1rem; border-radius: 0 10px 10px 0; margin-bottom: 1.6rem;
    font-size: .94rem; }

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
  .stat b { display: block; font-family: var(--font-display); font-weight: 500;
    font-size: 1.9rem; letter-spacing: -.04em; line-height: 1.1; }
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
<link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png">
<meta name="theme-color" content="#14110d">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600&display=swap">
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

export function onboardingPage(email: string, p: CompanyProfile, error?: string): string {
  const sel = (v: boolean) => (v ? ' checked' : '');
  return shell('Your corporation', `
<div class="narrow">
  <div class="steps-bar"><b>Step 1 of 1</b> &middot; about the corporation</div>
  <h1>Tell us about the corporation.</h1>
  <p class="hint">Every answer changes which filings exist for you, so none of this
  is a formality. All of it comes off your incorporation documents and your last
  return.</p>
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

  const rows = txns.map((t) => {
    const a = ACCOUNT_BY_ID.get(t.account_id);
    return `<div class="frow">
      <span class="d">${esc(t.txn_date)}</span>
      <span class="t">${esc(a?.name ?? t.account_id)}
        ${t.description ? `<span class="sub">${esc(t.description)}</span>` : ''}</span>
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
