import type { CompanyProfile } from './rules/profile';
import type { Filing, Advisory } from './rules/engine';
import { DEFAULT_COUNTER } from './rules/postings';
import type { FiscalYear, GifiStatements, StatementLine } from './rules/yearend';
import { GIFI } from './rules/yearend';
import { CCA_CLASSES, type Schedule8, type AssetRecord } from './rules/cca';
import type { Schedule1, TaxComputation } from './rules/t2';
import type { Comparison } from './rules/compensation';
import type { Staleness } from './rules/sources';
import { IMPORTABLE_ACCOUNTS, type ImportPreview } from './rules/csv';
import type { CompanySummary } from './db';
import type { Subscription } from './stripe';

/**
 * The parts of a page that belong to the application rather than to the screen.
 *
 * These were separate trailing arguments until there were three of them and
 * every page signature had to grow to carry one through. A page never reads
 * this; it passes it to the shell.
 */
export interface Chrome {
  /** Whether the compiled rates still belong to the current year. */
  rates?: Staleness;
  /** Every corporation on the account, for the switcher. */
  companies?: CompanySummary[];
  activeCompanyId?: string;
  /**
   * Hides the section navigation.
   *
   * Set during set-up, because until a corporation exists every link in it goes
   * to a screen with nothing on it. Eight dead links is a worse first impression
   * than none, and it invites somebody to wander off mid-way through the one
   * task that makes the rest work.
   */
  hideNav?: boolean;
}
import type { T4, T5, SlipBox } from './rules/slips';
import type {
  PayPeriodDeductions, RemitterAdvice, PayrollRun, Employee, Eht,
} from './rules/payroll';

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
  /* The corporation switcher, which only appears once there is more than one.
     Sized to sit in the header without pushing the nav around. */
  .switcher { margin: 0 0 0 auto; }
  .switcher select { width: auto; max-width: 15rem; padding: .3rem .5rem;
    font-size: .88rem; border-radius: 8px; }
  .switcher + .app-right { margin-left: 1rem; }
  @media (max-width: 720px) { .switcher select { max-width: 9rem; } }

  /* A secondary action set apart from the form it follows, so it reads as a
     different thing to do rather than another field. */
  .also { margin-top: 3rem; padding-top: 1.8rem; border-top: 1px solid var(--line); }
  .also h2 { font-size: 1.2rem; margin-bottom: .5rem; }

  /* Prose beside the figures. Deliberately quieter than the sheets it sits
     above, because the numbers are the product and this is a reading aid. */
  .plain { border: 1px solid var(--line); border-left: 3px solid var(--muted);
    background: var(--band); border-radius: 0 12px 12px 0;
    padding: 1rem 1.2rem; margin: 1rem 0 1.6rem; }
  .plain-tag { font-family: var(--font-mono); font-size: .68rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); display: block; margin-bottom: .5rem; }
  .plain p { margin: 0; font-size: .99rem; line-height: 1.6; color: var(--ink-2); }
  .plain .plain-note { margin-top: .7rem; font-size: .85rem; color: var(--muted); }

  /* Signing in and signing up. Form on the left, what happens next on the
     right, rather than a form adrift in a wide empty page. */
  .auth-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .85fr);
    gap: clamp(2rem, 6vw, 5rem); align-items: start; max-width: 1000px;
    margin: clamp(1rem, 4vw, 3rem) auto 0; }
  @media (max-width: 860px) { .auth-grid { grid-template-columns: 1fr; gap: 2.4rem; } }
  .auth-form { max-width: 27rem; }
  .auth-form h1 { font-size: clamp(1.9rem, 3.4vw, 2.5rem); }
  .btn.wide { width: 100%; margin-top: .4rem; }
  .auth-alt { margin-top: 1.5rem; font-size: .93rem; color: var(--muted); }

  .auth-aside { border: 1px solid var(--line); background: var(--band);
    border-radius: 16px; padding: 1.6rem 1.5rem; }
  .aside-tag { font-family: var(--font-mono); font-size: .68rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--brand); display: block; margin-bottom: 1rem; }
  .aside-steps { margin: 0; padding-left: 1.1rem; }
  .aside-steps li { margin-bottom: .9rem; font-size: .94rem; line-height: 1.55;
    color: var(--ink-2); }
  .aside-steps li:last-child { margin-bottom: 0; }
  .aside-steps b { color: var(--ink); font-weight: 600; }
  .aside-note { margin: 1.1rem 0 0; padding-top: 1rem; border-top: 1px solid var(--line);
    font-size: .89rem; color: var(--muted); line-height: 1.55; }

  /* Set-up progress. Three states, and the done one is a tick rather than a
     number, so glancing at it answers "how much is left" without counting. */
  .steps { display: flex; gap: .5rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .step { display: flex; align-items: center; gap: .5rem; padding: .45rem .85rem .45rem .5rem;
    border: 1px solid var(--line); border-radius: 999px; background: var(--surface); }
  .step-n { width: 1.5rem; height: 1.5rem; border-radius: 50%; flex: none;
    display: grid; place-items: center; background: var(--sunk); color: var(--muted);
    font-family: var(--font-mono); font-size: .78rem; }
  .step-t { font-size: .88rem; color: var(--muted); white-space: nowrap; }
  .step.now { border-color: var(--ink); }
  .step.now .step-n { background: var(--ink); color: var(--primary-ink); }
  .step.now .step-t { color: var(--ink); font-weight: 600; }
  .step.done .step-n { background: var(--brand); color: var(--brand-ink); }
  .step.done .step-t { color: var(--ink-2); }
  @media (max-width: 620px) { .step-t { display: none; } }

  .step-actions { display: flex; align-items: center; gap: .7rem; margin-top: 1.8rem;
    flex-wrap: wrap; }
  .step-skip { font-size: .9rem; color: var(--muted); margin-left: auto; }
  .step-foot { margin-top: 1.6rem; padding-top: 1.2rem; border-top: 1px solid var(--line);
    font-size: .9rem; color: var(--muted); }
  .pe-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .2rem 1rem; }
  @media (max-width: 700px) { .pe-grid { grid-template-columns: repeat(2, 1fr); } }

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

