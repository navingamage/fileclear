#!/usr/bin/env python3
"""Assemble site/ for FileClear.

No build step for the HTML in the sense that matters: every page is
self contained and readable, and this script only exists so the shared
chrome is written once rather than five times.

Colours and type come from site/brand/tokens.css, which the application links
too, so the marketing pages and the product cannot drift apart.
"""

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = ROOT / "site"

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    'family=IBM+Plex+Sans:wght@400;500;600;700&'
    'family=IBM+Plex+Mono:wght@400;500&display=swap">'
)

HEADLINKS = (
    '<link rel="stylesheet" href="/brand/tokens.css">\n'
    '<link rel="icon" href="/favicon.ico" sizes="any">\n'
    '<link rel="icon" type="image/svg+xml" href="/brand/mark.svg">\n'
    '<link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png">\n'
    '<link rel="icon" type="image/png" sizes="192x192" href="/brand/icon-192.png">\n'
    '<link rel="apple-touch-icon" href="/brand/icon-180.png">\n'
    '<meta name="theme-color" content="#ffffff">'
)

STYLE = """<style>
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: var(--font-body); font-size: 17px; line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  :focus-visible { outline: 2.5px solid var(--brand); outline-offset: 3px; border-radius: 4px; }
  img { max-width: 100%; display: block; }

  .wrap { max-width: 1220px; margin: 0 auto; padding: 0 28px; }
  .narrow { max-width: 660px; }

  /* Large and light, the way the reference sets big type. Weight 500 rather
     than 800: at 60px a heavy face shouts, and this page is not shouting. */
  h1, h2, h3 {
    font-family: var(--font-display); letter-spacing: -.035em;
    line-height: 1.1; margin: 0; text-wrap: balance; font-weight: 600;
  }
  h1 { font-size: clamp(2.5rem, 5.1vw, 3.7rem); }
  h2 { font-size: clamp(1.8rem, 3.4vw, 2.5rem); }
  h3 { font-size: 1.13rem; font-weight: 600; letter-spacing: -.022em; line-height: 1.32; }
  p { margin: 0 0 1.1rem; }
  .lead { font-size: clamp(1.06rem, 1.5vw, 1.22rem); color: var(--ink-2); line-height: 1.55; }
  /* Headings carry no margins of their own, which is right inside the grids,
     so the space under a headline is set on the pairing. Without this the lede
     sits directly against the baseline of a 60px h1. */
  h1 + .lead { margin-top: clamp(1.05rem, 1.5vw, 1.45rem); }
  .muted { color: var(--muted); }
  .eyebrow {
    display: inline-block; font-family: var(--font-mono); font-size: .71rem;
    letter-spacing: .15em; text-transform: uppercase; color: var(--brand);
    margin-bottom: 1.1rem;
  }

  .skip { position: absolute; left: 50%; translate: -50% -200%; z-index: 90;
    background: var(--surface); border: 1px solid var(--line-2);
    padding: .7rem 1.2rem; font-weight: 600; }
  .skip:focus { translate: -50% 0; text-decoration: none; }

  header.nav { position: sticky; top: 0; z-index: 60; background: var(--bg);
    border-bottom: 1px solid var(--line); }
  .nav-in { display: flex; align-items: center; gap: 2rem; padding: .85rem 0; }
  .brand { display: flex; align-items: center; gap: .6rem;
    font-family: var(--font-display); font-weight: 600; font-size: 1.12rem;
    letter-spacing: -.04em; }
  .brand:hover { text-decoration: none; }
  .brand img { width: 32px; height: 32px; border-radius: 8px; }
  .nav-links { display: flex; gap: 1.7rem; margin-left: auto; }
  .nav-links a { color: var(--ink-2); font-size: .95rem; font-weight: 500; }
  .nav-links a:hover { color: var(--ink); text-decoration: none; }
  @media (max-width: 900px) { .nav-links { display: none; } .nav-in { gap: 1rem; } }

  .btn { display: inline-flex; align-items: center; justify-content: center;
    padding: .82rem 1.5rem; border-radius: var(--radius-btn);
    font-weight: 600; font-size: 1rem; border: 1.5px solid transparent;
    background: var(--sunk); color: var(--ink); white-space: nowrap; }
  .btn:hover { text-decoration: none; filter: brightness(.96); }
  .btn.primary { background: var(--primary); color: var(--primary-ink); }
  .btn.brand { background: var(--brand); color: var(--brand-ink); }
  .btn.ghost { background: transparent; border-color: var(--line-2); }
  .btn.small { padding: .5rem 1rem; font-size: .92rem; }
  /* On a black section the buttons invert, the way the reference does it. */
  .on-dark .btn { background: rgba(255,255,255,.12); color: var(--on-dark);
    border-radius: var(--radius-pill); }
  .on-dark .btn.primary { background: #fff; color: #0b0d0f; }

  section { padding: clamp(3.6rem, 7vw, 6.4rem) 0; }
  .band { background: var(--band); }
  .ice { background: var(--ice); }
  .on-dark { background: var(--dark); color: var(--on-dark); }
  .on-dark h1, .on-dark h2, .on-dark h3 { color: var(--on-dark); }
  .on-dark .lead, .on-dark p { color: var(--on-dark-2); }
  .on-dark .eyebrow { color: #ff8a94; }

  /* Hero: copy on the left, the product on the right, in one row. Not a
     headline over a floating panel, which is what read as uneven. */
  .hero { padding-top: clamp(3rem, 5vw, 4.6rem); }
  .hero-grid { display: grid; grid-template-columns: minmax(0,.92fr) minmax(0,1.08fr);
    gap: clamp(2rem, 5vw, 4.5rem); align-items: center; }
  @media (max-width: 1000px) { .hero-grid { grid-template-columns: 1fr; } }
  .hero .lead { max-width: 42ch; }
  .cta-row { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: 1.9rem; }
  .hero-note { color: var(--ink-2); font-size: .97rem; margin-top: 1.6rem;
    max-width: 46ch; line-height: 1.55; }
  .hero-note b { color: var(--ink); font-weight: 600; }

  .nav-signin { font-size: .95rem; font-weight: 500; color: var(--muted);
    margin-right: .2rem; }
  .nav-signin:hover { color: var(--ink); text-decoration: none; }
  @media (max-width: 620px) { .nav-signin { display: none; } }

  /* Three across, on the same grid as .cards above.
     The first version was two cards at 760px under a heading that ran the full
     1164, which left four hundred pixels of ragged space on the right and broke
     the rhythm every other section on the page keeps. */
  /* No align-items here on purpose: the default stretch is what gives the three
     a level bottom edge, and with the button pushed down by margin-top:auto the
     two prices line up regardless of how much copy each carries. */
  .plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem; }
  @media (max-width: 900px) { .plans { grid-template-columns: 1fr; } }
  .plan { background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 1.6rem 1.5rem 1.7rem;
    display: flex; flex-direction: column; height: 100%; }
  /* The yearly plan is the one worth taking, so it is the one that is marked. */
  .plan.best { border-color: var(--ink); box-shadow: var(--shadow-lg); }
  .plan-name { font-family: var(--font-mono); font-size: .72rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--brand); display: block;
    margin-bottom: .8rem; }
  .plan-name em { font-style: normal; color: var(--muted); }
  .plan-price { margin: 0 0 .5rem; display: flex; align-items: baseline; gap: .45rem; }
  .plan-price b { font-family: var(--font-mono); font-size: 2.5rem; font-weight: 500;
    letter-spacing: -.045em; font-variant-numeric: tabular-nums; line-height: 1; }
  .plan-price span { color: var(--muted); font-size: .92rem; }
  .plan-note { color: var(--ink-2); font-size: .95rem; margin: 0 0 1.4rem;
    line-height: 1.55; }
  /* Pushes the button to the bottom so all three line up whatever the copy does. */
  .plan .btn { margin-top: auto; align-self: flex-start; }
  .plan ul { margin: 0; padding-left: 1.1rem; color: var(--ink-2); font-size: .94rem; }
  .plan li { margin-bottom: .42rem; }
  .plan li:last-child { margin-bottom: 0; }
  /* Dark mode follows the same surfaces the other cards use. */
  .on-dark .plan { background: var(--dark-2); border-color: rgba(255,255,255,.1); }

  .plan-fineprint { margin-top: 1.6rem; color: var(--muted); font-size: .88rem;
    max-width: 62ch; }

  /* The calendar panel. Sits in the hero grid rather than centred under it. */
  .panel { background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
  .panel-bar { display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; padding: .95rem 1.3rem; border-bottom: 1px solid var(--line);
    background: var(--band); }
  .panel-bar b { font-size: .93rem; font-weight: 700; letter-spacing: -.01em; color: var(--ink); }
  .panel-bar span { font-family: var(--font-mono); font-size: .72rem; color: var(--muted); }
  .frow { display: grid; grid-template-columns: 5rem 1fr auto; gap: .9rem;
    align-items: center; padding: .82rem 1.3rem; border-bottom: 1px solid var(--line); }
  .frow:last-child { border-bottom: 0; }
  .frow .d { font-family: var(--font-mono); font-size: .8rem;
    font-variant-numeric: tabular-nums; color: var(--muted); }
  .frow .t { font-size: .95rem; font-weight: 500; color: var(--ink); }
  .frow .tag { font-family: var(--font-mono); font-size: .66rem; letter-spacing: .05em;
    padding: .26rem .58rem; border-radius: var(--radius-pill);
    background: var(--sunk); color: var(--muted); white-space: nowrap; }
  .frow.soon { background: var(--danger-tint); }
  .frow.soon .d { color: var(--danger); font-weight: 600; }
  .frow.soon .tag { background: var(--danger); color: #fff; }
  .frow.cleared .tag { background: #dff3e6; color: #14663f; }

  /* Section heading that sits left with supporting copy on the right, which is
     what stops every section being a centred stack.

     Baseline rather than end: the two columns line up on the first line of each,
     which holds whatever their relative heights are. Bottom alignment only looks
     deliberate while the heading and the copy are close in height, and on the
     contact section, where a one line heading sits beside three lines of copy,
     it dropped the heading to the floor of the row and left a hole above it. */
  .sec-head { display: grid; grid-template-columns: 1.05fr 1fr; gap: 2.5rem;
    align-items: baseline; margin-bottom: 2.8rem; }
  .sec-head .eyebrow { grid-column: 1 / -1; margin-bottom: .4rem; }
  .sec-head p { margin: 0; }
  @media (max-width: 860px) { .sec-head { grid-template-columns: 1fr; gap: 1rem; } }

  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem; }
  @media (max-width: 900px) { .cards { grid-template-columns: 1fr; } }
  .card { background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 1.6rem 1.5rem 1.7rem; }
  .on-dark .card { background: var(--dark-2); border-color: rgba(255,255,255,.1); }
  .card .num { font-family: var(--font-mono); font-size: .72rem; color: var(--brand);
    letter-spacing: .1em; display: block; margin-bottom: .8rem; }
  .on-dark .card .num { color: #ff8a94; }
  .card p { margin: .5rem 0 0; color: var(--ink-2); font-size: .97rem; }
  .on-dark .card p { color: var(--on-dark-2); }

  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.1rem; }
  @media (max-width: 860px) { .split { grid-template-columns: 1fr; } }
  .split .who { font-family: var(--font-mono); font-size: .72rem; color: var(--muted);
    display: block; margin: .3rem 0 1rem; }
  .split ul { margin: 0; padding-left: 1.15rem; color: var(--ink-2); font-size: .97rem; }
  .split li { margin-bottom: .5rem; }
  .split li b { color: var(--ink); font-weight: 700; }

  /* A wide row: statement on the left, three figures on the right. */
  .figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem;
    margin-top: 2.4rem; }
  @media (max-width: 760px) { .figures { grid-template-columns: 1fr; } }
  /* Figures get the mono, with tabular spacing. It is the one typographic
     thing a ledger genuinely needs and the reason the Mono is here at all. */
  .figure b { display: block; font-family: var(--font-mono); font-weight: 500;
    font-size: 2.2rem; letter-spacing: -.03em; line-height: 1.05;
    font-variant-numeric: tabular-nums; }
  .figure span { display: block; color: var(--muted); font-size: .95rem; margin-top: .5rem; }
  .on-dark .figure span { color: var(--on-dark-2); }

  .prose h2 { font-size: 1.4rem; margin: 2.5rem 0 .7rem; font-weight: 600; }
  .prose h3 { margin: 1.9rem 0 .35rem; font-size: 1.04rem; }
  .prose p { color: var(--ink-2); }
  .prose a { color: var(--brand); font-weight: 600; text-decoration: underline; }

  /* The footer is a two column band, not a stack.

     It used to be brand, then a row of links, then the disclaimer, all flush
     left inside a 1220px wrap. Every line of it wrapped inside the left half of
     the page and the right half was empty, which reads as a column that lost
     its neighbour rather than as a layout. The links carry their groups now and
     sit opposite the brand, and the line that has to be read last, the
     copyright, sits under a rule at the bottom where it is looked for. */
  footer { border-top: 1px solid var(--line); padding: 3.4rem 0 2.4rem; }
  .foot-top { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: 3rem; align-items: start; }
  .foot-brand .fine { margin-top: 1.15rem; }
  .foot-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; }
  .foot-h { font-family: var(--font-mono); font-size: .72rem; letter-spacing: .13em;
    text-transform: uppercase; color: var(--ink); margin: 0 0 .9rem; }
  .foot-cols ul { list-style: none; margin: 0; padding: 0; }
  .foot-cols li { margin-bottom: .55rem; }
  .foot-cols a { color: var(--muted); font-size: .94rem; }
  .foot-cols a:hover { color: var(--ink); }
  .foot-base { display: flex; flex-wrap: wrap; justify-content: space-between;
    gap: .5rem 1.6rem; margin-top: 3rem; padding-top: 1.4rem;
    border-top: 1px solid var(--line); }
  .foot-base p { margin: 0; color: var(--muted); font-size: .86rem; }
  @media (max-width: 760px) {
    .foot-top { grid-template-columns: 1fr; gap: 2.4rem; }
  }
  /* 62ch rather than 70: the disclaimer sits in a column now, and a measure set
     against the old full width paragraph overflows it. */
  .fine { color: var(--muted); font-size: .86rem; max-width: 62ch; margin: 0; }

  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>"""

