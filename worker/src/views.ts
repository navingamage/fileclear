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
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  h1, h2, h3 { font-family: var(--font-display); font-weight: 800;
    letter-spacing: -.03em; line-height: 1.1; margin: 0; text-wrap: balance; }
  h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); }
  h2 { font-size: 1.3rem; }
  h3 { font-size: 1rem; font-weight: 700; }
  p { margin: 0 0 1rem; }

  .wrap { max-width: 940px; margin: 0 auto; padding: 0 22px; }
  .narrow { max-width: 620px; }

  header.app { border-bottom: 2px solid var(--rule); background: var(--bg); }
  .app-in { display: flex; align-items: center; gap: 1rem; padding: .85rem 0; }
  .brand { display: flex; align-items: center; gap: .55rem; color: var(--ink);
    font-family: var(--font-display); font-weight: 800; font-size: 1.08rem;
    letter-spacing: -.03em; }
  .brand:hover { text-decoration: none; }
  .brand img { width: 28px; height: 28px; border-radius: 7px; }
  .app-right { margin-left: auto; display: flex; align-items: center; gap: 1rem;
    font-size: .9rem; color: var(--muted); }

  .label { font-family: var(--font-mono); font-size: .7rem; letter-spacing: .16em;
    text-transform: uppercase; color: var(--muted); display: block;
    padding-bottom: .45rem; border-bottom: 1px solid var(--line-2);
    margin: 0 0 1.2rem; }

  main { padding: 2.4rem 0 4rem; }

  /* Forms are drawn like the paper they replace: a label, a rule, a value. */
  fieldset { border: 0; margin: 0 0 2.2rem; padding: 0; }
  legend { font-family: var(--font-display); font-weight: 800; font-size: 1.15rem;
    letter-spacing: -.02em; padding: 0; margin-bottom: .3rem; }
  .hint { color: var(--muted); font-size: .9rem; margin: 0 0 1.2rem; }
  .field { margin-bottom: 1.2rem; }
  .field > label { display: block; font-weight: 600; font-size: .93rem; margin-bottom: .35rem; }
  .field .sub { display: block; color: var(--muted); font-size: .85rem;
    font-weight: 400; margin-top: .15rem; }
  input[type=text], input[type=email], input[type=password], input[type=date],
  input[type=number], select {
    width: 100%; padding: .62rem .7rem; font: inherit; font-size: .97rem;
    color: var(--ink); background: var(--bg);
    border: 1px solid var(--line-2); border-radius: 3px;
  }
  input:focus, select:focus { border-color: var(--accent); }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
  .check { display: flex; gap: .6rem; align-items: flex-start; margin-bottom: .8rem; }
  .check input { margin-top: .3rem; flex: none; }
  .check label { font-size: .95rem; }

  .btn { display: inline-block; padding: .7rem 1.3rem; font: inherit;
    font-weight: 600; font-size: .95rem; cursor: pointer;
    border: 1.5px solid var(--rule); background: transparent; color: var(--ink);
    border-radius: 3px; }
  .btn:hover { background: var(--sunk); text-decoration: none; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.small { padding: .34rem .7rem; font-size: .82rem; }

  .err { background: var(--accent-soft); border-left: 3px solid var(--accent);
    padding: .8rem 1rem; margin-bottom: 1.6rem; font-size: .93rem; }
  .ok-note { background: var(--ok-soft); border-left: 3px solid var(--ok);
    padding: .8rem 1rem; margin-bottom: 1.6rem; font-size: .93rem; }

  /* The calendar. Same sheet as the marketing page, so the product looks like
     what was advertised. */
  .sheet { border: 2px solid var(--rule); background: var(--paper); margin-bottom: 2rem; }
  .sheet-head { display: flex; justify-content: space-between; align-items: baseline;
    gap: 1rem; padding: .85rem 1.05rem; border-bottom: 2px solid var(--rule);
    font-family: var(--font-mono); font-size: .72rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); }
  .frow { display: grid; grid-template-columns: 6.2rem 1fr auto auto;
    gap: .85rem; align-items: baseline; padding: .7rem 1.05rem;
    border-bottom: 1px solid var(--line); }
  .frow:last-child { border-bottom: 0; }
  .frow.overdue { background: var(--accent-soft); }
  .frow.done { opacity: .55; }
  .frow.done .t { text-decoration: line-through; }
  .frow .d { font-family: var(--font-mono); font-size: .82rem;
    font-variant-numeric: tabular-nums; }
  .frow.overdue .d { color: var(--accent); font-weight: 600; }
  .frow .t { font-size: .95rem; }
  .frow .f { font-family: var(--font-mono); font-size: .73rem; color: var(--muted);
    white-space: nowrap; }
  .frow form { margin: 0; }
  @media (max-width: 640px) {
    .frow { grid-template-columns: 5.4rem 1fr; }
    .frow .f { grid-column: 2; }
  }

  details.why { margin-top: .35rem; }
  details.why summary { cursor: pointer; font-size: .85rem; color: var(--muted); }
  details.why p { font-size: .9rem; color: var(--ink-2); margin: .5rem 0 0; }

  .advisory { border: 1px solid var(--line-2); border-left: 3px solid var(--warn);
    background: var(--warn-soft); padding: .85rem 1rem; margin-bottom: .8rem;
    font-size: .92rem; }
  .advisory.info { border-left-color: var(--muted); background: var(--paper); }
  .advisory b { display: block; margin-bottom: .2rem; }

  .steps-bar { font-family: var(--font-mono); font-size: .72rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 1.6rem; }
  .steps-bar b { color: var(--accent); }
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

export function shell(title: string, body: string, email?: string): string {
  return `${HEAD(title)}
<header class="app"><div class="wrap app-in">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="28" height="28">FileClear</a>
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
  const rows = filings.map((f) => {
    const state = states.get(f.id);
    const done = state === 'done';
    const overdue = !done && f.due < today;
    return `<div class="frow${done ? ' done' : overdue ? ' overdue' : ''}">
      <span class="d">${fmt(f.due)}</span>
      <span class="t">${esc(f.title)}
        <details class="why"><summary>Why, and what happens if it slips</summary>
          <p>${esc(f.detail)}</p>
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
  }).join('');

  const outstanding = filings.filter((f) => states.get(f.id) !== 'done').length;

  return shell(`${p.legalName} filings`, `
<span class="label">${esc(p.legalName)} &middot; year end ${MONTHS[p.fiscalYearEnd.month - 1]} ${p.fiscalYearEnd.day}</span>
<h1>What you owe, and when.</h1>
<p class="hint">${outstanding} outstanding over the next twelve months.
<a href="/onboarding">Change the company details</a> and this list changes with them.</p>

${advisories.map((a) => `<div class="advisory ${a.severity === 'info' ? 'info' : ''}">
  <b>${esc(a.title)}</b>${esc(a.detail)}</div>`).join('')}

<div class="sheet" style="margin-top:1.6rem">
  <div class="sheet-head"><span>Filing calendar</span><span>next 12 months</span></div>
  ${rows || '<div class="frow"><span class="t">Nothing due in the next twelve months.</span></div>'}
  <div class="sheet-head" style="border-bottom:0;border-top:2px solid var(--rule)">
    <span>Every date links to the authority that publishes it</span><span></span></div>
</div>`, email);
}