export function shell(
  title: string, body: string, email?: string, active = '', chrome: Chrome = {},
): string {
  const { rates, companies, activeCompanyId, hideNav } = chrome;
  const link = (href: string, label: string) =>
    `<a href="${href}"${active === href ? ' class="on"' : ''}>${label}</a>`;
  return `${HEAD(title)}
<header class="app"><div class="wrap app-in">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="30" height="30">FileClear</a>
  ${email && !hideNav ? `<nav class="app-nav" aria-label="Sections">
    ${link('/dashboard', 'Filings')}${link('/books', 'Books')}${link('/hst', 'HST')}
    ${link('/year-end', 'Year end')}${link('/compensation', 'Pay')}${link('/slips', 'Slips')}
    ${link('/onboarding', 'Company')}${link('/billing', 'Billing')}</nav>` : ''}
  ${!hideNav && companies && companies.length > 1 ? `<form method="post" action="/companies" class="switcher">
    <input type="hidden" name="back" value="${esc(active)}">
    <select name="id" onchange="this.form.submit()" aria-label="Corporation">
      ${companies.map((c) => `<option value="${esc(c.id)}"${
        c.id === activeCompanyId ? ' selected' : ''}>${esc(c.legalName || 'Unnamed')}</option>`).join('')}
    </select>
    <noscript><button class="btn small" type="submit">Switch</button></noscript>
  </form>` : ''}
  ${email ? `<div class="app-right"><span>${esc(email)}</span>
    <form method="post" action="/signout" style="margin:0">
      <button class="btn small" type="submit">Sign out</button></form></div>` : ''}
</div></header>
<main><div class="wrap">
${rates?.message ? `<div class="advisory${rates.stale ? '' : ' info'}">
  <b>${rates.stale ? 'These rates are out of date.' : 'New rates are due.'}</b>
  ${esc(rates.message)}</div>` : ''}
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

/**
 * Signing up and signing in.
 *
 * Two columns rather than a form adrift in a wide empty page. The left side is
 * the form and nothing else; the right says what happens after the button, in
 * three lines, because the thing somebody weighs before typing a password into
 * a tax product is how much work they are agreeing to.
 *
 * The claim on the right is deliberately small and checkable: four questions,
 * a calendar, free until you file. Promising less than the product delivers is
 * a better trade here than the reverse.
 */
export function authPage(mode: 'in' | 'up', error?: string, email = ''): string {
  const up = mode === 'up';

  const aside = up
    ? `<span class="aside-tag">What happens next</span>
       <ol class="aside-steps">
         <li><b>Four questions</b> about how your corporation is set up. Where you
           incorporated, when your year ends, and whether you are registered for HST.</li>
         <li><b>Your calendar appears.</b> Every filing you owe, with the form, the
           authority, and what it costs to be late.</li>
         <li><b>Reminders arrive</b> in the morning, before a window closes rather
           than after it.</li>
       </ol>
       <p class="aside-note">Free until you file from it. No card to begin.</p>`
    : `<span class="aside-tag">Your calendar is where you left it</span>
       <p class="aside-note">Nothing about what you owe is stored: it is worked out
       from your corporation's own set-up each time you look, so a corrected rule
       reaches you the next morning rather than the next time you sign up.</p>`;

  return shell(up ? 'Create an account' : 'Sign in', `
<div class="auth-grid">
  <div class="auth-form">
    <span class="label">${up ? 'New account' : 'Sign in'}</span>
    <h1>${up ? 'Never miss a filing again.' : 'Welcome back.'}</h1>
    <p class="hint">${up
      ? 'One account holds every corporation you own.'
      : 'Enter the email you signed up with.'}</p>

    ${error ? `<div class="err">${esc(error)}</div>` : ''}

    <form method="post" action="${up ? '/signup' : '/signin'}">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required
          value="${esc(email)}" placeholder="you@yourcompany.ca">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required
          autocomplete="${up ? 'new-password' : 'current-password'}"
          ${up ? 'minlength="10" placeholder="At least 10 characters"' : ''}>
        ${up ? '<span class="sub">Ten characters or more. Length is the only rule, '
             + 'so a short sentence beats a mangled word.</span>' : ''}
      </div>
      <button class="btn primary wide" type="submit">${
        up ? 'Create account' : 'Sign in'}</button>
    </form>

    <p class="auth-alt">
      ${up
        ? 'Already have an account? <a href="/signin">Sign in</a>.'
        : 'No account yet? <a href="/signup">Create one</a>. '
          + 'Forgotten your password? <a href="/forgot">Reset it</a>.'}
    </p>
  </div>

  <aside class="auth-aside">${aside}</aside>
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
  adding = false, chrome: Chrome = {},
): string {
  const sel = (v: boolean) => (v ? ' checked' : '');
  return shell('Your corporation', `
<div class="narrow">
  <div class="steps-bar"><b>${adding ? 'Adding a corporation' : 'Step 1 of 1'}</b>
    &middot; about the corporation</div>
  <h1>${adding ? 'Tell us about the new one.' : 'Tell us about the corporation.'}</h1>
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

    <button class="btn primary" type="submit">${adding ? 'Add this corporation' : 'Build my calendar'}</button>
  </form>

  ${adding ? '' : `<div class="also">
    <h2>Another corporation?</h2>
    <p class="hint">One account can hold as many as you own. Each keeps its own
    calendar, books and filings, and the header switches between them.</p>
    <a class="btn" href="/onboarding?new=1">Add a corporation</a>
  </div>`}
</div>`, email, '/onboarding', chrome);
}