NAV = """<a class="skip" href="#main">Skip to content</a>
<header class="nav"><div class="wrap nav-in">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="34" height="34">FileClear</a>
  <nav class="nav-links" aria-label="Main">
    <a href="/#how">How it works</a>
    <a href="/#different">Why yours differs</a>
    <a href="/#pricing">Pricing</a>
    <a href="/download">Download</a>
    <a href="/support">Support</a>
  </nav>
  <a class="nav-signin" href="/signin">Sign in</a>
  <a class="btn primary small" href="/signup">Start free</a>
</div></header>"""

FOOT = """<footer><div class="wrap">
  <div class="foot-top">
    <div class="foot-brand">
      <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="34" height="34">FileClear</a>
      <p class="fine">FileClear keeps records and works out dates. It is not an accountant,
      it gives no tax advice, and it does not file anything with CRA or with the province
      on your behalf. Every date links to the authority that publishes it, and that
      authority is the one to check before you rely on a date.</p>
    </div>
    <nav class="foot-cols" aria-label="Footer">
      <div>
        <p class="foot-h">Product</p>
        <ul>
          <li><a href="/#how">How it works</a></li>
          <li><a href="/#different">Why yours differs</a></li>
          <li><a href="/download">Mac and Windows</a></li>
          <li><a href="/support">Support</a></li>
        </ul>
      </div>
      <div>
        <p class="foot-h">Company</p>
        <ul>
          <li><a href="/privacy">Privacy</a></li>
          <li><a href="/terms">Terms</a></li>
          <li><a href="https://antipodetech.com/">Antipode Technologies</a></li>
        </ul>
      </div>
    </nav>
  </div>
  <div class="foot-base">
    <p>&copy; 2026 Antipode Technologies Inc., made in Ontario, Canada.</p>
    <!--email_off--><p><a href="mailto:hello@fileclear.ca">hello@fileclear.ca</a></p><!--/email_off-->
  </div>
</div></footer>"""


