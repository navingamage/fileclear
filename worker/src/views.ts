import { words, type CompanyProfile, type EntityType } from './rules/profile';
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
  /**
   * What the active company is, so the navigation matches it.
   *
   * A sole proprietor has no compensation question to answer and no T2 to
   * work towards, and a corporation is not deciding whether to incorporate.
   * Showing every link to everybody would put four screens in front of each
   * that say "this does not apply to you", which is the shape of a product
   * that was extended rather than built for both.
   */
  entityType?: EntityType;
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
  .app-in { display: flex; align-items: center; gap: 1.4rem; padding: .9rem 0;
    flex-wrap: wrap; row-gap: .6rem; }
  .brand { display: flex; align-items: center; gap: .55rem; color: var(--ink);
    font-family: var(--font-display); font-weight: 800; font-size: 1.1rem;
    letter-spacing: -.04em; }
  .brand:hover { text-decoration: none; }
  .brand img { width: 30px; height: 30px; border-radius: 8px; }
  .app-nav { display: flex; gap: 1.3rem; margin-left: 1rem; }
  /* "Year end" was breaking across two lines and taking the header's height
     with it. A navigation item is a label, not a paragraph. */
  .app-nav a { color: var(--muted); font-size: .95rem; font-weight: 500;
    white-space: nowrap; }
  .app-nav a:hover { color: var(--ink); text-decoration: none; }
  .app-nav a.on { color: var(--ink); font-weight: 600; }
  .app-right { margin-left: auto; display: flex; align-items: center; gap: .9rem;
    font-size: .9rem; color: var(--muted); }
  /* Below this the navigation moves to a row of its own and scrolls sideways.
     It used to be display:none with nothing in its place, so on a phone a
     signed in person could reach the dashboard through the logo and no other
     screen at all: not the books, not the HST return, not their own company
     details. Hiding navigation is only a reasonable answer when something
     replaces it. */
  @media (max-width: 860px) {
    .app-nav {
      order: 3; width: 100%; margin-left: 0;
      overflow-x: auto; overscroll-behavior-x: contain;
      padding-bottom: .15rem;
      /* The bar is short and the overflow is obvious from the cut off item, so
         a scrollbar under seven links is noise. */
      scrollbar-width: none; -ms-overflow-style: none;
    }
    .app-nav::-webkit-scrollbar { display: none; }
    .app-in { padding-bottom: .5rem; }
  }
  /* The address is who you are signed in as, which matters on a shared machine
     and not much otherwise. On a phone it was wrapping to two lines and pushing
     the sign out button off the screen entirely. */
  @media (max-width: 620px) { .app-right span { display: none; } }
  .app-right span { max-width: 18rem; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; }

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
  /* The explanation under a checkbox was running on from its own label, so
     "I trade under a name that is not my own" and the sentence explaining why
     it matters read as one ungrammatical line. Only .field .sub was styled, and
     every checkbox on the company page carries one. */
  .check .sub { display: block; color: var(--muted); font-size: .85rem;
    font-weight: 400; margin-top: .2rem; line-height: 1.45; }

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
  /* Prose inside a card. Rows bring their own padding; a paragraph does not,
     and .sheet clips its overflow, so text put straight into one sat against
     the border with nothing between. */
  .sheet-body { padding: 1.1rem 1.25rem; }
  .sheet-body p:last-child { margin-bottom: 0; }
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

    /* A filing row carries four things and a button, which two columns cannot
       hold. Collapsing to two put the date beside a two line title and then
       auto-placed the button onto a row of its own on the left, under nothing,
       while align-items:center floated the date halfway down the title. So on
       a phone it stacks deliberately: the date, then what it is, then the form
       and the button side by side. */
    .frow.filing {
      grid-template-columns: 1fr auto;
      gap: .3rem .9rem;
      align-items: start;
      padding: .9rem 1rem;
    }
    .frow.filing .d,
    .frow.filing .t { grid-column: 1 / -1; }
    .frow.filing .f { grid-column: 1; align-self: center; }
    .frow.filing .file-actions { grid-column: 2; justify-self: end; }

    /* A statement line is a label and a number, and the number belongs beside
       the label on any width. The generic rule above forces .f into the second
       column, which on a three column GIFI row dropped every amount onto a line
       of its own: the same bug that was fixed for desktop and reintroduced
       here. */
    .two .frow,
  /* A label and a figure in a full width card. Without this the default four
     column row leaves its last track empty and the number stops short of the
     edge it should be aligned to. */
  .frow.pair { grid-template-columns: 1fr auto; }
    .two .frow .f { grid-column: auto; }
    .two .frow.gifi { grid-template-columns: 2.8rem 1fr auto; }
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
  .txn-grid { display: grid;
    grid-template-columns: 9.5rem minmax(0,1.2fr) 7.5rem 7.5rem minmax(0,1fr) minmax(0,1.2fr) auto;
    gap: .7rem; align-items: end; }
  .txn-grid .field { margin: 0; }
  .txn-grid .field:last-child { align-self: end; }
  /* One height for everything on the entry row. A date input, a select and a
     button each have their own intrinsic height, which left the row sitting on
     three slightly different baselines. */
  .txn-grid input, .txn-grid select, .txn-grid .btn { height: 2.6rem; }
  .txn-grid label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

  /* A ledger row.
     Six columns for six things, because the previous version laid five out in a
     four column grid and the remove button wrapped onto a line of its own,
     making every row 125px tall. */
  .brow { display: grid;
    grid-template-columns: 4.2rem minmax(0, 1.6fr) minmax(0, 1fr) 7rem 5.5rem 1.6rem;
    gap: .9rem; align-items: center; padding: .5rem 1.25rem;
    border-bottom: 1px solid var(--line); }
  .brow:last-child { border-bottom: 0; }
  .brow form { margin: 0; }
  .brow.head { background: var(--band); border-bottom: 1px solid var(--line);
    font-family: var(--font-mono); font-size: .68rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); padding: .7rem 1.25rem; }
  .brow-d { font-family: var(--font-mono); font-size: .8rem; color: var(--muted);
    font-variant-numeric: tabular-nums; white-space: nowrap; }
  .brow-a { font-size: .93rem; font-weight: 500; min-width: 0; }
  .brow-desc { display: block; font-weight: 400; font-size: .82rem; color: var(--muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .brow-c { font-size: .85rem; color: var(--muted); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  .brow-n { font-family: var(--font-mono); font-size: .86rem; text-align: right;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
  /* Money in is full strength ink and a plus sign; money out is quieter. It
     used to be brand red, and tokens.css permits red to be brand and overdue
     at once only because "the two never share a surface". In a ledger they
     share a column: +18,500.00 in red above -1,450.00 in plain text reads as
     though the income were the problem. The sign carries the direction and the
     weight carries the emphasis, neither of which can be misread. */
  .brow-n { color: var(--muted); }
  .brow-n.in { color: var(--ink); font-weight: 600; }
  .brow-n.hst { color: var(--muted); font-size: .8rem; }
  /* A quiet cross rather than a button: removing a row is rare, and a button
     per row competes with the figures for attention. */
  .brow-x { border: 0; background: none; cursor: pointer; color: var(--muted);
    font-size: 1.1rem; line-height: 1; padding: .2rem .35rem; border-radius: 6px; }
  .brow-x:hover { background: var(--danger-tint); color: var(--danger); }

  /* Months, grouped the way the filing calendar groups them. */
  .brow-month { display: flex; align-items: baseline; gap: .8rem;
    padding: .8rem 1.25rem; background: var(--band);
    border-bottom: 1px solid var(--line); border-top: 1px solid var(--line);
    font-family: var(--font-mono); font-size: .72rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); }
  .brow-month .brow-net { margin-left: auto; font-size: .82rem; letter-spacing: 0;
    font-variant-numeric: tabular-nums; text-transform: none; }
  .brow-month .brow-net.up { color: var(--ink); font-weight: 600; }
  .brow-month .brow-net.down { color: var(--ink-2); }

  @media (max-width: 900px) {
    .brow { grid-template-columns: 3.8rem minmax(0, 1fr) 6rem 1.4rem; }
    .brow.head, .brow-c, .brow-n.hst { display: none; }
  }

  /* On a phone the four columns above leave about 120 pixels for the account,
     which put "Meals and entertainment" on three lines and cut every
     description down to "Client re...". A description you cannot read is not
     worth the row it sits on, since it is the only thing distinguishing one
     retainer from the next.
     
     So the delete control moves to a second line and gives its width back to
     the two things that carry meaning. */
  @media (max-width: 560px) {
    .brow {
      grid-template-columns: 3.4rem minmax(0, 1fr) auto;
      gap: .15rem .7rem;
      align-items: baseline;
      padding: .6rem 1rem;
    }
    .brow-d { grid-column: 1; grid-row: 1; }
    /* Spanning both rows rather than sitting in the first is what stops the
       delete control adding a line of its own: it drops to the bottom of the
       account block instead, beside the description. */
    .brow-a { grid-column: 2; grid-row: 1 / 3; }
    .brow-n { grid-column: 3; grid-row: 1; }
    .brow form { grid-column: 3; grid-row: 2; justify-self: end; align-self: end; }
    .brow-month { padding: .7rem 1rem; }
  }

  .why-books { margin: 1.4rem 0 1.8rem; }
  .why-books summary { cursor: pointer; font-size: .89rem; color: var(--muted); }
  .why-books p { margin: .7rem 0 0; font-size: .92rem; color: var(--ink-2);
    max-width: 66ch; line-height: 1.6; }

  .empty-books { padding: 2rem 1.5rem; }
  .empty-books p { margin: 0 0 .9rem; max-width: 54ch; color: var(--ink-2); }
  .empty-books p:last-child { margin-bottom: 0; }

  /* Folded away, because a note is read once and then known. */
  .notes { margin: 1rem 0 1.8rem; border-top: 1px solid var(--line); padding-top: .9rem; }
  .notes summary { cursor: pointer; font-size: .88rem; color: var(--muted); }
  .notes p { margin: .8rem 0 0; font-size: .92rem; line-height: 1.6; color: var(--ink-2);
    max-width: 72ch; }

  .worksheet-foot { margin: 2.4rem 0 0; padding-top: 1.2rem;
    border-top: 1px solid var(--line); font-size: .86rem; color: var(--muted);
    max-width: 72ch; line-height: 1.6; }

  /* The one figure a screen exists to produce, against the ones supporting it. */
  .stat.lead { background: var(--ink); border-color: var(--ink); }
  .stat.lead b, .stat.lead span { color: var(--primary-ink); }
  .stat.lead span { opacity: .75; }

  /* A short question row, sized to its own fields rather than borrowing the
     ledger's seven column grid, which truncated every label it was given. */
  .ask-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, auto));
    gap: .8rem; align-items: end; justify-content: start; }
  .ask-grid.wide { grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); }
  .ask-grid .field { margin: 0; min-width: 0; }
  .ask-grid input, .ask-grid select, .ask-grid .btn { height: 2.6rem; }
  @media (max-width: 620px) { .ask-grid { grid-template-columns: 1fr; } }

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
  .two .frow,
  /* A label and a figure in a full width card. Without this the default four
     column row leaves its last track empty and the number stops short of the
     edge it should be aligned to. */
  .frow.pair { grid-template-columns: 1fr auto; }
  /* A GIFI line carries its code in front of the name, so it needs the third
     column back. Without this the amount wrapped to a line of its own and every
     statement row stood 90 pixels tall. */
  .two .frow.gifi { grid-template-columns: 3.2rem 1fr auto; }
  .frow.gifi .d { font-size: .76rem; }
  .verdict { margin: 1.5rem 0; padding: 1.1rem 1.3rem; border-radius: 16px;
    background: var(--band); font-size: .97rem; }
  .verdict.good { background: var(--brand-tint); }
  .verdict b { display: block; margin-bottom: .25rem; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 1rem;
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

  /* Two choices, each big enough to read before choosing. A radio button with
     a label beside it makes the more consequential question on the form look
     like the least consequential thing on the screen. */
  .pick { display: grid; gap: .9rem; margin-bottom: 1.8rem; }
  @media (min-width: 720px) { .pick { grid-template-columns: 1fr 1fr; } }
  .pick-card { display: block; cursor: pointer; padding: 1.15rem 1.25rem;
    border: 1px solid var(--line); border-radius: 16px; background: var(--band); }
  .pick-card.on, .pick-card:has(input:checked) {
    border-color: var(--brand); box-shadow: var(--shadow-lg); }
  .pick-card:has(input:focus-visible) { outline: 2px solid var(--brand); outline-offset: 2px; }
  .pick-card input { margin-right: .5rem; }
  .pick-card b { font-size: 1.02rem; }
  .pick-card span { display: block; margin-top: .4rem; color: var(--muted);
    font-size: .89rem; line-height: 1.5; }

  /* The two actions on a filing row sit together, so the grid still has one
     cell for them and nothing shifts on a phone. */
  .file-actions { display: flex; gap: .4rem; align-items: center; }
  .filed-note { color: var(--ok, var(--brand)); }

  /* Filing: numbered steps, one thing each. */
  .file-steps { margin: 1.6rem 0 2rem; }
  .file-step { display: grid; grid-template-columns: 2.2rem 1fr; gap: .9rem;
    padding: 1.2rem 0; border-top: 1px solid var(--line); }
  .file-step:first-child { border-top: 0; }
  .file-step h3 { margin-bottom: .5rem; }
  .file-n { width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center;
    background: var(--band); border: 1px solid var(--line); font-family: var(--font-mono);
    font-size: .85rem; color: var(--brand); }
  /* The line number hangs in its own column so the name and every note under
     it start at the same edge, rather than the notes running back under the
     number. */
  .file-line .t { position: relative; padding-left: 2.9rem; }
  .file-ln { position: absolute; left: 0; top: .1rem; font-family: var(--font-mono);
    font-size: .8rem; color: var(--muted); }
  .file-line.calc .t, .file-line.calc .f { color: var(--muted); }
  .file-line .copy { margin-left: .6rem; font: inherit; font-size: .72rem; cursor: pointer;
    padding: .15rem .45rem; border-radius: 6px; border: 1px solid var(--line-2);
    background: var(--surface); color: var(--ink); }
  /* On a phone the figure goes under its name. CRA's line names are long, and
     beside a figure and a Copy button in an indented step they had about a
     hundred pixels, one word to a line. */
  @media (max-width: 560px) {
    .file-step { grid-template-columns: 1fr; gap: .55rem; }
    .file-line.frow.pair { grid-template-columns: 1fr; gap: .3rem; }
    /* grid-column reset explicitly: the general phone rule for rows puts .f in
       the second column, which on a one column grid invents a second column
       and puts the figure back beside the name. */
    .file-line .f { grid-column: 1; justify-self: start; padding-left: 2.9rem; }
  }
  .file-inst { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin: .8rem 0 1rem; }
  .file-inst label { font-size: .88rem; color: var(--muted); }
  .file-inst input { width: 9rem; }
  .file-record { margin-top: .6rem; }
  /* A schedule's note spans the sheet: in the row grid it got the name
     column, which on a phone is a word wide. */
  .frow.file-note { display: block; }
  .slip-box .f input { width: 8.5rem; text-align: right; font-family: var(--font-mono); }
  .cta-row { display: flex; flex-wrap: wrap; gap: .6rem; margin: .6rem 0 .8rem; }

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
    ${chrome.entityType === 'soleProprietorship'
      ? `${link('/year-end', 'Year end')}${link('/incorporate', 'Incorporate?')}`
      : `${link('/year-end', 'Year end')}${link('/compensation', 'Pay')}`}
    ${link('/slips', 'Slips')}
    ${link('/onboarding', chrome.entityType === 'soleProprietorship' ? 'Business' : 'Company')}
    ${link('/billing', 'Billing')}</nav>` : ''}
  ${!hideNav && companies && companies.length > 1 ? `<form method="post" action="/companies" class="switcher">
    <input type="hidden" name="back" value="${esc(active)}">
    <select name="id" onchange="this.form.submit()" aria-label="Business">
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
export function authPage(
  mode: 'in' | 'up', error?: string, email = '', signedOut = false,
): string {
  const up = mode === 'up';

  const aside = up
    ? `<span class="aside-tag">What happens next</span>
       <ol class="aside-steps">
         <li><b>A few questions</b> about how the business is set up. Whether it is
           incorporated, where and when it started, and how you file HST.</li>
         <li><b>Your calendar appears.</b> Every filing you owe, with the form, the
           authority, and what it costs to be late.</li>
         <li><b>Reminders arrive</b> in the morning, before a window closes rather
           than after it.</li>
       </ol>
       <p class="aside-note">Free until you file from it. No card to begin.</p>`
    : `<span class="aside-tag">Your calendar is where you left it</span>
       <p class="aside-note">Nothing about what you owe is stored: it is worked out
       from the business's own set-up each time you look, so a corrected rule
       reaches you the next morning rather than the next time you sign in.</p>`;

  return shell(up ? 'Create an account' : 'Sign in', `
<div class="auth-grid">
  <div class="auth-form">
    <span class="label">${up ? 'New account' : 'Sign in'}</span>
    ${signedOut && !up ? '<div class="ok"><b>Signed out.</b> Your calendar and your reminders carry on without you; sign in again whenever you want to look.</div>' : ''}
    <h1>${up ? 'Never miss a filing again.' : 'Welcome back.'}</h1>
    <p class="hint">${up
      ? 'Incorporated or not. One account holds every business you run.'
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
  const sole = p.entityType === 'soleProprietorship';
  const w = words(p.entityType);
  return shell(sole ? 'Your business' : 'Your corporation', `
<div class="narrow">
  <div class="steps-bar"><b>${adding ? `Adding a ${w.entity}` : 'Step 1 of 1'}</b>
    &middot; about the ${esc(w.entity)}</div>
  <h1>${adding ? 'Tell us about the new one.'
    : `Tell us about the ${esc(w.entity)}.`}</h1>
  <p class="hint">Every answer changes which filings exist for you, so none of this
  is a formality. ${sole
    ? 'The fields that only apply to a corporation are not shown, because they do '
      + 'not apply to you.'
    : 'All of it comes off your incorporation documents and your last return.'}</p>
  ${welcomed ? `<div class="ok"><b>Account created.</b> A confirmation is on its way to
    ${esc(email)}. If it does not arrive, check the address is right before you rely on
    reminders, because that is where they will go.</div>` : ''}
  ${error ? `<div class="err">${esc(error)}</div>` : ''}

  <form method="post" action="/onboarding">
    <fieldset>
      <legend>What kind of business</legend>
      <div class="pick">
        <label class="pick-card">
          <input type="radio" name="entityType" value="corporation"${sole ? '' : ' checked'}>
          <b>A corporation</b>
          <span>A separate taxpayer, with its own T2 and an annual return to a
          registry.</span>
        </label>
        <label class="pick-card">
          <input type="radio" name="entityType" value="soleProprietorship"${
            sole ? ' checked' : ''}>
          <b>A sole proprietorship</b>
          <span>Unincorporated. The profit goes on your own return on form
          T2125.</span>
        </label>
      </div>
      <p class="hint">Changing this rebuilds your whole calendar, because almost no
      filing is shared between the two. Anything you have ticked off under the old
      answer stays ticked and simply stops appearing.</p>
      <div class="field">
        <label for="legalName">${esc(w.nameLabel)}</label>
        <input id="legalName" name="legalName" type="text" required
          value="${esc(p.legalName)}" placeholder="${sole
            ? 'Jane Doe Design' : 'Antipode Technologies Inc.'}">
      </div>
      ${sole ? `<div class="check">
        <input id="registeredBusinessName" name="registeredBusinessName" type="checkbox"${
          sel(!!p.registeredBusinessName)}>
        <label for="registeredBusinessName">I trade under a name that is not my own
          <span class="sub">An Ontario registration expires after five years and
          nothing chases it.</span></label>
      </div>
      <div class="field" style="max-width:16rem">
        <label for="businessNameRegisteredOn">When the name was registered</label>
        <input id="businessNameRegisteredOn" name="businessNameRegisteredOn" type="date"
          value="${esc(p.businessNameRegisteredOn ?? '')}">
      </div>` : ''}
      <div class="row2">
        <div class="field">
          <label for="jurisdiction">${sole ? 'Where you operate from' : 'Where incorporated'}
            <span class="sub">${sole
              ? 'Which province\'s rules apply to you.'
              : 'Decides which annual return you owe, and to whom.'}</span></label>
          <select id="jurisdiction" name="jurisdiction">
            ${sole ? '' : `<option value="CBCA"${p.jurisdiction === 'CBCA' ? ' selected' : ''}>Federal (CBCA)</option>`}
            ${PROVINCES.map(([c, n]) =>
              `<option value="${c}"${p.jurisdiction === c ? ' selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="incorporationDate">${esc(w.started)}
            <span class="sub">${sole
              ? 'Nothing is owed for a period that closed before this date.'
              : 'A federal annual return is due 60 days after its anniversary.'}</span></label>
          <input id="incorporationDate" name="incorporationDate" type="date" required
            value="${esc(p.incorporationDate)}">
        </div>
      </div>
      ${sole ? `<p class="hint"><b>Your fiscal year is the calendar year.</b> An
      unincorporated business does not choose one.</p>` : `
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
      </div>`}
    </fieldset>

    <fieldset>
      <legend>Income tax</legend>
      ${sole ? `<p class="hint">A business without shares cannot be a CCPC or claim
      the small business deduction, so those questions are not here. Your profit is
      taxed on your own return at personal rates.</p>` : `
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
      </div>`}
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
        <label for="payrollAccount">${sole ? 'I pay somebody a salary'
          : 'The corporation runs payroll'}
          <span class="sub">${sole
            ? 'An employee, not yourself. A sole proprietor cannot be their own '
              + 'employee, and what you take out is a draw rather than a wage. This '
              + 'adds twelve remittances a year and a T4.'
            : 'Including a salary to yourself. This adds twelve remittances a year '
              + 'and a T4.'}</span></label>
      </div>
      <div class="row2">
        <div class="field">
          <label for="payrollRemitter">Remitter type</label>
          <select id="payrollRemitter" name="payrollRemitter">
            <option value="regular"${p.payroll.remitter === 'regular' ? ' selected' : ''}>Regular, monthly</option>
            <option value="quarterly"${p.payroll.remitter === 'quarterly' ? ' selected' : ''}>Quarterly</option>
            <option value="accelerated1"${p.payroll.remitter === 'accelerated1' ? ' selected' : ''}>Accelerated, threshold 1, twice a month</option>
            <option value="accelerated2"${p.payroll.remitter === 'accelerated2' ? ' selected' : ''}>Accelerated, threshold 2, four times a month</option>
          </select>
        </div>
        <div class="field">
          <label for="onRemuneration">Ontario remuneration</label>
          <input id="onRemuneration" name="onRemuneration" type="number" min="0" step="1"
            value="${p.payroll.ontarioRemuneration}">
        </div>
      </div>
      ${sole ? '' : `<div class="check">
        <input id="paysDividends" name="paysDividends" type="checkbox"${sel(p.paysDividends)}>
        <label for="paysDividends">The corporation pays dividends
          <span class="sub">Adds a T5 by the end of February, and no source deductions.</span></label>
      </div>`}
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
      <legend>${sole ? 'Where you operate' : 'Where you have a permanent establishment'}</legend>
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
  chrome: Chrome = {}, filed: Map<string, FiledRecord> = new Map(),
): string {
  // Grouped by month. A flat list of forty dated rows is a spreadsheet; the
  // month heading is what turns it into something a person can plan against.
  const months: { key: string; label: string; items: Filing[] }[] = [];
  for (const f of filings) {
    const key = f.effectiveDue.slice(0, 7);
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
    const overdue = !done && f.effectiveDue < today;
    // The lead time is the point: a deadline you learn about on the day is not
    // a deadline you can act on.
    const starting = !done && !overdue && f.actionableFrom <= today;
    return `<div class="frow filing${done ? ' done' : overdue ? ' overdue' : ''}">
      <span class="d">${fmt(f.effectiveDue)}${
        starting ? '<br><span class="now">start now</span>' : ''}</span>
      <span class="t">${esc(f.title)}${(() => {
          const rec = filed.get(f.id);
          return rec ? `<span class="sub filed-note">Filed ${esc(fmt(rec.filedOn))}${
            rec.confirmation ? `, confirmation ${esc(rec.confirmation)}` : ''}</span>` : '';
        })()}
        <details class="why"><summary>Why, and what happens if it slips</summary>
          <p>${esc(f.detail)}</p>
          ${f.dueShiftReason ? `<p><b>Moved from ${fmt(f.due)}</b>, which is
          ${esc(f.dueShiftReason)}. A filing or payment due on a weekend or a
          holiday is on time on the next business day.</p>` : ''}
          <p><b>Start acting</b> ${fmt(f.actionableFrom)}.</p>
          <p><b>If it is late.</b> ${esc(f.penalty)}<br>
          <a href="${esc(f.linkUrl)}" rel="noopener" target="_blank">${esc(f.linkLabel)}</a>,
          from ${esc(f.authority)}.</p>
        </details>
      </span>
      <span class="f">${esc(f.form)}</span>
      <span class="file-actions">
      <a class="btn small${done ? '' : ' primary'}" href="/file?filing=${encodeURIComponent(f.id)}">${
        done ? 'View' : 'File it'}</a>
      <form method="post" action="/filing">
        <input type="hidden" name="company" value="${esc(companyId)}">
        <input type="hidden" name="filing" value="${esc(f.id)}">
        <input type="hidden" name="state" value="${done ? '' : 'done'}">
        <button class="btn small" type="submit">${done ? 'Undo' : 'Done'}</button>
      </form>
      </span>
    </div>`;
  };

  const outstanding = filings.filter((f) => states.get(f.id) !== 'done');
  const overdue = outstanding.filter((f) => f.effectiveDue < today).length;
  const next = outstanding.find((f) => f.effectiveDue >= today);

  return shell(`${p.legalName} filings`, `
<span class="label">${esc(p.legalName)} &middot; year end ${MONTHS[p.fiscalYearEnd.month - 1]} ${p.fiscalYearEnd.day}</span>
<h1>What you owe, and when.</h1>

<div class="stats">
  <div class="stat"><b>${outstanding.length}</b><span>outstanding this year</span></div>
  <div class="stat${overdue ? ' bad' : ''}"><b>${overdue}</b><span>overdue</span></div>
  <div class="stat"><b>${next ? fmt(next.effectiveDue).replace(/ \d{4}$/, '') : 'None'}</b>
    <span>${next ? esc(next.title) : 'nothing coming up'}</span></div>
</div>

<p class="hint">${p.reminders.email
  ? `We will email you ${p.reminders.leadDays} days before each one.`
  : 'Email reminders are off.'}
<a href="/onboarding">Change the ${p.entityType === 'soleProprietorship'
  ? 'business' : 'company'} details</a> and this list changes with them.</p>

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
import type { Statement, SelfEmployedYear, T2125Statement } from './rules/selfemployed';
import { SELF_EMPLOYED_CPP_MAX } from './rules/selfemployed';
import type { HomeOffice, HomeOfficeInput } from './rules/homeoffice';
import type { IncorporationComparison, Side } from './rules/incorporate';
import type { GuideKind, ReturnLine, FigureSection } from './rules/filing';
import type { HstMethod } from './rules/profile';
import type { FiledRecord } from './db';
import { PROVINCES as PROVINCE_CODES } from './rules/slipxml';
import type { TxnRow } from './db';

const KIND_LABEL: Record<AccountKind, string> = {
  revenue: 'Revenue', expense: 'Expenses', asset: 'Assets',
  liability: 'Liabilities', equity: 'Equity',
};

/**
 * The ledger.
 *
 * The only screen somebody touches weekly rather than a few times a year, which
 * is the whole reason it was worth rebuilding. Measured before: every row was
 * 125 pixels tall because five things were being laid out in a four column
 * grid, so the remove button wrapped onto a line of its own and twelve
 * transactions filled two and a half screens. There were no column headings, no
 * totals to check against a statement, no grouping, and fifty five words of
 * explanation above the fold that a weekly visitor reads once and then scrolls
 * past forever.
 *
 * So: a row is a row, the months are grouped the way the filing calendar groups
 * them, the four figures somebody reconciles against a bank statement are at the
 * top, and the explanation is folded away for whoever still wants it.
 */
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

  // The four figures somebody actually reconciles against a statement. Revenue
  // is money arriving and everything else is money leaving, which is the same
  // rule the import uses to read a bank file.
  let moneyIn = 0;
  let moneyOut = 0;
  let hstCollected = 0;
  let hstPaid = 0;
  for (const t of txns) {
    const inflow = ACCOUNT_BY_ID.get(t.account_id)?.kind === 'revenue';
    if (inflow) { moneyIn += t.amount_cents; hstCollected += t.hst_cents; }
    else { moneyOut += t.amount_cents; hstPaid += t.hst_cents; }
  }

  // Newest first, grouped by the month the transaction fell in, because
  // checking a ledger is something people do one statement at a time.
  const months = new Map<string, TxnRow[]>();
  for (const t of [...txns].sort((a, b) => (a.txn_date < b.txn_date ? 1 : -1))) {
    const key = t.txn_date.slice(0, 7);
    const bucket = months.get(key);
    if (bucket) bucket.push(t); else months.set(key, [t]);
  }

  const monthName = (key: string): string => {
    const [y, m] = key.split('-').map(Number) as [number, number];
    return `${MONTHS[m - 1]} ${y}`;
  };

  const ledger = [...months.entries()].map(([key, rows]) => {
    const net = rows.reduce((sum, t) => {
      const inflow = ACCOUNT_BY_ID.get(t.account_id)?.kind === 'revenue';
      return sum + (inflow ? t.amount_cents : -t.amount_cents);
    }, 0);

    return `<div class="brow-month">
      <span>${esc(monthName(key))}</span>
      <span>${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}</span>
      <span class="brow-net ${net < 0 ? 'down' : 'up'}">${net < 0 ? '' : '+'}${dollars(net)}</span>
    </div>
    ${rows.map((t) => {
      const a = ACCOUNT_BY_ID.get(t.account_id);
      const inflow = a?.kind === 'revenue';
      return `<div class="brow">
        <span class="brow-d">${esc(t.txn_date.slice(8))} ${esc(MONTHS[Number(t.txn_date.slice(5, 7)) - 1]!.slice(0, 3))}</span>
        <span class="brow-a">${esc(a?.name ?? t.account_id)}${
          t.description ? `<span class="brow-desc">${esc(t.description)}</span>` : ''}</span>
        <span class="brow-c">${esc(ACCOUNT_BY_ID.get(t.counter_account_id)?.name ?? t.counter_account_id)}</span>
        <span class="brow-n${inflow ? ' in' : ''}">${inflow ? '+' : ''}${dollars(t.amount_cents)}</span>
        <span class="brow-n hst">${t.hst_cents ? dollars(t.hst_cents) : '&middot;'}</span>
        <form method="post" action="/books/delete">
          <input type="hidden" name="company" value="${esc(companyId)}">
          <input type="hidden" name="id" value="${esc(t.id)}">
          <button class="brow-x" type="submit" aria-label="Remove this entry"
            title="Remove">&times;</button>
        </form>
      </div>`;
    }).join('')}`;
  }).join('');

  return shell(`${companyName} books`, `
<span class="label">${esc(companyName)} &middot; ledger</span>
<h1>The books.</h1>
<p class="hint">Type a row below, or <a href="/books/import">import a bank export</a>
and correct what it guessed.</p>

${error ? `<div class="err">${esc(error)}</div>` : ''}

${txns.length ? `<div class="stats">
  <div class="stat"><b>${dollars(moneyIn)}</b><span>money in</span></div>
  <div class="stat"><b>${dollars(moneyOut)}</b><span>money out</span></div>
  <div class="stat"><b>${dollars(hstCollected)}</b><span>HST collected</span></div>
  <div class="stat"><b>${dollars(hstPaid)}</b><span>HST paid</span></div>
</div>` : ''}

<form method="post" action="/books" class="txn-form">
  <input type="hidden" name="company" value="${esc(companyId)}">
  <div class="txn-grid">
    <div class="field"><label for="date">Date</label>
      <input id="date" name="date" type="date" required value="${esc(today)}"></div>
    <div class="field"><label for="account">Account</label>
      <select id="account" name="account" required>${options}</select></div>
    <div class="field"><label for="amount">Amount</label>
      <input id="amount" name="amount" type="text" inputmode="decimal" required placeholder="1000.00 before HST"></div>
    <div class="field"><label for="hst">HST</label>
      <input id="hst" name="hst" type="text" inputmode="decimal" placeholder="130.00 as charged"></div>
    <div class="field"><label for="counter">From or to</label>
      <select id="counter" name="counter" required>${counterOptions}</select></div>
    <div class="field"><label for="description">Description</label>
      <input id="description" name="description" type="text" placeholder="Invoice 014"></div>
    <div class="field"><button class="btn primary" type="submit">Add</button></div>
  </div>
</form>

<details class="why-books">
  <summary>Why the HST is typed rather than worked out</summary>
  <p>Every line carries the HST that was actually on the document, not a computed
  13%. A supplier outside Canada charges none, a supplier's rounding is theirs,
  and claiming tax that was never charged is claiming a credit that does not
  exist. <a href="/hst">See the HST return</a> these rows produce.</p>
</details>

${txns.length ? `<div class="sheet">
  <div class="brow head">
    <span>Date</span><span>Account</span><span>From or to</span>
    <span class="brow-n">Amount</span><span class="brow-n">HST</span><span></span>
  </div>
  ${ledger}
</div>` : `<div class="sheet empty-books">
  <p><b>Nothing recorded yet.</b></p>
  <p>The quickest start is a bank export: download a CSV from your bank, and
  FileClear will read the columns, work out the HST, and guess the accounts for
  you to correct.</p>
  <p><a class="btn primary" href="/books/import">Import a bank export</a></p>
</div>`}`, email, '/books', chrome);
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
${fmt(r.from)} to ${fmt(r.to)}.</p>

<div class="periods">${periods.map((o) =>
  `<a class="btn small${o.id === active ? ' primary' : ''}" href="/hst?period=${o.id}">${esc(o.label)}</a>`).join('')}</div>

${summary([
  { value: dollars(better ? r.quick.netTax : r.netTaxRegular),
    label: r.netTaxRegular < 0 || r.quick.netTax < 0 ? 'refund due' : 'net tax to remit',
    strong: true },
  { value: dollars(r.totalRevenue), label: 'revenue, line 101' },
  { value: dollars(r.collected), label: 'HST collected, line 103' },
  { value: dollars(r.itcs), label: 'credits claimed, line 106' },
])}

<div class="two">
  <div class="sheet">
    <div class="sheet-head"><span>Regular method</span><span>GST34</span></div>
    <div class="frow"><span class="t">Line 101 &middot; total revenue</span><span class="f num">${dollars(r.totalRevenue)}</span></div>
    <div class="frow"><span class="t">Line 103 &middot; HST collected</span><span class="f num">${dollars(r.collected)}</span></div>
    <div class="frow"><span class="t">Line 106 &middot; input tax credits</span><span class="f num">${dollars(r.itcs)}</span></div>
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

${notes(r.caveats, 'this return')}
${worksheetFooter()}`, email, '/hst', chrome);
}

// ------------------------------------------------------- notes and summaries

/**
 * Three kinds of message were wearing one costume.
 *
 * The slips screen had eleven advisory boxes on it, all styled the same, and
 * eleven boxes that look equally important mean none of them gets read. Reading
 * them apart, they were three different things:
 *
 *   act on this      a penalty, a category CRA is about to move you into
 *   understand this  why a T4 follows the calendar year, why an owner pays no EI
 *   what this is not the standing reminder that FileClear does not file
 *
 * Only the first needs to interrupt. The second is worth having and worth
 * folding away, because it is read once and then known. The third belongs at the
 * foot of every screen in the same place, said once, rather than competing for
 * attention with a penalty.
 */
export function notes(items: string[], about = 'these figures'): string {
  if (!items.length) return '';
  return `<details class="notes">
    <summary>${items.length} note${items.length === 1 ? '' : 's'} about ${esc(about)}</summary>
    ${items.map((n) => `<p>${esc(n)}</p>`).join('')}
  </details>`;
}

/**
 * Said once, at the foot, on every screen that produces a figure.
 *
 * It used to appear as an advisory in the middle of the page, which put the most
 * repeated sentence in the product in the same visual bracket as a warning about
 * a penalty.
 */
export function worksheetFooter(extra = ''): string {
  return `<p class="worksheet-foot">FileClear works out what you owe and when. It is
  not certified by CRA and does not transmit anything, so every figure here is one
  to enter rather than one that has been filed.${extra ? ` ${esc(extra)}` : ''}</p>`;
}

/** The two to four numbers a screen exists to produce. */
export function summary(cells: { value: string; label: string; strong?: boolean }[]): string {
  return `<div class="stats">${cells.map((c) => `<div class="stat${
    c.strong ? ' lead' : ''}"><b>${c.value}</b><span>${esc(c.label)}</span></div>`).join('')}</div>`;
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
    `<div class="frow gifi"><span class="d">${l.gifi}</span><span class="t">${esc(l.name)}</span>
     <span class="f num">${dollars(l.amount)}</span></div>`).join('');

  const total = (gifi: number, label: string, amount: number) =>
    `<div class="frow gifi total"><span class="d">${gifi}</span><span class="t"><b>${label}</b></span>
     <span class="f num"><b>${dollars(amount)}</b></span></div>`;

  const classOptions = CCA_CLASSES.map((c) =>
    `<option value="${c.number}">Class ${c.number} &middot; ${esc(c.name)} (${(c.rate * 100).toFixed(0)}%)</option>`).join('');

  return shell(`${companyName} year end`, `
<span class="label">${esc(companyName)} &middot; year end</span>
<h1>${esc(active.label)}, and what it owes.</h1>
<p class="hint">${fmt(active.from)} to ${fmt(active.to)}${active.ended ? '' : ', still open'}.
Every figure below names the schedule and line it belongs on. FileClear works
the numbers out; it does not file them.</p>

<div class="periods">${years.map((y) =>
  `<a class="btn small${y.id === active.id ? ' primary' : ''}" href="/year-end?year=${y.id}">${esc(y.label)}${y.ended ? '' : ' (open)'}</a>`).join('')}</div>

${summary([
  { value: dollars(tax.totalTax), label: 'total tax payable', strong: true },
  { value: dollars(tax.taxableIncome), label: 'taxable income' },
  { value: `${(tax.effectiveRate * 100).toFixed(1)}%`, label: 'effective rate' },
  { value: dollars(s.income.netBeforeTax), label: 'net income per the books' },
])}

${error ? `<div class="err">${esc(error)}</div>` : ''}

${active.ended ? '' : `<div class="advisory"><b>This year has not finished.</b>
  The figures are correct as far as the ledger goes, but there is no return to
  file until ${fmt(active.to)}.</div>`}

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
    <div class="sheet-head"><span>Balance sheet at ${fmt(active.to)}</span><span>Schedule 100</span></div>
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
  <div class="ask-grid wide">
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
${notes(s8.notes, 'capital cost allowance')}

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

${notes(tax.notes, 'the tax calculation')}

${worksheetFooter('Every figure above names the schedule and line it belongs on.')}
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
  <div class="ask-grid">
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

${summary([
  { value: dollars(Math.abs(c.salaryAdvantage)),
    label: `${c.salaryAdvantage >= 0 ? 'salary' : 'dividends'} leaves more in hand`,
    strong: true },
  { value: dollars(c.salary.netToPerson), label: 'in hand, salary' },
  { value: dollars(c.dividend.netToPerson), label: 'in hand, dividends' },
  // The number the page exists to make visible: a good part of the cash gap is
  // a pension contribution rather than tax, and without it the comparison reads
  // as "dividends win" when it is really "dividends skip CPP".
  { value: dollars(c.gapFromCpp), label: 'of the gap is CPP, not tax' },
])}

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
${notes(c.considerations, 'what the arithmetic cannot see')}

<h2 class="sec">What this does not include</h2>
${notes(c.caveats, 'the limits of this comparison')}
${worksheetFooter()}

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
  chrome: Chrome = {}, entityType: EntityType = 'corporation',
): string {
  // A sole proprietorship has no shares, so there is no dividend and no T5.
  // The page still exists because an unincorporated business with an employee
  // owes exactly the same T4 and the same monthly remittance.
  const sole = entityType === 'soleProprietorship';
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
with the books rather than being typed twice. ${sole
  ? `The T4 is due ${fmt(deadline)}.`
  : `Both slips are due ${fmt(deadline)}.`}</p>

<div class="periods">${years.map((y) =>
  `<a class="btn small${y === year ? ' primary' : ''}" href="/slips?year=${y}">${y}</a>`).join('')}</div>

<div class="advisory"><b>${sole ? 'This is a calendar year slip.'
  : 'These are calendar year slips.'}</b>
  ${sole
    ? 'A T4 covers January to December, which is also your fiscal year, so nothing '
      + 'can drift out of step here. Note that you cannot put yourself on it: a sole '
      + 'proprietor is not their own employee, and what you take out of the business '
      + 'is a draw rather than a wage. It goes on your T2125 as profit, not as pay.'
    : 'A T4 and a T5 cover January to December whatever your fiscal year end is. '
      + 'Only the T2 follows the fiscal year. Lining the slips up with the year end '
      + 'instead produces figures CRA cannot match to your remittance account.'}</div>

${anySalary || t5.boxes.some((b) => b.amount !== 0) ? summary([
  ...(anySalary ? [{ value: dollars(t4s.reduce((n, t) =>
      n + (t.boxes.find((b) => b.box === '14')?.amount ?? 0), 0)),
    label: 'on T4s' }] : []),
  ...(!sole && t5.boxes.some((b) => b.amount !== 0) ? [{ value: dollars(
      t5.boxes.find((b) => b.box === '10' || b.box === '24')?.amount ?? 0),
    label: 'on the T5' }] : []),
  ...(run && run.periodRemittance ? [{ value: dollars(run.periodRemittance),
    label: 'per PD7A' }] : []),
  { value: deadline.slice(8) + ' Feb', label: sole ? 'T4 due' : 'both slips due',
    strong: true },
]) : ''}

${anySalary || (!sole && t5.boxes.some((b) => b.amount !== 0)) ? `<div class="cta-row">
  ${anySalary ? `<a class="btn primary" href="/slips/file?year=${year}&amp;kind=t4">Make the T4 file for CRA</a>` : ''}
  ${!sole && t5.boxes.some((b) => b.amount !== 0)
    ? `<a class="btn${anySalary ? '' : ' primary'}" href="/slips/file?year=${year}&amp;kind=t5">Make the T5 file for CRA</a>` : ''}
</div>
<p class="hint">An XML file you upload to CRA yourself, with the slips and the summary
in it. It is the one return FileClear can hand CRA in CRA's own format.</p>` : ''}

${nothing ? `<div class="advisory info">${sole
  ? `No salary was paid in ${year}, so there is no T4 to file. That is the normal
     case for a sole proprietor working alone: money you take for yourself is a
     draw rather than a wage, and it needs no slip. If you did pay somebody, the
     ledger is missing entries on the salaries account.`
  : `Nothing was paid as salary or dividends in ${year}, so there is no slip to
     file. If that is wrong, the ledger is missing entries: a salary belongs on
     the salaries account and a dividend on dividends declared.`}</div>` : ''}

<h2 class="sec">Who is on the payroll</h2>
<p class="hint">Needed once more than one person is paid, because a single salary
total cannot be split back into separate slips. ${sole
  ? 'Everyone you employ is at arm\'s length and insurable, so EI is withheld and '
    + 'you pay 1.4 times what they do on top. Leave the voting share box at zero; '
    + 'there are no shares in an unincorporated business.'
  : 'Voting shares decide EI: over 40% and the employment is not insurable, '
    + 'whatever anybody would prefer.'}</p>

${error ? `<div class="err">${esc(error)}</div>` : ''}

<form method="post" action="/employees" class="txn-form">
  <div class="ask-grid wide">
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

${notes(run?.questions ?? [], 'who is insurable')}

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
${notes(t4s[0]?.notes ?? [], 'the T4')}

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
${notes([eht.note], 'the health tax')}
${eht.instalmentsRequired ? '<div class="advisory">Payroll is over $1.2 million, so this is paid in monthly instalments rather than once a year.</div>' : ''}` : ''}

${!sole && t5.boxes.some((b) => b.amount !== 0) ? `
<h2 class="sec">T5, statement of investment income</h2>
<div class="sheet">
  <div class="sheet-head"><span>${year}</span><span>T5</span></div>
  ${boxes(t5.boxes)}
</div>
${notes(t5.notes, 'the T5')}` : ''}

${worksheetFooter('Each figure above carries the box it belongs in.')}
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
  { n: 1, title: 'What kind of business',
    blurb: 'Incorporated or not. Almost every date that follows depends on this '
      + 'answer, so it is the first thing asked and the only thing on this screen.' },
  { n: 2, title: 'Where and when',
    blurb: 'Where it operates and when it started. With the answer above, this is '
      + 'enough to build your calendar.' },
  { n: 3, title: 'HST',
    blurb: 'Whether you are registered, and how often you file. This decides which '
      + 'returns appear and when.' },
  { n: 4, title: 'How you take money out',
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

  const sole = p.entityType === 'soleProprietorship';
  const w = words(p.entityType);

  /**
   * Step one is one question with two answers, and nothing else on the screen.
   *
   * It used to be the legal name, the jurisdiction, the date and the fiscal
   * year end together, which quietly assumed the answer. A sole proprietor met
   * "Date of incorporation" as the second field and had already been told the
   * product was not for them.
   */
  const body = step === 1 ? `
    <div class="pick">
      <label class="pick-card${sole ? '' : ' on'}">
        <input type="radio" name="entityType" value="corporation"${sole ? '' : ' checked'}>
        <b>A corporation</b>
        <span>Incorporated federally or with a province. It is a separate taxpayer:
        it files its own T2, pays its own tax, and an annual return goes to the
        registry that created it.</span>
      </label>
      <label class="pick-card${sole ? ' on' : ''}">
        <input type="radio" name="entityType" value="soleProprietorship"${sole ? ' checked' : ''}>
        <b>A sole proprietorship</b>
        <span>Unincorporated, run by one person. There is no second taxpayer: the
        profit goes on your own return on form T2125, due 15 June, with the money
        due 30 April.</span>
      </label>
    </div>
    <div class="field">
      <label for="legalName">${esc(w.nameLabel)}</label>
      <input id="legalName" name="legalName" type="text" required
        value="${esc(p.legalName)}" placeholder="${sole
          ? 'Jane Doe Design' : 'Antipode Technologies Inc.'}">
      <span class="sub">${sole
        ? 'The name you trade under. If that is not your own legal name, it has to be '
          + 'registered, and the registration expires after five years.'
        : 'Exactly as it appears on your certificate of incorporation.'}</span>
    </div>
    <p class="hint">Not sure which? If you have a certificate of incorporation and a
    business number ending in RC0001, you are a corporation. If you simply started
    working for yourself, you are a sole proprietor until you incorporate, whether or
    not you registered a business name.</p>`
    : step === 2 ? `
    <div class="row2">
      <div class="field">
        <label for="jurisdiction">${sole ? 'Where you operate from' : 'Where incorporated'}</label>
        <select id="jurisdiction" name="jurisdiction">
          ${sole ? '' : `<option value="CBCA"${p.jurisdiction === 'CBCA' ? ' selected' : ''}>Federal (Canada)</option>`}
          ${PROVINCE_NAMES.map(([c, n]) => `<option value="${c}"${
            p.jurisdiction === c ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
        <span class="sub">${sole
          ? 'The province whose rules apply to you. There is nothing to incorporate, '
            + 'so this is simply where the business is.'
          : 'Federal corporations file an annual return 60 days after their '
            + 'incorporation anniversary. Provincial ones file on the fiscal year.'}</span>
      </div>
      <div class="field">
        <label for="incorporationDate">${esc(w.started)}</label>
        <input id="incorporationDate" name="incorporationDate" type="date" required
          value="${esc(p.incorporationDate)}">
        <span class="sub">${sole
          ? 'The day you first earned from it. Nothing is owed for a period that '
            + 'closed before this date.'
          : 'On the certificate. It sets your first tax year.'}</span>
      </div>
    </div>
    ${sole ? `
    <div class="check">
      <input id="registeredBusinessName" name="registeredBusinessName" type="checkbox"${
        sel(!!p.registeredBusinessName)}>
      <label for="registeredBusinessName">I trade under a name that is not my own legal name</label>
    </div>
    <p class="hint">A registered business name in Ontario expires five years after it
    is made. Nothing chases it, no return depends on it, and it is usually discovered
    at a bank when a cheque cannot be deposited. Tick this and the renewal goes on
    your calendar.</p>
    <p class="hint"><b>Your fiscal year is the calendar year.</b> An unincorporated
    business does not choose one, unlike a corporation, so there is nothing to set
    here.</p>`
    : `
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
    </div>`}`
    : step === 3 ? `
    <div class="check">
      <input id="hstRegistered" name="hstRegistered" type="checkbox"${sel(p.hst.registered)}>
      <label for="hstRegistered">${sole ? 'I have' : 'The corporation has'} an HST number</label>
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
    ${sole ? `<p class="hint"><b>The two dates, again.</b> As an annual filer you pay
    by 30 April and file by 15 June, the same split as your personal return. It is
    the one deadline pair in this product that catches people twice.</p>` : ''}
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
      <label for="payrollAccount">${sole
        ? 'I pay somebody a salary'
        : 'Somebody is paid a salary, including you'}</label>
    </div>
    <p class="hint">${sole
      ? 'An employee means an RP account with CRA, a remittance every month and a T4 '
        + 'each February. Paying yourself does not count: a sole proprietor cannot be '
        + 'their own employee, and money you take out is a draw rather than a wage.'
      : 'A salary means an RP account with CRA, a remittance every month, and a T4 '
        + 'each February. If you only take dividends, leave this unticked.'}</p>
    ${sole ? '' : `
    <div class="check">
      <input id="paysDividends" name="paysDividends" type="checkbox"${sel(p.paysDividends)}>
      <label for="paysDividends">Dividends are paid to shareholders</label>
    </div>
    <p class="hint">Dividends produce a T5 by the last day of February. Nothing is
    withheld during the year.</p>`}
    <fieldset>
      <legend>Where you ${sole ? 'operate' : 'have a permanent establishment'}</legend>
      <p class="hint">${sole
        ? 'Where the work actually happens. Usually just the one.'
        : 'An office, a warehouse, somewhere you actually operate from. It decides '
          + 'which province taxes you, and usually it is just the one.'}</p>
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

  ${step <= 2 ? '<p class="step-foot">A few answers and your calendar exists. '
    + 'Everything else can wait, and none of it is needed to see what you owe.</p>' : ''}
</div>`, email, '', { ...chrome, hideNav: true });
}

// ------------------------------------------------ the unincorporated year end

/**
 * Form T2125 and the bill that follows it.
 *
 * The corporate year end page works towards a T2 and stops at the corporation's
 * own tax. This one cannot stop there, because there is no second taxpayer: the
 * profit is the owner's income on the day it is earned, and the only number
 * that answers "what do I owe" is a personal one. So the page runs all the way
 * through to the cheque due on 30 April, with CPP shown beside the tax rather
 * than inside it.
 *
 * Every figure names its line on the form, the same as the corporate
 * worksheet, because a number with no address has to be looked up twice.
 */
export function t2125Page(
  email: string, businessName: string,
  years: FiscalYear[], active: FiscalYear,
  s: T2125Statement, s8: Schedule8,
  st: Statement & { homeOfficeCarriedForward: number },
  year: SelfEmployedYear,
  home: HomeOffice | null, homeInput: HomeOfficeInput | null,
  error?: string, chrome: Chrome = {}, plain?: string,
): string {
  const line = (n: string, label: string, amount: number, strong = false) =>
    `<div class="frow gifi${strong ? ' total' : ''}"><span class="d">${n}</span>
     <span class="t">${strong ? `<b>${esc(label)}</b>` : esc(label)}</span>
     <span class="f num">${strong ? `<b>${dollars(amount)}</b>` : dollars(amount)}</span></div>`;

  const money = (name: string, label: string, value: number, hint = '') => `
    <div class="field">
      <label for="${name}">${esc(label)}</label>
      <input id="${name}" name="${name}" type="number" step="0.01" min="0"
        value="${value ? (value / 100).toFixed(2) : ''}">
      ${hint ? `<span class="sub">${hint}</span>` : ''}
    </div>`;

  return shell(`${businessName} year end`, `
<span class="label">${esc(businessName)} &middot; ${esc(active.label)}</span>
<h1>What the business made, and what you owe on it.</h1>
<p class="hint">${fmt(active.from)} to ${fmt(active.to)}${active.ended ? '' : ', still open'}.
An unincorporated business files nothing of its own: these figures go on form
T2125 inside your personal return. FileClear works them out and does not file them.</p>

<div class="periods">${years.map((y) =>
  `<a class="btn small${y.id === active.id ? ' primary' : ''}" href="/year-end?year=${y.id}">${
    esc(y.label)}${y.ended ? '' : ' (open)'}</a>`).join('')}</div>

${summary([
  { value: dollars(st.netIncome), label: 'net business income, line 9946', strong: true },
  { value: dollars(year.totalDue), label: 'due 30 April', strong: true },
  { value: dollars(year.cpp.total), label: 'of that, CPP rather than tax' },
  { value: dollars(year.afterTax), label: 'left after both' },
])}

${error ? `<div class="err">${esc(error)}</div>` : ''}

${year.instalmentsLikely ? `<div class="advisory">
  <b>This puts you over the instalment threshold.</b>
  Net tax owing above $3,000 in this year and in either of the two before it means
  CRA will ask for quarterly instalments, on 15 March, June, September and December.
  They appear on your calendar once the second year passes the threshold.</div>` : ''}

<h2>The statement of business activities</h2>
<div class="two">
  <div class="sheet">
    <div class="sheet-head"><span>Income and expenses</span><span>T2125</span></div>
    ${line('8299', 'Gross business income', st.grossRevenue, true)}
    ${st.costOfSales ? line('8518', 'Cost of goods sold', st.costOfSales) : ''}
    ${st.costOfSales ? line('8519', 'Gross profit', st.grossProfit, true) : ''}
    ${s.otherIncome.map((l) => line(String(l.line), `of which, ${l.name.toLowerCase()}`, l.amount)).join('')}
    ${s.expenses.map((l) => line(String(l.line), l.name, l.amount)).join('')}
    ${line('9368', 'Total expenses', st.expenses, true)}
    ${line('9936', 'Capital cost allowance, from Area A', st.cca)}
    ${line('9945', 'Business use of home', st.businessUseOfHome)}
    ${line('9946', 'Net income', st.netIncome, true)}
  </div>

  <div class="sheet">
    <div class="sheet-head"><span>What you owe on it</span><span>T1</span></div>
    <div class="frow"><span class="t">Net business income</span>
      <span class="f num">${dollars(year.netBusinessIncome)}</span></div>
    <div class="frow"><span class="t">Less the deductible half of CPP</span>
      <span class="f num">${dollars(-year.cpp.deductible)}</span></div>
    <div class="frow total"><span class="t"><b>Taxable income</b></span>
      <span class="f num"><b>${dollars(year.tax.taxableIncome)}</b></span></div>
    <div class="frow"><span class="t">Federal tax</span>
      <span class="f num">${dollars(year.tax.federal)}</span></div>
    <div class="frow"><span class="t">Ontario tax</span>
      <span class="f num">${dollars(year.tax.ontario)}</span></div>
    ${year.tax.surtax ? `<div class="frow"><span class="t">Ontario surtax</span>
      <span class="f num">${dollars(year.tax.surtax)}</span></div>` : ''}
    ${year.tax.healthPremium ? `<div class="frow"><span class="t">Ontario health premium</span>
      <span class="f num">${dollars(year.tax.healthPremium)}</span></div>` : ''}
    <div class="frow total"><span class="t"><b>Income tax</b></span>
      <span class="f num"><b>${dollars(year.tax.total)}</b></span></div>
    <div class="frow"><span class="t">CPP on self-employment, line 22200 and 31000</span>
      <span class="f num">${dollars(year.cpp.total)}</span></div>
    <div class="frow total"><span class="t"><b>Due 30 April</b></span>
      <span class="f num"><b>${dollars(year.totalDue)}</b></span></div>
  </div>
</div>

<details class="why"><summary>Why CPP is so much larger than it was on a payslip</summary>
  <p>An employee pays 5.95% and their employer pays the matching 5.95%. Self-employed,
  you are both, so the rate is 11.9% and the maximum for ${year.cpp.atMaximum
    ? 'the year, which you have reached, is' : 'the year is'}
  ${dollars(SELF_EMPLOYED_CPP_MAX)} rather than half that. It is the single largest
  difference between a salary and self-employment income of the same size, and it
  arrives as one bill in April rather than in twenty six pieces through the year.</p>
  <p>It is not folded into the tax figure above, on purpose. It leaves on the same
  day but it buys a pension, and a rate that mixes the two describes neither.</p>
  <p>The contribution splits three ways rather than in half. The employer share and
  all of the enhanced portion, ${dollars(year.cpp.deductible)}, come off your income
  before tax. Only ${dollars(year.cpp.creditable)} is a credit.</p>
</details>

<h2>Business use of home</h2>
<p class="hint">The deduction most often understated, because people share the
utilities and forget the rent or the mortgage interest, which is usually the
largest number on the page. It is also the one expense that cannot create a loss:
what will not fit this year carries forward against this business indefinitely.</p>

<form method="post" action="/year-end?year=${esc(active.id)}">
  <input type="hidden" name="what" value="home">
  <div class="row2">
    <div class="field">
      <label for="homeArea">Total area of the home</label>
      <input id="homeArea" name="homeArea" type="number" step="1" min="0"
        value="${homeInput?.homeArea || ''}" placeholder="1200">
      <span class="sub">Square feet or square metres, as long as both boxes match.</span>
    </div>
    <div class="field">
      <label for="workArea">Area used for the business</label>
      <input id="workArea" name="workArea" type="number" step="1" min="0"
        value="${homeInput?.workArea || ''}" placeholder="150">
    </div>
  </div>
  <div class="field">
    <label for="hoursPerWeek">Hours a week the space is used for the business</label>
    <input id="hoursPerWeek" name="hoursPerWeek" type="number" step="1" min="0" max="168"
      value="${homeInput?.hoursPerWeek ?? ''}" placeholder="leave empty if the room is only used for work">
    <span class="sub">Leave this empty for a room used <b>only</b> for the business.
    Fill it in for a space you also live in, such as a dining table: that claim is
    prorated by time as well as by area, and leaving the hours out is the commonest
    way this deduction is overstated.</span>
  </div>
  <div class="row2">
    ${money('rent', 'Rent for the year', homeInput?.rent ?? 0)}
    ${money('mortgageInterest', 'Mortgage interest for the year',
      homeInput?.mortgageInterest ?? 0,
      'Interest only. The principal is never deductible.')}
  </div>
  <div class="row2">
    ${money('propertyTax', 'Property tax', homeInput?.propertyTax ?? 0)}
    ${money('homeInsurance', 'Home insurance', homeInput?.homeInsurance ?? 0)}
  </div>
  <div class="row2">
    ${money('utilities', 'Heat, hydro and water', homeInput?.utilities ?? 0)}
    ${money('maintenance', 'Repairs and maintenance', homeInput?.maintenance ?? 0)}
  </div>
  <button class="btn primary" type="submit">Work the claim out</button>
</form>

${home ? `
<div class="two" style="margin-top:1.6rem">
  <div class="sheet">
    <div class="sheet-head"><span>The claim</span><span>line 9945</span></div>
    <div class="frow"><span class="t">Share of the home</span>
      <span class="f num">${(home.areaFraction * 100).toFixed(1)}%</span></div>
    <div class="frow"><span class="t">Share of the week</span>
      <span class="f num">${home.timeFraction === 1 ? 'all of it'
        : `${(home.timeFraction * 100).toFixed(1)}%`}</span></div>
    <div class="frow total"><span class="t"><b>Claimable share</b></span>
      <span class="f num"><b>${(home.fraction * 100).toFixed(2)}%</b></span></div>
    <div class="frow"><span class="t">Household costs</span>
      <span class="f num">${dollars(home.eligibleCosts)}</span></div>
    <div class="frow total"><span class="t"><b>Claim before the restriction</b></span>
      <span class="f num"><b>${dollars(home.claim)}</b></span></div>
    <div class="frow"><span class="t">Claimed this year, line 9945</span>
      <span class="f num">${dollars(st.businessUseOfHome)}</span></div>
    ${st.homeOfficeCarriedForward > 0 ? `<div class="frow"><span class="t">Carried forward</span>
      <span class="f num">${dollars(st.homeOfficeCarriedForward)}</span></div>` : ''}
  </div>
  <div class="sheet">
    <div class="sheet-head"><span>Worth knowing</span><span>before you claim</span></div>
    <div class="sheet-body">${home.notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('')}</div>
  </div>
</div>` : ''}

${st.homeOfficeCarriedForward > 0 ? `<div class="advisory">
  <b>${dollars(st.homeOfficeCarriedForward)} of the home office claim cannot be used
  this year.</b> Business use of home cannot create or deepen a loss, so it stops at
  the profit that is left. The rest carries forward indefinitely against this same
  business, so it is worth recording rather than forgetting.</div>` : ''}

${s.mealsDisallowed > 0 ? `<p class="hint">Meals and entertainment are on line 8523 at
the allowable half. The other ${dollars(s.mealsDisallowed)} is not deductible, so it is
in the books and not on the return, which is what the form asks for.</p>` : ''}

${s8.totalCca > 0 ? `<p class="hint">Capital cost allowance of ${dollars(s8.totalCca)}
is included above, from the asset register. It is Area A of the T2125 rather than
Schedule 8, but the arithmetic is the same one.</p>` : ''}

${plain ? `<div class="verdict"><b>In plain words</b>${esc(plain)}</div>` : ''}

${notes([
  'These figures assume Ontario rates and no other income. Employment income, a '
  + 'spouse, children, tuition, medical expenses, donations or an RRSP contribution '
  + 'all move the tax, some of them by a lot, and none of them are here.',
  'The return itself is due 15 June and the money is due 30 April. If you cannot '
  + 'finish the return by April, pay the balance you expect and file in June: '
  + 'interest runs from 1 May either way.',
])}

${worksheetFooter('Your business number and the industry code go on the T2125 '
  + 'as well, and FileClear does not hold either.')}
`, email, '/year-end', chrome);
}

// ------------------------------------------------------- should I incorporate

/**
 * Sole proprietor against corporation, with the arithmetic for both.
 *
 * The same rule as the salary and dividend comparison: compute both, show the
 * working, print no recommendation. What makes this page worth having is that
 * the received answer is a number, "incorporate at a hundred thousand", and the
 * arithmetic says the threshold is not about income at all. It is about how
 * much of the profit stays in the business, because that is the only part the
 * deferral applies to.
 *
 * So the draw is a control rather than an assumption, and the table underneath
 * answers "at what profit" rather than "at this profit".
 */
/**
 * Whole dollars, for a figure that labels a row rather than being copied onto
 * a form. "Profit of 60,000.00" wrapped onto two lines and the cents were
 * never meaningful: the profit levels are round numbers chosen to span a
 * range, not amounts anybody entered.
 */
const whole = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString('en-CA')}`;

export function incorporatePage(
  email: string, businessName: string,
  c: IncorporationComparison, rows: { profit: number; advantage: number }[],
  chrome: Chrome = {},
): string {
  const side = (s: Side, best: boolean) => `
  <div class="sheet${best ? ' win' : ''}">
    <div class="sheet-head"><span>${esc(s.label)}</span><span>${best ? 'better here' : ''}</span></div>
    ${s.businessTax ? `<div class="frow"><span class="t">Corporate tax</span>
      <span class="f num">${dollars(s.businessTax)}</span></div>` : ''}
    <div class="frow"><span class="t">Personal tax</span>
      <span class="f num">${dollars(s.personalTax)}</span></div>
    <div class="frow"><span class="t">CPP</span>
      <span class="f num">${s.cpp ? dollars(s.cpp) : 'none'}</span></div>
    ${s.runningCost ? `<div class="frow"><span class="t">Cost of running a corporation</span>
      <span class="f num">${dollars(s.runningCost)}</span></div>` : ''}
    <div class="frow total"><span class="t"><b>Everything that leaves</b></span>
      <span class="f num"><b>${dollars(s.totalOut)}</b></span></div>
    <div class="frow"><span class="t">Cash in your hands</span>
      <span class="f num">${dollars(s.cashInHand)}</span></div>
    <div class="frow"><span class="t">Left inside the business</span>
      <span class="f num">${s.retained ? dollars(s.retained) : 'none'}</span></div>
    <div class="frow"><span class="t">RRSP room created</span>
      <span class="f num">${s.rrspRoom ? dollars(s.rrspRoom) : 'none'}</span></div>
  </div>`;

  const bestCorporate = c.asSalary.cashInHand + c.asSalary.retained
    >= c.asDividend.cashInHand + c.asDividend.retained ? 'salary' : 'dividend';

  return shell('Should you incorporate?', `
<span class="label">${esc(businessName)} &middot; ${c.year}</span>
<h1>Whether incorporating is worth it.</h1>

${summary([
  { value: `${c.advantageThisYear >= 0 ? '+' : ''}${dollars(c.advantageThisYear)}`,
    label: 'better off incorporated, this year', strong: true },
  { value: c.deferredNotSaved ? dollars(c.deferredNotSaved) : 'none',
    label: 'of that, tax deferred rather than saved', strong: true },
  { value: dollars(c.drawnOut), label: 'drawn out to live on' },
  { value: dollars(Math.max(c.asSalary.retained, c.asDividend.retained)),
    label: 'left inside the corporation' },
])}

<form method="get" action="/incorporate" class="ask">
  <div class="row2">
    <div class="field">
      <label for="profit">Profit before you take anything</label>
      <input id="profit" name="profit" type="number" step="100" min="0"
        value="${(c.profit / 100).toFixed(0)}">
      <span class="sub">Revenue less expenses, before any tax and before you pay
      yourself.</span>
    </div>
    <div class="field">
      <label for="draw">How much you need to live on</label>
      <input id="draw" name="draw" type="number" step="100" min="0"
        value="${(c.drawnOut / 100).toFixed(0)}">
      <span class="sub">This is the number that decides the answer, not the profit.
      Everything you draw is taxed either way.</span>
    </div>
  </div>
  <button class="btn primary" type="submit">Work it out</button>
</form>

<div class="two">
  ${side(c.soleProprietor, c.advantageThisYear < 0)}
  ${side(bestCorporate === 'salary' ? c.asSalary : c.asDividend, c.advantageThisYear >= 0)}
</div>

<details class="why"><summary>The other corporate route, in full</summary>
  <div class="two">
    ${side(c.asSalary, false)}
    ${side(c.asDividend, false)}
  </div>
  <p class="hint">Salary is deductible to the corporation and builds RRSP room and
  CPP. A dividend is paid out of income already taxed inside the company and carries
  neither. Which is better is a separate question from this one, and the Pay screen
  answers it once you have incorporated.</p>
</details>

<h2>At what profit, rather than at this profit</h2>
<p class="hint">The same comparison, drawing ${dollars(c.drawnOut)} a year at each
level. The advantage grows with what is left behind, which is the whole mechanism:
it is not that higher income is taxed more kindly inside a corporation, it is that
money you do not need yet can wait.</p>
<div class="sheet">
  ${rows.map((r) => `<div class="frow pair"><span class="t">Profit of ${
    whole(r.profit)}</span>
    <span class="f num">${r.advantage >= 0 ? '+' : ''}${dollars(r.advantage)}</span></div>`).join('')}
</div>

${c.considerations.map((t) => `<div class="advisory info">${esc(t)}</div>`).join('')}

${notes(c.caveats, 'this comparison')}

${worksheetFooter('Incorporating is a legal decision with a tax consequence rather '
  + 'than a tax decision, and FileClear does not make it for you.')}
`, email, '/incorporate', chrome);
}

// ------------------------------------------------------------------- filing

/**
 * Filing a return, from FileClear to whoever receives it.
 *
 * FileClear cannot submit a GST/HST return, a T2, a T1 or an annual return on
 * anybody's behalf: CRA only accepts those from certified software, and the
 * registries have no public filing interface. So this screen does everything
 * short of the submit button. It says what to have in hand, gives the figures
 * in the order the form asks for them, links straight to where it is filed,
 * says how to pay, and then takes the confirmation number back so the filing
 * is marked done and a copy of what was sent is kept.
 */
export interface FilePageData {
  kind: GuideKind;
  filing: Filing;
  lines?: ReturnLine[];
  balance?: number;
  instalments?: number;
  method?: HstMethod;
  businessNumber?: string;
  record?: FiledRecord;
  sole: boolean;
  /** When the balance has to be paid, which can be earlier than the return. */
  payBy?: string;
  /** The T2 or T1 schedule by schedule, for returns filed through other software. */
  sections?: FigureSection[];
  /** Whether the figures behind the paid screens can be shown. */
  paid?: boolean;
}

const CRA_NETFILE = 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/gst-hst-netfile.html';
const CRA_ACCOUNT = 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/business-account.html';
const CRA_ACCESS_CODE = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return/how-file/get-gst-hst-access-code.html';
const CRA_PAY = 'https://www.canada.ca/en/revenue-agency/services/payments/payments-cra.html';
const CRA_T2_SOFTWARE = 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/corporation-internet-filing/software.html';
const CRA_T1_SOFTWARE = 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-individuals/netfile-overview/certified-software-netfile-program.html';
const CRA_IFT = 'https://apps.cra-arc.gc.ca/ebci/njfs/ext/disclaimer';
const CRA_IFT_READY = 'https://www.canada.ca/en/revenue-agency/services/e-services/filing-information-returns-electronically-t4-t5-other-types-returns-overview/filing-information-returns-electronically-t4-t5-other-types-returns-what-you-should-know-before.html';
const OBR_ANNUAL = 'https://www.ontario.ca/page/annual-return-filing-corporations-information-act';
const CC_ANNUAL = 'https://ised-isde.canada.ca/site/corporations-canada/en/annual-return-business-corporations';
const CC_ISC = 'https://ised-isde.canada.ca/site/corporations-canada/en/individuals-significant-control';

export function filePage(
  email: string, businessName: string, d: FilePageData, today: string,
  error?: string, chrome: Chrome = {},
): string {
  const f = d.filing;
  const step = (n: number, title: string, body: string) => `
  <div class="file-step">
    <span class="file-n">${n}</span>
    <div><h3>${esc(title)}</h3>${body}</div>
  </div>`;

  const copyRow = (l: ReturnLine) => `
    <div class="frow pair file-line${l.enter ? '' : ' calc'}">
      <span class="t"><span class="file-ln">${esc(l.line)}</span> ${esc(l.name)}
        ${l.enter ? '' : `<span class="sub">${d.kind === 't2' || d.kind === 't1'
          ? 'Check only.'
          : 'CRA calculates this one. Check it reads the same.'}</span>`}
        ${l.note ? `<span class="sub">${esc(l.note)}</span>` : ''}</span>
      <span class="f num"><span class="file-v">${(l.value / 100).toFixed(2)}</span>${
        l.enter ? '<button type="button" class="copy" hidden>Copy</button>' : ''}</span>
    </div>`;

  const recordForm = `
  <form method="post" action="/file/record" class="file-record">
    <input type="hidden" name="filing" value="${esc(f.id)}">
    ${d.instalments ? `<input type="hidden" name="instalments" value="${(d.instalments / 100).toFixed(2)}">` : ''}
    <div class="row2">
      <div class="field">
        <label for="filedOn">Date you filed it</label>
        <input id="filedOn" name="filedOn" type="date" required
          value="${esc(d.record?.filedOn ?? today)}" max="${esc(today)}">
      </div>
      <div class="field">
        <label for="confirmation">Confirmation number</label>
        <input id="confirmation" name="confirmation" type="text" autocomplete="off"
          value="${esc(d.record?.confirmation ?? '')}"
          placeholder="${d.kind === 'hst' ? 'six digits' : 'as shown when you submitted'}">
        <span class="sub">Keep it. It is the proof that this was sent, and the first thing
        ${esc(f.authority === 'CRA' ? 'CRA' : 'the registry')} asks for if it is ever questioned.</span>
      </div>
    </div>
    <button class="btn primary" type="submit">${d.record ? 'Update the record' : 'Record it as filed'}</button>
  </form>`;

  const filed = d.record ? `
  <div class="ok"><b>Filed ${esc(fmt(d.record.filedOn))}${
    d.record.confirmation ? `, confirmation ${esc(d.record.confirmation)}` : ''}.</b>
    ${d.record.figures.length ? 'The figures below are the ones you recorded as filed, kept as they were.' : ''}
  </div>` : '';

  let body = '';

  if (d.kind === 'hst' && d.lines) {
    const owing = d.balance ?? 0;
    body = `
    ${step(1, 'Have these in hand', `
      <p class="hint">Your business number, and either your CRA business account or your
      4-digit GST/HST access code. The code is in your CRA account under GST/HST, or CRA
      will give it to you by phone. <a href="${CRA_ACCESS_CODE}" rel="noopener" target="_blank">How
      to get the access code</a>.</p>
      <p class="hint">The reporting period is <b>${esc(fmt(f.coversFrom ?? f.coversUpTo))}</b> to
      <b>${esc(fmt(f.coversUpTo))}</b>. NETFILE asks for both dates.</p>
      <p class="hint">Every GST/HST return for a period that began in 2024 or later has to be
      filed electronically. Paper is not an option any more, and filing on paper carries a
      penalty.</p>`)}

    ${step(2, 'Type these into the return', `
      <p class="hint">In the order the form asks for them. ${d.method === 'quick'
        ? 'These are Quick Method figures, because that is how you told FileClear you file.'
        : 'These are regular method figures.'} Only the lines with a figure need attention;
      the rest are zero.</p>
      <form method="get" action="/file" class="file-inst">
        <input type="hidden" name="filing" value="${esc(f.id)}">
        <label for="instalments">HST instalments you paid for this period</label>
        <input id="instalments" name="instalments" type="text" inputmode="decimal"
          value="${d.instalments ? (d.instalments / 100).toFixed(2) : ''}" placeholder="0.00">
        <button class="btn small" type="submit">Apply</button>
      </form>
      <div class="sheet file-lines">
        <div class="sheet-head"><span>GST/HST return</span><span>${esc(fmt(f.coversUpTo))}</span></div>
        ${d.lines.filter((l) => l.value !== 0 || !l.enter || ['101', '103', '106'].includes(l.line)).map(copyRow).join('')}
      </div>`)}

    ${step(3, 'Submit it', `
      <p class="hint">Either way is electronic and either way is free. Your CRA account is the
      better of the two if you have one, because the access code is not needed and the
      return is kept there afterwards.</p>
      <div class="cta-row">
        <a class="btn primary" href="${CRA_ACCOUNT}" rel="noopener" target="_blank">CRA business account</a>
        <a class="btn" href="${CRA_NETFILE}" rel="noopener" target="_blank">GST/HST NETFILE</a>
      </div>
      <p class="hint">NETFILE gives you a six digit confirmation number when the return is
      accepted. Write it down before you close the page.</p>`)}

    ${step(4, owing > 0 ? `Pay ${dollars(owing)} by ${fmt(d.payBy ?? f.effectiveDue)}` : 'Nothing to pay', owing > 0 ? `
      ${d.payBy && d.payBy < f.effectiveDue ? `<p class="hint"><b>That is earlier than the
      return.</b> The return is due ${esc(fmt(f.effectiveDue))}, but the money was due
      ${esc(fmt(d.payBy))}.${today > d.payBy ? ' If it has not been paid, interest has been running since the day after.' : ''}</p>` : ''}
      <p class="hint">Filing and paying are separate. Filing the return does not pay it. The
      simplest route is online banking: add the Canada Revenue Agency GST/HST payee, and use
      your 15 character GST/HST account number, the one ending RT0001, as the account number.
      <a href="${CRA_PAY}" rel="noopener" target="_blank">Every way to pay CRA</a>.</p>`
      : `<p class="hint">${(d.balance ?? 0) < 0
        ? `This return claims a refund of ${dollars(-(d.balance ?? 0))}. CRA pays it once the return is processed.`
        : 'The return balances to nil, so there is no payment to make.'}</p>`)}

    ${step(5, 'Tell FileClear it is done', recordForm)}`;
  }

  else if (d.kind === 'annual-on') {
    body = `
    ${step(1, 'Have these in hand', `
      <p class="hint">Your Ontario corporation number and your company key, a 9 digit code
      the ministry issues free. If you do not have it, request it from the Ontario Business
      Registry and it arrives by email straight away when there is an address on file. You
      sign in with an Ontario.ca login.</p>`)}
    ${step(2, 'Check what the registry holds', `
      <p class="hint">An annual return is mostly confirmation: the registered office address,
      the mailing address, and the directors and officers. If anything has changed, the
      registry wants the change as well, and a director who left and was never removed is the
      commonest thing out of date.</p>
      <p class="hint">There is no fee.</p>`)}
    ${step(3, 'File it', `
      <div class="cta-row">
        <a class="btn primary" href="${OBR_ANNUAL}" rel="noopener" target="_blank">Ontario annual return</a>
      </div>
      <p class="hint">Due within six months of your fiscal year end: ${esc(fmt(f.effectiveDue))}.</p>`)}
    ${step(4, 'Tell FileClear it is done', recordForm)}`;
  }

  else if (d.kind === 'annual-federal') {
    body = `
    ${step(1, 'Have these in hand', `
      <p class="hint">Your corporation number and corporation key, or access to the
      corporation in Corporations Canada's Online Filing Centre as a full access manager or
      filing collaborator. The corporation key is a password; if it is lost, Corporations
      Canada will issue a new one.</p>`)}
    ${step(2, 'Have the significant control register ready', `
      <p class="hint">The annual return is now filed together with information on
      individuals with significant control: anybody who owns or controls 25% or more of the
      shares, or has direct or indirect influence over the corporation. FileClear does not
      hold this, so have the corporation's register open before you start.
      <a href="${CC_ISC}" rel="noopener" target="_blank">What counts as significant control</a>.</p>`)}
    ${step(3, 'File and pay', `
      <div class="cta-row">
        <a class="btn primary" href="${CC_ANNUAL}" rel="noopener" target="_blank">Corporations Canada annual return</a>
      </div>
      <p class="hint">$12 online, paid at the end of the filing. Due within 60 days of the
      anniversary of incorporation: ${esc(fmt(f.effectiveDue))}. A return filed before the
      anniversary is not accepted.</p>`)}
    ${step(4, 'Tell FileClear it is done', recordForm)}`;
  }

  else if (d.kind === 'slips') {
    const t5 = f.obligationId === 't5-slips';
    const year = f.coversUpTo.slice(0, 4);
    body = `
    ${step(1, 'Make the file', `
      <p class="hint">FileClear builds the ${t5 ? 'T5' : 'T4'} slips and summary as the XML file
      CRA's Internet File Transfer takes, starting from the slips screen's figures, which you confirm before the file is made. It asks
      for the ${t5 ? 'recipient' : 'employees'}' SINs and addresses when it makes the file and
      keeps neither.</p>
      <div class="cta-row">
        <a class="btn primary" href="/slips/file?year=${esc(year)}&amp;kind=${t5 ? 't5' : 't4'}">Make the ${t5 ? 'T5' : 'T4'} file for ${esc(year)}</a>
        <a class="btn" href="/slips?year=${esc(year)}">See the slips</a>
      </div>`)}
    ${step(2, 'Upload it to CRA', `
      <p class="hint">The steps are on the file screen, beside the download. You sign in with
      your CRA business account or a web access code, attach the file, and CRA answers with a
      submission number.</p>`)}
    ${step(3, 'Tell FileClear it is done', recordForm)}`;
  }

  else if (d.kind === 't2' || d.kind === 't1') {
    const t2 = d.kind === 't2';
    const sheets = (d.sections ?? []).map((sec) => `
      <div class="sheet file-lines">
        <div class="sheet-head"><span>${esc(sec.title)}</span><span>${esc(sec.form)}</span></div>
        ${sec.note ? `<div class="frow file-note"><span class="sub">${esc(sec.note)}</span></div>` : ''}
        ${sec.lines.map(copyRow).join('')}
      </div>`).join('');
    body = `
    ${step(1, 'Choose where to file it', t2 ? `
      <p class="hint">A T2 can only be sent to CRA by software CRA has certified, or by an
      accountant using it. FileClear is not certified, so the return goes in through one of
      them with the figures below typed in. Products on CRA's list aimed at a small
      corporation filing its own return include TurboTax Business Incorporated, UFile T2,
      CloudTax T2 Basic, T2Express, AuraTax and FutureTax T2. CRA does not recommend one over
      another and neither does FileClear. Check the product is certified for this tax year
      before paying for it.</p>
      <div class="cta-row">
        <a class="btn primary" href="${CRA_T2_SOFTWARE}" rel="noopener" target="_blank">CRA's certified T2 software</a>
      </div>
      <p class="hint">An accountant needs exactly the same figures. Send them this page's
      numbers along with the year end screen.</p>` : `
      <p class="hint">Your personal return, with the business on form T2125 inside it, goes
      in through NETFILE certified tax software. Several are free: CRA lists Better Tax,
      GenuTax Standard and Wealthsimple Tax as free. Before you start, check the
      one you pick handles form T2125 for self-employment income.</p>
      <div class="cta-row">
        <a class="btn primary" href="${CRA_T1_SOFTWARE}" rel="noopener" target="_blank">CRA's certified tax software</a>
      </div>`)}
    ${step(2, 'Have these in hand', t2 ? `
      <p class="hint">Your business number and corporation account, ending RC0001. The tax
      year: <b>${esc(fmt(f.coversFrom ?? f.coversUpTo))}</b> to <b>${esc(fmt(f.coversUpTo))}</b>.
      Each shareholder's name and percentage of shares, for Schedule 50. Last year's return,
      if there was one, because the software carries balances forward from it.</p>` : `
      <p class="hint">Your social insurance number, the fiscal period of the business,
      <b>${esc(fmt(f.coversFrom ?? f.coversUpTo))}</b> to <b>${esc(fmt(f.coversUpTo))}</b>, and
      the six digit industry code for what you do. The software has a search for the code.
      Any other slips you received, such as a T4 from a job or a T5 from a bank.</p>`)}
    ${step(3, 'Type these in', d.sections ? `
      <p class="hint">In the order the software asks for them. Figures marked as worked out
      by the software are there to check against, not to type.</p>
      ${sheets}` : d.paid ? `
      <p class="hint">FileClear could not find the fiscal year this return covers. The
      figures are on the year end screen. <a href="/year-end">Open year end</a>.</p>` : `
      <p class="hint">The figures come from the year end screen, which needs a subscription.
      <a href="/billing">See plans</a>.</p>`)}
    ${step(4, 'Submit it and pay', `
      <p class="hint">The software transmits it and shows a confirmation number when CRA
      accepts it. ${t2
        ? 'The balance of tax was due before the return, two or three months after the year end, and it is its own entry on your calendar.'
        : 'The balance is due 30 April even though the return is due 15 June, and it is its own entry on your calendar.'}
      <a href="${CRA_PAY}" rel="noopener" target="_blank">Every way to pay CRA</a>.</p>`)}
    ${step(5, 'Tell FileClear it is done', recordForm)}`;
  }

  else if (d.kind === 'payment') {
    body = `
    ${step(1, 'Work out the amount', `
      <p class="hint">${f.obligationId.startsWith('t2-balance') || f.obligationId.startsWith('t1-balance')
        ? `The year end screen has the figure. <a href="/year-end">Open year end</a>.`
        : 'Your CRA account shows the instalment amounts CRA expects. Paying those amounts exactly protects you from instalment interest even if the year turns out larger.'}</p>`)}
    ${step(2, `Pay it by ${fmt(f.effectiveDue)}`, `
      <p class="hint">Online banking is the simplest route. Add the Canada Revenue Agency
      payee for this kind of tax and use the account number it asks for:
      ${d.sole ? 'your social insurance number for personal tax, or your GST/HST account ending RT0001 for HST' : 'your corporation account, ending RC0001, for corporate tax, or your GST/HST account, ending RT0001, for HST'}.
      A payment to the wrong account sits there unapplied while interest runs on the right
      one. <a href="${CRA_PAY}" rel="noopener" target="_blank">Every way to pay CRA</a>.</p>`)}
    ${step(3, 'Tell FileClear it is paid', recordForm)}`;
  }

  else {
    body = `
    ${step(1, 'File it', `
      <p class="hint">${esc(f.detail)}</p>
      <div class="cta-row">
        <a class="btn primary" href="${esc(f.linkUrl)}" rel="noopener" target="_blank">${esc(f.linkLabel)}</a>
      </div>`)}
    ${step(2, 'Tell FileClear it is done', recordForm)}`;
  }

  return shell(`File: ${f.title}`, `
<span class="label">${esc(businessName)} &middot; ${esc(f.form)}</span>
<h1>${esc(f.title)}</h1>
<p class="hint">Due ${esc(fmt(f.effectiveDue))}${f.coversFrom
  ? `, for ${esc(fmt(f.coversFrom))} to ${esc(fmt(f.coversUpTo))}` : ''}. From
${esc(f.authority)}. <a href="/dashboard">Back to your calendar</a>.</p>

${error ? `<div class="err">${esc(error)}</div>` : ''}
${filed}

<div class="file-steps">${body}</div>

${d.kind === 't2' || d.kind === 't1' ? `<details class="why"><summary>Why FileClear does not send it for you</summary>
  <p>CRA accepts a ${d.kind === 't2' ? 'T2' : 'T1'} electronically only from software it has
  certified for that tax year, and certification is an application to CRA and a yearly
  test suite rather than a feature. Until FileClear is certified, the return goes in
  through software that is, which takes these figures as they are.</p>
</details>` : ''}

${d.kind === 'hst' ? `<details class="why"><summary>Why FileClear does not send it for you</summary>
  <p>CRA only accepts a GST/HST return transmitted on somebody's behalf from software it has
  certified, and certification is a process with CRA rather than a feature. Until FileClear
  is certified, the return goes in through your own CRA account or NETFILE, which takes a
  few minutes with the figures above in front of you.</p>
</details>` : ''}

${worksheetFooter()}

<script>
/* Copy buttons, added only where the clipboard is available. Without this
   script every figure is still plain text that can be selected, which is the
   point of adding them rather than depending on them. */
(function () {
  if (!navigator.clipboard) return;
  document.querySelectorAll('.file-line .copy').forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      var el = b.parentNode.querySelector('.file-v');
      var done = function (label) {
        b.textContent = label;
        setTimeout(function () { b.textContent = 'Copy'; }, 1600);
      };
      navigator.clipboard.writeText(el.textContent).then(function () {
        done('Copied');
      }, function () {
        /* The clipboard can be refused, by a browser setting or a policy.
           Selecting the figure means one keystroke still copies it, which is
           better than a button that silently does nothing. */
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        done('Selected');
      });
    });
  });
}());
</script>
`, email, '/dashboard', chrome);
}

// ------------------------------------------------------------- slip files

export type SlipKind = 't4' | 't5';

/** One slip on the file screen: the boxes, and who it is for as typed. */
export interface SlipRecipient {
  /** The name on the register, or blank when the slip came from the ledger. */
  label: string;
  boxes: SlipBox[];
  insurable: boolean;
  surname: string; given: string; sin: string;
  line1: string; city: string; prov: string; postal: string;
  /** Province of employment, for a T4. */
  empProv: string;
}

export interface SlipFileData {
  kind: SlipKind;
  year: number;
  deadline: string;
  eligible: boolean;
  filer: {
    bn: string; line1: string; city: string; prov: string; postal: string;
    contactName: string; contactPhone: string; contactEmail: string;
  };
  recipients: SlipRecipient[];
  errors: string[];
  /** The year FileClear's payroll tables are for. */
  rateYear: number;
}

/**
 * The T4 or T5 as a file for CRA's Internet File Transfer.
 *
 * The form asks only for what the slips screen cannot know: account numbers,
 * addresses and SINs. The amounts are the slips screen's and are shown rather
 * than editable, so the file can never say something the books do not.
 */
export function slipFilePage(
  email: string, companyName: string, d: SlipFileData, chrome: Chrome = {},
): string {
  const t4 = d.kind === 't4';
  const name = t4 ? 'T4' : 'T5';
  const f = d.filer;

  const provSelect = (id: string, value: string) => `<select id="${id}" name="${id}">${
    PROVINCE_CODES.map((p) => `<option${p === value ? ' selected' : ''}>${p}</option>`).join('')}</select>`;
  const field = (id: string, label: string, value: string, extra = '', sub = '') => `
    <div class="field"><label for="${id}">${esc(label)}</label>
      <input id="${id}" name="${id}" type="text" value="${esc(value)}" ${extra}>
      ${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  const step = (n: number, title: string, body: string) => `
  <div class="file-step">
    <span class="file-n">${n}</span>
    <div><h3>${esc(title)}</h3>${body}</div>
  </div>`;

  // On a T4 every box but 14 is an input: they record what was withheld,
  // which only the payroll records know for certain.
  const boxRow = (b: SlipBox, i: number) => t4 && b.box !== '14'
    ? `<div class="frow slip-box">
        <span class="d"><label for="s${i}_b${esc(b.box)}">${esc(b.box)}</label></span>
        <span class="t">${esc(b.label)}</span>
        <span class="f"><input id="s${i}_b${esc(b.box)}" name="s${i}_b${esc(b.box)}" type="text"
          inputmode="decimal" value="${(b.amount / 100).toFixed(2)}" required></span></div>`
    : `<div class="frow">
        <span class="d">${esc(b.box)}</span><span class="t">${esc(b.label)}</span>
        <span class="f num">${dollars(b.amount)}</span></div>`;

  const person = (r: SlipRecipient, i: number) => `
    <div class="sheet">
      <div class="sheet-head"><span>${esc(r.label || (d.recipients.length > 1 ? `Slip ${i + 1}` : `Who the ${name} is for`))}</span><span>${name}</span></div>
      ${r.boxes.filter((b) => t4 || b.amount !== 0 || b.keepIfZero).map((b) => boxRow(b, i)).join('')}
    </div>
    <div class="row2">
      ${field(`s${i}_surname`, 'Surname', r.surname, 'required maxlength="100" autocomplete="off"')}
      ${field(`s${i}_given`, 'Given name', r.given, 'maxlength="100" autocomplete="off"')}
    </div>
    ${field(`s${i}_sin`, 'Social insurance number', r.sin,
      'required inputmode="numeric" maxlength="11" autocomplete="off" placeholder="000 000 000"',
      'Checked here the way CRA checks it. Used for this file only and never saved.')}
    ${field(`s${i}_line1`, 'Home address', r.line1, 'required maxlength="100" autocomplete="off"')}
    <div class="row2">
      ${field(`s${i}_city`, 'City', r.city, 'required maxlength="100" autocomplete="off"')}
      <div class="row2">
        <div class="field"><label for="s${i}_prov">Province</label>${provSelect(`s${i}_prov`, r.prov)}</div>
        ${field(`s${i}_postal`, 'Postal code', r.postal, 'required maxlength="7" autocomplete="off"')}
      </div>
    </div>
    ${t4 ? `<div class="field"><label for="s${i}_empProv">Province of employment</label>
      ${provSelect(`s${i}_empProv`, r.empProv)}
      <span class="sub">Where they reported for work, which decides the provincial tax on the slip.</span></div>` : ''}`;

  const form = d.recipients.length ? `
  <form method="post" action="/slips/file">
    <input type="hidden" name="kind" value="${d.kind}">
    <input type="hidden" name="year" value="${d.year}">

    ${step(1, t4 ? 'The employer' : 'The payer', `
      ${field('bn', t4 ? 'Payroll account number' : 'Information return account number', f.bn,
        `required maxlength="17" autocomplete="off" placeholder="123456789${t4 ? 'RP' : 'RZ'}0001"`,
        t4 ? 'The account your source deductions are remitted to, ending RP0001.'
          : 'T5s are filed under an RZ account, not the payroll account. If you do not have one, CRA opens it by phone or in your business account.')}
      ${field('line1', 'Business address', f.line1, 'required maxlength="100"')}
      <div class="row2">
        ${field('city', 'City', f.city, 'required maxlength="100"')}
        <div class="row2">
          <div class="field"><label for="prov">Province</label>${provSelect('prov', f.prov)}</div>
          ${field('postal', 'Postal code', f.postal, 'required maxlength="7"')}
        </div>
      </div>
      <div class="row2">
        ${field('contactName', 'Contact person', f.contactName, 'required maxlength="100"',
          'Who CRA calls with a question about this return.')}
        ${field('contactPhone', 'Contact phone', f.contactPhone, 'required inputmode="tel" maxlength="20"')}
      </div>
      ${field('contactEmail', 'Contact email', f.contactEmail, 'required inputmode="email" maxlength="60"')}
      <p class="hint">Kept for next year, so this part is typed once.</p>`)}

    ${step(2, t4 ? 'The employees' : 'The shareholder', `
      ${t4 ? `<p class="hint">Box 14 is the salary in your ledger. The deductions are what
      FileClear worked out should have been withheld. A slip reports what actually was, so
      check each one against your payroll records and change any that differ.</p>
      ${d.year !== d.rateYear ? `<div class="advisory"><b>Check these closely.</b>
      FileClear's payroll tables are for ${d.rateYear}, so the deductions below were worked out
      at ${d.rateYear} rates. The ${d.year} rates and ceilings were different, and the
      ${d.year} slip has to show what was withheld in ${d.year}.</div>` : ''}` : ''}
      ${!t4 ? `<p class="hint">All ${esc(String(d.year))} ${d.eligible ? 'eligible' : 'non-eligible'} dividends
      in the ledger go on one slip. If more than one shareholder was paid, each needs their
      own slip for their own share, and FileClear cannot split the ledger total between
      them, so file those through CRA's Web Forms instead.</p>` : ''}
      ${d.recipients.map(person).join('')}`)}

    ${step(3, 'Download the file', `
      <button class="btn primary" type="submit">Download the ${name} file</button>
      <p class="hint">It holds the ${name} slips and the ${name} Summary together, which is
      everything CRA needs for ${d.year}.</p>`)}
  </form>` : `
  <div class="advisory info">Nothing was paid in ${d.year} that goes on a ${name}, so there is
  no file to make. <a href="/slips?year=${d.year}">Back to the slips</a>.</div>`;

  return shell(`${name} file for ${d.year}`, `
<span class="label">${esc(companyName)} &middot; ${name} for CRA</span>
<h1>The ${name} file for ${d.year}.</h1>
<p class="hint">Due ${esc(fmt(d.deadline))}. FileClear writes the ${name} as the XML file CRA's
Internet File Transfer accepts, checked against CRA's published schema. You upload it; it
takes a few minutes. <a href="/slips?year=${d.year}">Back to the slips</a>.</p>

${d.errors.length ? `<div class="err"><b>The file was not made.</b><ul>${
  d.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}

<div class="file-steps">
${form}

${d.recipients.length ? step(4, 'Upload it to CRA', `
  <ol class="hint">
    <li>Sign in to Internet File Transfer. From your CRA business account, choose
      File a return. Without one, <a href="${CRA_IFT}" rel="noopener" target="_blank">sign in
      with a web access code</a> using the same account number that is in the file.</li>
    <li>Attach the file you downloaded and submit it.</li>
    <li>CRA shows a Confirmation of Receipt with a submission number, and a count of
      returns accepted and rejected. Write the number down before you leave the page:
      the filing report is only reachable from that screen.</li>
    <li>Record the submission number against the ${name} on your calendar, so it is marked
      filed. <a href="/dashboard">Open the calendar</a>.</li>
  </ol>
  <p class="hint">No web access code? CRA issues one online or on 1-800-959-5525.
  <a href="${CRA_IFT_READY}" rel="noopener" target="_blank">What CRA says to have ready</a>.</p>`) : ''}

${d.recipients.length ? step(5, 'Give each person their copy', `
  <p class="hint">Filing with CRA does not send anyone their slip. Each ${t4 ? 'employee' : 'shareholder'}
  gets their own copy by the same date, ${esc(fmt(d.deadline))}, with the boxes shown above.</p>`) : ''}
</div>

<details class="why"><summary>What FileClear keeps from this page</summary>
  <p>The account number, the business address and the contact, so next year starts filled
  in. Not the SINs or the home addresses: they go into the file you download and nowhere
  else, and FileClear holds no record of them.</p>
</details>
`, email, '/slips', chrome);
}