// ---------------------------------------------------------------- dashboard

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]!.slice(0, 3)} ${y}`;
}

export function dashboardPage(
  email: string, companyId: string, p: CompanyProfile,
  filings: Filing[], states: Map<string, string>, advisories: Advisory[], today: string,
  chrome: Chrome = {},
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
  email, '/dashboard', chrome);
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
  txns: TxnRow[], today: string, error?: string, chrome: Chrome = {},
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
<p class="hint">Type a row, or <a href="/books/import">import a bank export</a> and correct what it guessed.</p>
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
</div>`, email, '/books', chrome);
}

// ---------------------------------------------------------------- hst return

/** A selectable fiscal year on the HST screen. */
export interface HstPeriodOption { id: string; label: string; from: string; to: string; }

export function hstPage(
  email: string, companyName: string, r: HstReturn, periods: HstPeriodOption[],
  active: string, chrome: Chrome = {},
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

${r.caveats.map((c) => `<div class="advisory info">${esc(c)}</div>`).join('')}`, email, '/hst', chrome);
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
  assets: AssetRecord[], today: string, error?: string, chrome: Chrome = {},
  plain?: string,
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

${plain ? `<div class="plain">
  <span class="plain-tag">In plain words</span>
  <p>${esc(plain)}</p>
  <p class="plain-note">Written from the figures below, which were worked out by
  FileClear rather than by the words. If the two ever disagree, the figures are
  the ones that count.</p>
</div>` : ''}
<div class="sheet">
  <div class="sheet-head"><span>Part I and Ontario</span><span>T2 page 8</span></div>
  <div class="frow"><span class="d">360</span><span class="t">Taxable income</span>
    <span class="f num">${dollars(tax.taxableIncome)}</span></div>
  <div class="frow"><span class="d">400</span>
    <span class="t">At the small business rate
      <span class="sub">9% federal, plus ${esc(tax.provinceName)}'s lower rate, up to the business limit of ${dollars(tax.proratedLimit)}.</span></span>
    <span class="f num">${dollars(tax.sbdIncome)}</span></div>
  ${tax.generalIncome ? `<div class="frow"><span class="d">405</span>
    <span class="t">At the general rate<span class="sub">15% federal, plus ${esc(tax.provinceName)}'s higher rate.</span></span>
    <span class="f num">${dollars(tax.generalIncome)}</span></div>` : ''}
  <div class="frow"><span class="d">700</span><span class="t">Federal tax</span>
    <span class="f num">${dollars(tax.federalTax)}</span></div>
  <div class="frow"><span class="d">760</span>
    <span class="t">${esc(tax.provinceName)} tax</span>
    <span class="f num">${dollars(tax.provincialTax)}</span></div>
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
`, email, '/year-end', chrome);
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
  available: number, kind: 'eligible' | 'nonEligible', chrome: Chrome = {},
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
`, email, '/compensation', chrome);
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
  years: number[], year: number, t4s: T4[], t5: T5, deadline: string,
  run: PayrollRun | null, advice: RemitterAdvice | null, eht: Eht | null,
  employees: Employee[], ledgerSalary: number, error?: string,
  chrome: Chrome = {},
): string {
  const boxes = (rows: SlipBox[]) => rows.map((b) => `<div class="frow">
    <span class="d">${b.box}</span>
    <span class="t">${esc(b.label)}${b.note ? `<span class="sub">${esc(b.note)}</span>` : ''}</span>
    <span class="f num">${dollars(b.amount)}</span></div>`).join('');

  const registered = employees.reduce((t, e) => t + e.annualSalary, 0);
  const anySalary = t4s.some((t) => t.boxes.some((b) => b.box === '14' && b.amount !== 0));
  const nothing = !anySalary && t5.boxes.every((b) => b.amount === 0);
  const drift = employees.length && ledgerSalary ? registered - ledgerSalary : 0;

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

<h2 class="sec">Who is on the payroll</h2>
<p class="hint">Needed once more than one person is paid, because a single salary
total cannot be split back into separate slips. Voting shares decide EI: over 40%
and the employment is not insurable, whatever anybody would prefer.</p>

${error ? `<div class="err">${esc(error)}</div>` : ''}

<form method="post" action="/employees" class="txn-form">
  <div class="txn-grid">
    <div class="field"><label for="e-name">Name</label>
      <input id="e-name" name="name" type="text" required placeholder="A. Director"></div>
    <div class="field"><label for="e-salary">Annual salary</label>
      <input id="e-salary" name="salary" type="text" inputmode="decimal" required placeholder="60000"></div>
    <div class="field"><label for="e-shares">Voting shares held</label>
      <input id="e-shares" name="shares" type="text" inputmode="decimal" value="0" placeholder="%"></div>
    <div class="field"><label for="e-freq">Paid</label>
      <select id="e-freq" name="frequency">
        <option value="monthly">Monthly</option>
        <option value="semi-monthly">Twice a month</option>
        <option value="biweekly">Every two weeks</option>
        <option value="weekly">Weekly</option>
      </select></div>
    <div class="field"><button class="btn primary" type="submit">Add</button></div>
  </div>
</form>

${employees.length ? `<div class="sheet">
  <div class="sheet-head"><span>Register</span><span>${employees.length} on payroll</span></div>
  ${run!.lines.map((l) => `<div class="frow">
    <span class="d">${l.employee.votingSharePct}%</span>
    <span class="t">${esc(l.employee.name)}
      <span class="sub">${dollars(l.annualSalary)} a year &middot; ${esc(l.deductions.frequency)}
      &middot; ${l.insurable ? 'insurable, EI applies' : 'not insurable, no EI'}</span></span>
    <span class="f num">${dollars(l.deductions.netPay)}<span class="sub">net per period</span></span>
    <form method="post" action="/employees/delete">
      <input type="hidden" name="id" value="${esc(l.employee.id)}">
      <button class="btn small" type="submit">Remove</button></form>
  </div>`).join('')}