def page(slug: str, title: str, desc: str, body: str, canonical: bool = True) -> str:
    canon = f'\n<link rel="canonical" href="https://fileclear.ca/{slug}">' if canonical else ""
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{title}</title>\n"
        f'<meta name="description" content="{desc}">{canon}\n'
        f"{HEADLINKS}\n{FONTS}\n{STYLE}\n</head>\n<body>\n{NAV}\n"
        f'<main id="main">\n{body}\n</main>\n{FOOT}\n</body>\n</html>\n'
    )


INDEX = """<section class="hero"><div class="wrap hero-grid">
  <div>
    <span class="eyebrow">Canadian business filings</span>
    <h1>Never miss a filing again.</h1>
    <p class="lead">FileClear reads how your business is set up and builds the exact
    calendar that follows from it. Every date, every form, every authority.
    Incorporated or not.</p>
    <div class="cta-row">
      <a class="btn primary" href="/signup">Start free</a>
      <a class="btn ghost" href="#how">See how it works</a>
    </div>
    <p class="hero-note"><b>A CPA charges $2,000 to $4,000 a year to keep track of
    this.</b> FileClear is $29 a month, free until you file from it, and there is no
    card to begin.</p>
  </div>

  <div class="panel">
    <div class="panel-bar">
      <b>Antipode Technologies Inc.</b>
      <span>31 Dec year end &middot; Ontario</span>
    </div>
    <div class="frow cleared"><span class="d">15 Jan</span><span class="t">Payroll source deductions</span><span class="tag">Done</span></div>
    <div class="frow soon"><span class="d">28 Feb</span><span class="t">T4 and T5 slips</span><span class="tag">14 days</span></div>
    <div class="frow"><span class="d">15 Mar</span><span class="t">Employer health tax return</span><span class="tag">EHT</span></div>
    <div class="frow"><span class="d">31 Mar</span><span class="t">HST return and payment</span><span class="tag">GST34</span></div>
    <div class="frow"><span class="d">31 Mar</span><span class="t">Corporate tax balance</span><span class="tag">Payment</span></div>
    <div class="frow"><span class="d">30 Jun</span><span class="t">Corporate income tax return</span><span class="tag">T2</span></div>
    <div class="frow"><span class="d">30 Jun</span><span class="t">Ontario annual return</span><span class="tag">Registry</span></div>
  </div>
</div></section>

<section class="on-dark"><div class="wrap">
  <div class="sec-head">
    <span class="eyebrow">The problem</span>
    <h2>Several obligations. Different clocks. Two governments.</h2>
    <p class="lead">No single place tells you which of them are yours, which is why
    the deadline people miss is usually one they never knew existed.</p>
  </div>
  <div class="figures">
    <div class="figure"><b>30 April</b><span>when a self-employed person&rsquo;s balance
      is due, six weeks before the return itself. The filing date was extended and the
      payment date was not.</span></div>
    <div class="figure"><b>60 days</b><span>after your incorporation anniversary, if you
      are federal. Nothing else you owe runs on that clock.</span></div>
    <div class="figure"><b>2021</b><span>when the Ontario annual return moved to the
      provincial registry and stopped riding along with the T2.</span></div>
  </div>
</div></section>

<section id="how"><div class="wrap">
  <div class="sec-head">
    <span class="eyebrow">How it works</span>
    <h2>Answer a few questions once.</h2>
    <p class="lead">All of it comes off documents you already have. Nothing needs an
    accountant to fill in.</p>
  </div>
  <div class="cards">
    <div class="card">
      <span class="num">01</span>
      <h3>Describe the business</h3>
      <p>Incorporated or not, where and when it started, your HST registration,
      whether anybody is on payroll.</p>
    </div>
    <div class="card">
      <span class="num">02</span>
      <h3>Get your calendar</h3>
      <p>Every date those answers produce, with the form, the authority, and what
      happens if it slips. We email before each one.</p>
    </div>
    <div class="card">
      <span class="num">03</span>
      <h3>File with the numbers</h3>
      <p>HST returns worked out both ways, year end figures, and the amounts each
      form asks for, on a T2 or a T2125.</p>
    </div>
  </div>
</div></section>

<section class="band" id="different"><div class="wrap">
  <div class="sec-head">
    <span class="eyebrow">Why yours differs</span>
    <h2>Two businesses, two completely different years.</h2>
    <p class="lead">Same revenue, same city, same work. The first question during
    setup, and almost nothing about their calendars matches.</p>
  </div>
  <div class="split">
    <div class="card">
      <h3>A sole proprietorship</h3>
      <span class="who">calendar year &middot; no employees &middot; annual HST</span>
      <ul>
        <li>The balance due <b>30 April</b>, and the return itself <b>15 June</b></li>
        <li>HST on exactly the same two dates, for exactly the same reason</li>
        <li>No T2, and no annual return to any registry</li>
        <li>A registered business name that expires after <b>five years</b> with
        nothing to chase it</li>
      </ul>
    </div>
    <div class="card">
      <h3>A federal corporation</h3>
      <span class="who">30 Jun year end &middot; dividends &middot; quarterly HST</span>
      <ul>
        <li>Annual return to <b>Corporations Canada</b>, 60 days after the incorporation anniversary</li>
        <li>T2 six months after year end, tax payable two or three months after it</li>
        <li>T5 slips by the end of February</li>
        <li>Four HST returns, counted back from a June year end</li>
      </ul>
    </div>
  </div>
</div></section>

<section class="band" id="pricing"><div class="wrap">
  <div class="sec-head">
    <span class="eyebrow">Pricing</span>
    <h2>One price. Every filing.</h2>
    <p class="lead">A CPA charges $2,000 to $4,000 a year to do what is on this page.
    FileClear does not file for you, and it does not charge like something that does.</p>
  </div>

  <div class="plans">
    <div class="plan">
      <span class="plan-name">Monthly</span>
      <p class="plan-price"><b>$29</b><span>per month</span></p>
      <p class="plan-note">Cancel any time. Cancelling stops the next payment and
      leaves the period you have paid for running to its end.</p>
      <a class="btn primary" href="/signup">Start free</a>
    </div>

    <div class="plan best">
      <span class="plan-name">Yearly <em>&middot; two months free</em></span>
      <p class="plan-price"><b>$290</b><span>per year</span></p>
      <p class="plan-note">The same product, billed once instead of twelve times.
      That is $24.17 a month.</p>
      <a class="btn primary" href="/signup">Start free</a>
    </div>

    <div class="plan">
      <span class="plan-name">Both include</span>
      <ul>
        <li>Every filing your business owes, on one calendar</li>
        <li>Reminders before a window closes, not after</li>
        <li>HST computed both ways, with the difference</li>
        <li>Year end: the T2 schedules, or a T2125 with the home office worked out</li>
        <li>Salary against dividends, both columns</li>
        <li>Whether incorporating is worth it, with the arithmetic</li>
        <li>T4 and T5 figures, box by box</li>
        <li>Mac and Windows as well as the browser</li>
        <li>As many businesses as you run</li>
      </ul>
    </div>
  </div>

  <p class="plan-fineprint">There is no tier where the calendar stops at three
  filings. Prices in Canadian dollars, HST added where it applies. FileClear works
  out what you owe and when; it is not certified by CRA and does not file anything
  for you.</p>
</div></section>

<section class="on-dark"><div class="wrap">
  <div class="sec-head">
    <span class="eyebrow">Start</span>
    <h2>Tell it how you are set up.</h2>
    <p class="lead">A few questions about the business, and the calendar that follows
    from them. Free until you rely on it, and no card to begin.</p>
  </div>
  <div class="cta-row">
    <a class="btn primary" href="/signup">Create an account</a>
    <a class="btn ghost" href="/signin">Sign in</a>
  </div>
</div></section>"""