</div>` : ''}

${drift !== 0 ? `<div class="advisory"><b>The register and the ledger disagree by
  ${dollars(Math.abs(drift))}.</b> The register says ${dollars(registered)} of salary
  for the year and the salaries account says ${dollars(ledgerSalary)}. One of them is
  wrong, and the slips are built on the register.</div>` : ''}

${run?.questions.map((q) => `<div class="advisory info">${esc(q)}</div>`).join('') ?? ''}

${t4s.filter((t) => t.boxes.some((b) => b.box === '14' && b.amount !== 0)).map((t) => `
<h2 class="sec">T4${t.name ? `, ${esc(t.name)}` : ', statement of remuneration paid'}</h2>
<div class="sheet">
  <div class="sheet-head"><span>${year}</span><span>T4</span></div>
  ${boxes(t.boxes)}
</div>
<div class="sheet">
  <div class="sheet-head"><span>For the T4 Summary</span><span>Employer share</span></div>
  <div class="frow"><span class="d">27</span>
    <span class="t">Employer CPP contributions
      <span class="sub">Matches box 16 and 16A together.</span></span>
    <span class="f num">${dollars(t.employerCpp)}</span></div>
  ${t.employerEi ? `<div class="frow"><span class="d">19</span>
    <span class="t">Employer EI premiums
      <span class="sub">1.4 times box 18. The one payroll contribution that is not matched.</span></span>
    <span class="f num">${dollars(t.employerEi)}</span></div>` : ''}
</div>`).join('')}
${(t4s[0]?.notes ?? []).map((n) => `<div class="advisory info">${esc(n)}</div>`).join('')}

${run && run.periodRemittance ? `
<h2 class="sec">What to remit</h2>
<p class="hint">One PD7A covers the whole payroll, not one per person. Income tax is
annualised the way CRA's own formula does it, so the withholdings add up to the
year's tax instead of leaving a balance in April.</p>
<div class="sheet">
  <div class="sheet-head"><span>Per pay period, everybody</span><span>PD7A</span></div>
  ${run.lines.map((l) => `<div class="frow">
    <span class="t">${esc(l.employee.name)}
      <span class="sub">tax ${dollars(l.deductions.incomeTax)} &middot;
      CPP ${dollars(l.deductions.cpp + l.deductions.cpp2)} both halves ${dollars((l.deductions.cpp + l.deductions.cpp2) * 2)}${
        l.deductions.ei ? ` &middot; EI ${dollars(l.deductions.ei)} plus employer ${dollars(l.deductions.employerEi)}` : ''}</span></span>
    <span class="f num">${dollars(l.deductions.remittance)}</span></div>`).join('')}
  <div class="frow total"><span class="t"><b>Remit to CRA</b>
    <span class="sub">Income tax, both halves of CPP, both halves of EI.</span></span>
    <span class="f num"><b>${dollars(run.periodRemittance)}</b></span></div>
</div>
<div class="advisory"><b>Late is expensive out of proportion.</b>
  The penalty is a percentage of the whole remittance rather than of any shortfall,
  starting at 3% from the first day late and reaching 10%. On this remittance one
  day late costs ${dollars(Math.round(run.periodRemittance * 0.03))}.</div>
${advice?.warning ? `<div class="advisory">${esc(advice.warning)}</div>` : ''}` : ''}

${eht ? `
<h2 class="sec">Employer health tax</h2>
<p class="hint">Ontario's, not CRA's, which is why it arrives from a direction nobody
is watching. Most small corporations owe nothing and still have to file.</p>
<div class="sheet">
  <div class="sheet-head"><span>Ontario remuneration ${year}</span><span>EHT</span></div>
  <div class="frow"><span class="t">Total remuneration</span>
    <span class="f num">${dollars(eht.remuneration)}</span></div>
  <div class="frow"><span class="t">Less the exemption</span>
    <span class="f num">-${dollars(eht.exemptionClaimed)}</span></div>
  <div class="frow"><span class="t">Taxable at ${(eht.rate * 100).toFixed(3)}%
    <span class="sub">The rate band is set by total remuneration before the exemption, then applied to what is left after it.</span></span>
    <span class="f num">${dollars(eht.taxable)}</span></div>
  <div class="frow total"><span class="t"><b>Employer health tax</b></span>
    <span class="f num"><b>${dollars(eht.tax)}</b></span></div>
</div>
<div class="advisory info">${esc(eht.note)}</div>
${eht.instalmentsRequired ? '<div class="advisory">Payroll is over $1.2 million, so this is paid in monthly instalments rather than once a year.</div>' : ''}` : ''}

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
`, email, '/slips', chrome);
}

// ------------------------------------------------------------------ billing

export function billingPage(
  email: string, state: { allowed: boolean; reason: string; trialDaysLeft: number },
  sub: Subscription | null, hasCustomer: boolean, trialEndsAt: string | null,
  monthly: number, yearly: number, planLabel: string,
  justPaid: boolean, error?: string,
  chrome: Chrome = {},
): string {
  const when = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

  return shell('Billing', `
<div class="narrow">
<span class="label">Billing</span>
<h1>${sub ? 'Your subscription.' : 'Keep using FileClear.'}</h1>

${justPaid ? '<div class="ok"><b>Thank you.</b> Your subscription is active. If this page '
  + 'still shows a trial, give it a moment: Stripe confirms it in the background.</div>' : ''}
${error ? `<div class="err">${esc(error)}</div>` : ''}

${sub ? `<div class="sheet">
  <div class="sheet-head"><span>Status</span><span>${esc(sub.status)}</span></div>
  <div class="frow"><span class="t">Plan</span>
    <span class="f num">${esc(planLabel)}</span></div>
  <div class="frow"><span class="t">${sub.cancelAtPeriodEnd ? 'Runs until' : 'Renews on'}
    <span class="sub">${sub.cancelAtPeriodEnd
      ? 'Cancelled. Everything keeps working until this date, which is what the terms promise.'
      : 'Cancel any time; cancelling stops the next renewal.'}</span></span>
    <span class="f num">${sub.currentPeriodEnd ? when(sub.currentPeriodEnd) : '&mdash;'}</span></div>
</div>` : ''}

${state.reason === 'trial' ? `<div class="advisory"><b>${state.trialDaysLeft}
  day${state.trialDaysLeft === 1 ? '' : 's'} left in your trial.</b>
  It ends on ${esc(trialEndsAt ?? '')}. Nothing is locked until then, and no card is
  needed to keep looking around.</div>` : ''}

${!state.allowed ? `<div class="advisory"><b>Your trial has ended.</b>
  The calendar and reminders keep running. The screens that compute money, the HST
  return, the year end and the slips, need a subscription.</div>` : ''}

${!sub ? `<div class="two">
  <div class="sheet">
    <div class="sheet-head"><span>Monthly</span><span>CAD</span></div>
    <div class="frow"><span class="t"><b style="font-size:1.6rem">$${(monthly / 100).toFixed(0)}</b>
      <span class="sub">a month, every corporation you own</span></span></div>
    <form method="post" action="/billing/checkout" style="padding:0 1.25rem 1.25rem">
      <input type="hidden" name="plan" value="monthly">
      <button class="btn primary" type="submit">Subscribe monthly</button>
    </form>
  </div>
  <div class="sheet">
    <div class="sheet-head"><span>Yearly</span><span>two months free</span></div>
    <div class="frow"><span class="t"><b style="font-size:1.6rem">$${(yearly / 100).toFixed(0)}</b>
      <span class="sub">a year, every corporation you own</span></span></div>
    <form method="post" action="/billing/checkout" style="padding:0 1.25rem 1.25rem">
      <input type="hidden" name="plan" value="yearly">
      <button class="btn primary" type="submit">Subscribe yearly</button>
    </form>
  </div>
</div>` : ''}

${hasCustomer ? `<form method="post" action="/billing/portal" style="margin-top:1.5rem">
  <button class="btn" type="submit">Manage billing, cards and invoices</button>
</form>` : ''}

<div class="advisory info"><b>Your card never touches FileClear.</b>
  It is entered on Stripe's own page and what comes back here is an identifier.
  Cancelling stops the next renewal and leaves everything running to the end of
  the period you have paid for.</div>
</div>`, email, '/billing', chrome);
}