SUPPORT = """<section><div class="wrap narrow prose">
  <span class="eyebrow">Support</span>
  <h1 style="font-size:clamp(2.2rem,5vw,3.2rem)">Getting help</h1>
  <p class="lead">Email is the whole support system, and it reaches a person.</p>
  <p><!--email_off--><a href="mailto:hello@fileclear.ca?subject=Support">hello@fileclear.ca</a><!--/email_off--><br>
  Antipode Technologies Inc., Ontario, Canada.</p>

  <h2>Common questions</h2>
  <h3>Does FileClear file my return for me?</h3>
  <p>No. It works out what is due and produces the numbers. You file, or your accountant
  does. It is not certified by CRA to transmit returns.</p>
  <h3>Is this tax advice?</h3>
  <p>No. Where a decision is a judgement, FileClear shows the arithmetic for each option
  and the rule behind it, and stops there.</p>
  <h3>Which businesses does it cover?</h3>
  <p>Canadian corporations, federal or provincial, and sole proprietorships. The rules
  are most complete for Ontario, which is where it is being built and tested first.
  Partnerships are not covered: a T5013 and an allocation between partners is work
  worth doing properly rather than approximately.</p>
  <h3>I am a sole proprietor. Is this not just for corporations?</h3>
  <p>It was. It is not now. The two are different enough that almost no filing is
  shared, which is exactly why one calendar built from the right answer is worth
  having: the 15 June filing deadline that people hear about is a filing deadline
  only, and the money is due 30 April.</p>
  <h3>Is there a Mac or Windows app?</h3>
  <p>Yes. <a href="/download">Download it here.</a> The rules stay on the server, so
  a corrected rate reaches the app without you updating anything.</p>
  <h3>Where do the dates come from?</h3>
  <p>Every obligation links to the CRA, Corporations Canada or Ontario page that
  publishes it. FileClear tells you a date is coming. It is not the authority on the
  date, and the link is how you check us.</p>
</div></section>"""

PRIVACY = """<section><div class="wrap narrow prose">
  <span class="eyebrow">Privacy</span>
  <h1 style="font-size:clamp(2.2rem,5vw,3.2rem)">Privacy policy</h1>
  <p class="muted">Last updated 8 September 2026</p>
  <h2>What we hold</h2>
  <p>What you enter about your corporation: its name, where and when it was incorporated,
  its year end, its tax registrations, and the transactions and documents you add. This is
  business information and we treat it as confidential.</p>
  <h2>What we do with it</h2>
  <p>We use it to work out your filing calendar and your figures, and for nothing else. We
  do not sell it, we do not share it, and we do not train anything on it.</p>
  <h2>Where it lives</h2>
  <p>On Cloudflare infrastructure. Documents you upload sit in private storage and are
  served only through the application after it has checked your session, so there is no
  public link to guess.</p>
  <h2>Payments</h2>
  <p>Handled by Stripe. We never see or store a card number.</p>
  <h2>Getting it back, or deleting it</h2>
  <p>Ask and we will export everything we hold about your corporation, or delete it. CRA
  requires business records to be kept six years, so deleting your account is not a
  substitute for keeping your own copies.</p>
  <h2>Contact</h2>
  <p><!--email_off--><a href="mailto:hello@fileclear.ca?subject=Privacy">hello@fileclear.ca</a><!--/email_off--></p>
</div></section>"""