// ---------------------------------------------------------- password reset

/** Asking for a link. */
export function forgotPage(sent = false, email = '', error?: string): string {
  return shell('Reset your password', `
<div class="auth">
  <span class="label">FileClear</span>
  <h1>${sent ? 'Check your email.' : 'Forgotten password'}</h1>
  ${sent
    ? `<p class="hint">If ${esc(email)} has an account here, a link is on its way.
       It works once and stops working in an hour.</p>
       <p class="hint">Nothing arrived? Check the address, and look in spam. We do not
       say whether an address has an account, so this page looks the same either way.</p>
       <p><a href="/signin">Back to sign in</a></p>`
    : `<p class="hint">We will send a link that lets you choose a new one.</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="/forgot">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="username"
            value="${esc(email)}">
        </div>
        <button class="btn primary" type="submit">Send the link</button>
      </form>
      <p class="hint" style="margin-top:1.4rem"><a href="/signin">Back to sign in</a></p>`}
</div>`);
}

/** Choosing a new one. */
export function resetPage(token: string, error?: string, dead = false): string {
  return shell('Choose a new password', `
<div class="auth">
  <span class="label">FileClear</span>
  ${dead
    ? `<h1>That link has expired.</h1>
       <p class="hint">Reset links work once and last an hour. Ask for a fresh one and
       it will arrive in a moment.</p>
       <p><a class="btn primary" href="/forgot">Send me another</a></p>`
    : `<h1>Choose a new password.</h1>
       <p class="hint">Signing in everywhere else will stop working, which is the point
       if somebody else had your old one.</p>
       ${error ? `<div class="err">${esc(error)}</div>` : ''}
       <form method="post" action="/reset">
         <input type="hidden" name="token" value="${esc(token)}">
         <div class="field">
           <label for="password">New password</label>
           <input id="password" name="password" type="password" required
             autocomplete="new-password" minlength="10">
           <span class="sub">At least ten characters.</span>
         </div>
         <button class="btn primary" type="submit">Set it and sign in</button>
       </form>`}
</div>`);
}

// -------------------------------------------------------- importing a file

/** The upload step, and where an unreadable file reports back to. */
export function importPage(
  email: string, companyName: string, error?: string, chrome: Chrome = {},
): string {
  return shell(`${companyName} import`, `
<span class="label">${esc(companyName)} &middot; books</span>
<h1>Import a bank export.</h1>
<p class="hint">A CSV from your bank or card. FileClear works out which column is
which rather than asking you, and nothing is written until you have looked at it.</p>

${error ? `<div class="err">${esc(error)}</div>` : ''}

<form method="post" action="/books/import" enctype="multipart/form-data" class="txn-form">
  <div class="field">
    <label for="file">The file</label>
    <input id="file" name="file" type="file" accept=".csv,text/csv" required>
    <span class="sub">Most banks call this "Download transactions" or "Export to CSV".</span>
  </div>
  <div class="field">
    <label for="order">If the dates could be read either way round</label>
    <select id="order" name="order">
      <option value="">Work it out from the file</option>
      <option value="dmy">Day first, 03/04 is 3 April</option>
      <option value="mdy">Month first, 03/04 is 4 March</option>
    </select>
    <span class="sub">Only needed when nothing in the file settles it, and you
    will be told if that happens.</span>
  </div>
  <button class="btn primary" type="submit">Read the file</button>
</form>

<p class="hint"><a href="/books">Back to the books</a></p>
`, email, '/books', chrome);
}

/**
 * The preview.
 *
 * Everything is editable before it is written, because a bank export is
 * somebody else's data in somebody else's format and the step between reading
 * it and trusting it is a person looking at it. A row that guessed is marked as
 * a guess, and a row already in the ledger arrives unticked.
 */