TERMS = """<section><div class="wrap narrow prose">
  <span class="eyebrow">Terms</span>
  <h1 style="font-size:clamp(2.2rem,5vw,3.2rem)">Terms of use</h1>
  <p class="muted">Last updated 8 September 2026</p>
  <h2>The important one</h2>
  <p>FileClear is a record keeping and calculation tool. It is not an accountant, it gives
  no tax, legal or financial advice, and it does not file anything with CRA or with any
  province on your behalf. Filing correctly and on time remains yours. Every date links to
  the authority that publishes it, and that authority governs.</p>
  <h2>What you get</h2>
  <p>A licence to use FileClear for your own corporations, for as long as your
  subscription runs. The service is provided as it is, without warranty.</p>
  <h2>Your records</h2>
  <p>Your data stays yours. We hold it to run the service and you can export or delete it.
  CRA requires records to be kept six years, and that obligation is yours.</p>
  <h2>Payment</h2>
  <p>Subscriptions are billed through Stripe. Cancel any time; cancelling stops the next
  renewal and leaves the service running to the end of the period you paid for.</p>
  <h2>Governing law</h2>
  <p>Ontario, Canada.</p>
  <h2>Contact</h2>
  <p><!--email_off--><a href="mailto:hello@fileclear.ca?subject=Terms">hello@fileclear.ca</a><!--/email_off--></p>
</div></section>"""