export function importPreviewPage(
  email: string, companyName: string, preview: ImportPreview, payload: string,
  chrome: Chrome = {},
): string {
  const options = (selected: string) => IMPORTABLE_ACCOUNTS.map((a) =>
    `<option value="${a.id}"${a.id === selected ? ' selected' : ''}>${esc(a.name)}</option>`).join('');

  const duplicates = preview.rows.filter((r) => r.duplicate).length;

  return shell(`${companyName} import`, `
<span class="label">${esc(companyName)} &middot; books</span>
<h1>${preview.rows.length} row${preview.rows.length === 1 ? '' : 's'} read.</h1>
<p class="hint">Nothing has been written yet. Check the accounts, untick anything
you do not want, and the ones you correct will be remembered for next time.</p>

<div class="stats">
  <div class="stat"><b>${dollars(preview.moneyIn)}</b><span>in</span></div>
  <div class="stat"><b>${dollars(preview.moneyOut)}</b><span>out</span></div>
  <div class="stat"><b>${preview.rows.length}</b><span>rows</span></div>
</div>

${duplicates ? `<div class="advisory"><b>${duplicates} row${duplicates === 1 ? ' is' : 's are'}
  already in your books.</b> They are unticked below. Importing the same statement
  twice is the commonest way a ledger ends up double counting.</div>` : ''}

${preview.problems.length ? `<div class="advisory info">
  <b>${preview.problems.length} row${preview.problems.length === 1 ? '' : 's'} could not be read</b>
  and ${preview.problems.length === 1 ? 'is' : 'are'} left out:
  ${preview.problems.slice(0, 5).map((p) => `line ${p.line}, ${esc(p.why.toLowerCase())}`).join('; ')}
  ${preview.problems.length > 5 ? ` and ${preview.problems.length - 5} more` : ''}</div>` : ''}

<form method="post" action="/books/import/confirm">
  <input type="hidden" name="payload" value="${esc(payload)}">
  <div class="sheet">
    <div class="sheet-head"><span>What will be written</span><span>${esc(preview.dateOrder)}</span></div>
    ${preview.rows.map((r, i) => `<div class="frow${r.duplicate ? ' done' : ''}">
      <span class="d">
        <input type="checkbox" name="take" value="${i}"${r.duplicate ? '' : ' checked'}
          aria-label="Import this row">
        ${esc(r.date)}</span>
      <span class="t">${esc(r.description || '(no description)')}
        <span class="sub">${dollars(Math.abs(r.signed))} ${r.signed < 0 ? 'out' : 'in'}${
          r.hst ? ` &middot; ${dollars(r.amount)} plus ${dollars(r.hst)} HST` : ''}${
          r.reason === 'direction' ? ' &middot; guessed from the direction only' : ''}${
          r.reason === 'remembered' ? ' &middot; remembered' : ''}${
          r.reason === 'suggested' ? ' &middot; suggested, worth a look' : ''}</span></span>
      <span class="f">
        <select name="account-${i}" aria-label="Account">${options(r.accountId)}</select>
      </span>
    </div>`).join('')}
  </div>
  <button class="btn primary" type="submit">Write these to the books</button>
  <a class="btn" href="/books/import">Start again</a>
</form>
`, email, '/books', chrome);
}

// ------------------------------------------------------------- onboarding

/**
 * Setting a corporation up, a few questions at a time.
 *
 * It used to be thirty three fields in six groups on one page, three and a half
 * screens long, headed "Step 1 of 1". Everything the product knows how to ask
 * was asked before it had shown anybody anything, which is the wrong way round:
 * a person who has just signed up has no evidence yet that any of it is worth
 * the typing.
 *
 * So the questions are ordered by what they buy. Four answers produce a
 * calendar, and the calendar is visible before the next question is asked.
 * Nothing here is skipped, it is sequenced, and the fields that only matter at
 * year end are defaulted and left for the company page.
 */
export interface Step { n: number; title: string; blurb: string; }

export const ONBOARDING_STEPS: Step[] = [
  { n: 1, title: 'The corporation',
    blurb: 'Where it was incorporated and when its year ends. These four answers '
      + 'are enough to build your calendar.' },
  { n: 2, title: 'HST',
    blurb: 'Whether you are registered, and how often you file. This decides which '
      + 'returns appear and when.' },
  { n: 3, title: 'How you take money out',
    blurb: 'Salary, dividends, or neither yet. Payroll adds a remittance every '
      + 'month and a slip every February.' },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const PROVINCE_NAMES: [string, string][] = [
  ['ON', 'Ontario'], ['BC', 'British Columbia'], ['AB', 'Alberta'],
  ['SK', 'Saskatchewan'], ['MB', 'Manitoba'], ['QC', 'Quebec'],
  ['NB', 'New Brunswick'], ['NS', 'Nova Scotia'], ['PE', 'Prince Edward Island'],
  ['NL', 'Newfoundland and Labrador'], ['YT', 'Yukon'],
  ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
];

function progress(step: number): string {
  return `<div class="steps">
    ${ONBOARDING_STEPS.map((s) => `<div class="step${
      s.n < step ? ' done' : s.n === step ? ' now' : ''}">
      <span class="step-n">${s.n < step ? '&check;' : s.n}</span>
      <span class="step-t">${esc(s.title)}</span>
    </div>`).join('')}
  </div>`;
}