DOWNLOAD = """<section><div class="wrap narrow prose">
  <span class="eyebrow">Mac and Windows</span>
  <h1 style="font-size:clamp(2.2rem,5vw,3.2rem)">FileClear on your desktop</h1>
  <p class="lead">An icon that is always there, the outstanding count on it, and the
  same calendar you already have.</p>

  <div class="cta-row" id="get">
    <a class="btn primary" id="dl-mac" href="#" rel="nofollow">Download for Mac</a>
    <a class="btn" id="dl-win" href="#" rel="nofollow">Download for Windows</a>
  </div>
  <p class="fine" id="dl-note">Checking for the current version&hellip;</p>

  <h2>What it adds, and what it does not</h2>
  <p>The dock or taskbar icon carries what is outstanding, so the number is in front of
  you without opening anything. The sections have keyboard shortcuts. Links out to CRA
  and to the registries open in your own browser, where the address bar is visible.</p>
  <p>What it does not add is a second copy of the rules. Every rate and every deadline
  in FileClear is a claim about the outside world that was true on the day it was typed,
  and rates move every January. The whole design of the web application exists so that
  a correction reaches everybody the next morning rather than only the people who happen
  to update. A desktop build carrying its own copy of the rules would hand that back:
  somebody still running last spring&rsquo;s version would be quietly wrong about a rate
  that changed, with nothing on screen to say so.</p>
  <p>So the arithmetic stays on the server and the app is a window onto it. Every change
  we make reaches your desktop the moment it is deployed, with nothing to install. The
  app itself updates separately and rarely, in the background, and installs when you
  quit rather than interrupting a return.</p>

  <h2>Without a connection</h2>
  <p>It says so, plainly, and explains that the deadlines are worked out when you look
  rather than stored. Your email reminders are unaffected either way: they are sent from
  the server on its own schedule and do not need this app to be open, or installed.</p>

  <h2>Requirements</h2>
  <p>macOS 12 or later, on Apple silicon or Intel. Windows 10 or later, 64-bit. The
  Windows installer does not need an administrator, so it works on a managed laptop.</p>

  <h2>Prefer the browser?</h2>
  <p>Then use the browser. <a href="https://fileclear.ca/signin">fileclear.ca</a> is the
  same product and always the current version. The desktop app exists because some people
  would rather have an icon than a tab, not because the web version is second best.</p>
</div></section>
<script>
/* The version is read rather than written into this page.
   A page with "version 1.2.0" typed into it is a page somebody has to remember
   to edit on every release, and forgetting is silent: the link still works and
   points at something older than the product. */
(function () {
  var mac = document.getElementById('dl-mac');
  var win = document.getElementById('dl-win');
  var note = document.getElementById('dl-note');
  var ua = navigator.userAgent;
  var arm = /Mac/.test(ua) && (navigator.maxTouchPoints > 1 || /Apple/.test(navigator.vendor));

  /* Put the platform being used first, rather than making somebody find it.
     Detection is a convenience: both buttons stay, because a person downloading
     on one machine for another is an ordinary thing to do. */
  if (/Win/.test(ua)) { win.className = 'btn primary'; mac.className = 'btn'; }

  fetch('/api/release').then(function (r) {
    if (!r.ok) throw new Error('none');
    return r.json();
  }).then(function (d) {
    var m = (d.mac && (arm ? d.mac.arm64 : d.mac.x64)) || (d.mac && d.mac.arm64);
    if (m) mac.href = '/download/' + m;
    if (d.windows) win.href = '/download/' + d.windows;
    note.textContent = 'Version ' + d.version + ', released ' + d.releasedOn
      + '. Signed and notarised.';
  }).catch(function () {
    /* Honest about it rather than leaving two buttons that go nowhere. */
    mac.href = '/signup';
    win.href = '/signup';
    mac.textContent = 'Use FileClear in your browser';
    win.style.display = 'none';
    note.textContent = 'The desktop builds are not published yet. Everything above is '
      + 'available now at fileclear.ca, and the app will be the same product in a window.';
  });
}());
</script>"""