export function onboardingStepPage(
  email: string, step: number, p: CompanyProfile, error?: string,
  welcomed = false, chrome: Chrome = {},
): string {
  const here = ONBOARDING_STEPS.find((s) => s.n === step) ?? ONBOARDING_STEPS[0]!;
  const sel = (v: boolean) => (v ? ' checked' : '');

  const body = step === 1 ? `
    <div class="field">
      <label for="legalName">Legal name</label>
      <input id="legalName" name="legalName" type="text" required autofocus
        value="${esc(p.legalName)}" placeholder="Antipode Technologies Inc.">
      <span class="sub">Exactly as it appears on your certificate of incorporation.</span>
    </div>
    <div class="row2">
      <div class="field">
        <label for="jurisdiction">Where incorporated</label>
        <select id="jurisdiction" name="jurisdiction">
          <option value="CBCA"${p.jurisdiction === 'CBCA' ? ' selected' : ''}>Federal (Canada)</option>
          ${PROVINCE_NAMES.map(([c, n]) => `<option value="${c}"${
            p.jurisdiction === c ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
        <span class="sub">Federal corporations file an annual return 60 days after
        their incorporation anniversary. Provincial ones file on the fiscal year.</span>
      </div>
      <div class="field">
        <label for="incorporationDate">Date of incorporation</label>
        <input id="incorporationDate" name="incorporationDate" type="date" required
          value="${esc(p.incorporationDate)}">
        <span class="sub">On the certificate. It sets your first tax year.</span>
      </div>
    </div>
    <div class="field">
      <label for="fyeMonth">Fiscal year end</label>
      <div class="row2">
        <select id="fyeMonth" name="fyeMonth">
          ${MONTH_NAMES.map((m, i) => `<option value="${i + 1}"${
            p.fiscalYearEnd.month === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}
        </select>
        <input name="fyeDay" type="number" min="1" max="31" required
          value="${p.fiscalYearEnd.day}" aria-label="Day of the month">
      </div>
      <span class="sub">Not necessarily 31 December. Whatever you chose when you
      filed your first return is the one that counts.</span>
    </div>`
    : step === 2 ? `
    <div class="check">
      <input id="hstRegistered" name="hstRegistered" type="checkbox"${sel(p.hst.registered)}>
      <label for="hstRegistered">The corporation has an HST number</label>
    </div>
    <p class="hint">Registration is required once taxable supplies pass $30,000 in
    four consecutive quarters. Below that it is optional, and often still worth it
    because it lets you claim the HST you pay.</p>
    <div class="field">
      <label for="hstPeriod">How often you file</label>
      <select id="hstPeriod" name="hstPeriod">
        <option value="annual"${p.hst.period === 'annual' ? ' selected' : ''}>Once a year</option>
        <option value="quarterly"${p.hst.period === 'quarterly' ? ' selected' : ''}>Every quarter</option>
        <option value="monthly"${p.hst.period === 'monthly' ? ' selected' : ''}>Every month</option>
      </select>
      <span class="sub">CRA assigns this from your taxable supplies. Annual up to
      $1.5M, quarterly to $6M, monthly above that. It is on your registration letter.</span>
    </div>
    <div class="field">
      <label for="hstMethod">How you work the return out</label>
      <select id="hstMethod" name="hstMethod">
        <option value="regular"${p.hst.method === 'regular' ? ' selected' : ''}>Regular, claiming what you paid</option>
        <option value="quick"${p.hst.method === 'quick' ? ' selected' : ''}>Quick Method, a flat rate</option>
      </select>
      <span class="sub">Not sure? Leave it on regular. FileClear computes both ways
      every time and shows you which would have cost less.</span>
    </div>`
    : `
    <div class="check">
      <input id="payrollAccount" name="payrollAccount" type="checkbox"${sel(p.payroll.hasAccount)}>
      <label for="payrollAccount">Somebody is paid a salary, including you</label>
    </div>
    <p class="hint">A salary means an RP account with CRA, a remittance every month,
    and a T4 each February. If you only take dividends, leave this unticked.</p>
    <div class="check">
      <input id="paysDividends" name="paysDividends" type="checkbox"${sel(p.paysDividends)}>
      <label for="paysDividends">Dividends are paid to shareholders</label>
    </div>
    <p class="hint">Dividends produce a T5 by the last day of February. Nothing is
    withheld during the year.</p>
    <fieldset>
      <legend>Where you have a permanent establishment</legend>
      <p class="hint">An office, a warehouse, somewhere you actually operate from.
      It decides which province taxes you, and usually it is just the one.</p>
      <div class="pe-grid">
        ${PROVINCE_NAMES.map(([c, n]) => `<div class="check">
          <input id="pe-${c}" name="pe" type="checkbox" value="${c}"${
            p.permanentEstablishments.includes(c as never) ? ' checked' : ''}>
          <label for="pe-${c}">${n}</label></div>`).join('')}
      </div>
    </fieldset>`;

  return shell(`Set up, step ${step}`, `
<div class="narrow">
  ${welcomed ? `<div class="ok"><b>Account created.</b> A confirmation is on its way to
    ${esc(email)}. If it does not arrive, check the address is right before you rely
    on reminders, because that is where they will go.</div>` : ''}

  ${progress(step)}

  <h1>${esc(here.title)}</h1>
  <p class="hint">${esc(here.blurb)}</p>

  ${error ? `<div class="err">${esc(error)}</div>` : ''}

  <form method="post" action="/onboarding?step=${step}">
    ${body}
    <div class="step-actions">
      <button class="btn primary" type="submit">${
        step === ONBOARDING_STEPS.length ? 'Build my calendar' : 'Continue'}</button>
      ${step > 1
        ? `<a class="btn" href="/onboarding?step=${step - 1}">Back</a>`
        : ''}
      ${step > 1
        ? '<a class="step-skip" href="/dashboard">Finish later</a>'
        : ''}
    </div>
  </form>

  ${step === 1 ? '<p class="step-foot">Four answers and your calendar exists. '
    + 'Everything else can wait, and none of it is needed to see what you owe.</p>' : ''}
</div>`, email, '', { ...chrome, hideNav: true });
}