NOTFOUND = """<section><div class="wrap narrow center">
  <span class="eyebrow">404</span>
  <h1 style="font-size:clamp(2.4rem,6vw,3.6rem)">That page is not here.</h1>
  <p class="lead">It may have moved, or the link may be wrong.</p>
  <div class="cta-row" style="justify-content:center">
    <a class="btn primary" href="/">Back to the start</a>
    <a class="btn ghost" href="/support">Support</a>
  </div>
</div></section>"""

PAGES = [
    ("index.html", "", "FileClear: never miss a business filing",
     "FileClear reads how your Canadian business is set up, incorporated or not, and "
     "builds the filing calendar that follows from it, with the form, the date and "
     "the authority for each.",
     INDEX, True),
    ("support.html", "support", "Support &middot; FileClear",
     "How to get help with FileClear, and answers to the questions asked most often.",
     SUPPORT, True),
    ("privacy.html", "privacy", "Privacy &middot; FileClear",
     "What FileClear holds about your corporation, what it does with it, and how to get "
     "it back or delete it.", PRIVACY, True),
    ("terms.html", "terms", "Terms &middot; FileClear",
     "The terms covering use of FileClear, including what it is and what it "
     "deliberately is not.", TERMS, True),
    ("download.html", "download", "Download for Mac and Windows &middot; FileClear",
     "FileClear for macOS and Windows. The same filing calendar in its own window, with "
     "what is outstanding on the icon, and the rules still coming from the server so a "
     "corrected rate reaches you without an update.", DOWNLOAD, True),
    ("404.html", "404", "Not found &middot; FileClear",
     "That page could not be found.", NOTFOUND, False),
]

if __name__ == "__main__":
    ws = re.compile(r"\s+")
    for name, slug, title, desc, body, canon in PAGES:
        (SITE / name).write_text(page(slug, title, desc, body, canon))
        text = re.sub(r"<style.*?</style>", "", (SITE / name).read_text(), flags=re.S)
        text = re.sub(r"<[^>]+>", " ", text)
        words = len(ws.sub(" ", text).split())
        print(f"{name:16} {words:5} words   {(SITE / name).stat().st_size // 1024} KB")
