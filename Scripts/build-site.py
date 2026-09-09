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
    'family=Figtree:wght@400;500;600;700;800;900&'
    'family=IBM+Plex+Mono:wght@400;500&display=swap">'
)

HEADLINKS = (
    '<link rel="stylesheet" href="/brand/tokens.css">\n'
    '<link rel="icon" href="/favicon.ico" sizes="any">\n'
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
  a { color: inherit; text-decoration: none; }
  a:hover { text-decoration: underline; }
  :focus-visible { outline: 2.5px solid var(--brand); outline-offset: 3px; border-radius: 6px; }
  img { max-width: 100%; display: block; }

  .wrap { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
  .narrow { max-width: 680px; }
  .center { text-align: center; margin-left: auto; margin-right: auto; }

  h1, h2, h3 {
    font-family: var(--font-display); letter-spacing: -.035em;
    line-height: 1.03; margin: 0; text-wrap: balance; font-weight: 800;
  }
  h1 { font-size: clamp(2.9rem, 7vw, 5rem); }
  h2 { font-size: clamp(2rem, 4.4vw, 3.1rem); letter-spacing: -.03em; }
  h3 { font-size: 1.18rem; font-weight: 700; letter-spacing: -.02em; line-height: 1.25; }
  p { margin: 0 0 1.1rem; }
  .lead { font-size: clamp(1.1rem, 1.7vw, 1.3rem); color: var(--ink-2); line-height: 1.5; }
  .muted { color: var(--muted); }
  .eyebrow {
    display: inline-block; font-family: var(--font-mono); font-size: .72rem;
    letter-spacing: .14em; text-transform: uppercase; color: var(--brand);
    background: var(--brand-tint); padding: .42rem .8rem;
    border-radius: var(--radius-pill); margin-bottom: 1.5rem;
  }

  .skip {
    position: absolute; left: 50%; translate: -50% -200%; z-index: 90;
    background: var(--surface); border: 1px solid var(--line-2);
    padding: .7rem 1.2rem; border-radius: 0 0 14px 14px; font-weight: 600;
  }
  .skip:focus { translate: -50% 0; text-decoration: none; }

  /* Navigation: sticky, quiet, with a pill on the right. */
  header.nav {
    position: sticky; top: 0; z-index: 60; background: var(--bg);
    border-bottom: 1px solid var(--line);
  }
  .nav-in { display: flex; align-items: center; gap: 1.8rem; padding: .9rem 0; }
  .brand {
    display: flex; align-items: center; gap: .6rem;
    font-family: var(--font-display); font-weight: 800; font-size: 1.16rem;
    letter-spacing: -.04em;
  }
  .brand:hover { text-decoration: none; }
  .brand img { width: 34px; height: 34px; border-radius: 9px; }
  .nav-links { display: flex; gap: 1.7rem; margin-left: auto; }
  .nav-links a { color: var(--muted); font-size: .96rem; font-weight: 500; }
  .nav-links a:hover { color: var(--ink); text-decoration: none; }
  @media (max-width: 860px) { .nav-links { display: none; } .nav-in { gap: 1rem; } }

  .btn {
    display: inline-flex; align-items: center; gap: .5rem;
    padding: .85rem 1.5rem; border-radius: var(--radius-pill);
    font-weight: 600; font-size: 1rem; border: 1.5px solid transparent;
    background: var(--sunk); color: var(--ink); white-space: nowrap;
  }
  .btn:hover { text-decoration: none; filter: brightness(.97); }
  .btn.primary { background: var(--primary); color: var(--primary-ink); }
  .btn.ghost { background: transparent; border-color: var(--line-2); }
  .btn.small { padding: .55rem 1.05rem; font-size: .92rem; }

  section { padding: clamp(4rem, 9vw, 7.5rem) 0; }
  .band { background: var(--band); }

  /* Hero: claim, then the product itself, large. */
  .hero { padding-top: clamp(3.4rem, 7vw, 6rem); padding-bottom: 0; }
  .hero .lead { max-width: 44ch; }
  .cta-row { display: flex; gap: .8rem; flex-wrap: wrap; margin-top: 2rem; }
  .hero-note { color: var(--muted); font-size: .95rem; margin-top: 1.5rem; }

  .showcase { padding-top: clamp(3rem, 6vw, 5rem); padding-bottom: 0; }
  .frame {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
    overflow: hidden; max-width: 780px; margin: 0 auto;
  }
  .frame-bar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; padding: 1rem 1.4rem; border-bottom: 1px solid var(--line);
    background: var(--sunk);
  }
  .frame-bar b { font-size: .95rem; font-weight: 700; letter-spacing: -.01em; }
  .frame-bar span { font-family: var(--font-mono); font-size: .74rem; color: var(--muted); }
  .frow {
    display: grid; grid-template-columns: 5.4rem 1fr auto;
    gap: 1rem; align-items: center; padding: .95rem 1.4rem;
    border-bottom: 1px solid var(--line);
  }
  .frow:last-child { border-bottom: 0; }
  .frow .d {
    font-family: var(--font-mono); font-size: .82rem;
    font-variant-numeric: tabular-nums; color: var(--muted);
  }
  .frow .t { font-size: .98rem; font-weight: 500; }
  .frow .tag {
    font-family: var(--font-mono); font-size: .68rem; letter-spacing: .06em;
    padding: .28rem .6rem; border-radius: var(--radius-pill);
    background: var(--sunk); color: var(--muted); white-space: nowrap;
  }
  .frow.soon { background: var(--danger-tint); }
  .frow.soon .d { color: var(--danger); font-weight: 600; }
  .frow.soon .tag { background: var(--danger); color: #fff; }
  .frow.cleared .tag { background: var(--brand-tint); color: var(--brand); }

  /* Cards */
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.2rem; margin-top: 3rem; }
  @media (max-width: 900px) { .cards { grid-template-columns: 1fr; } }
  .card {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 1.7rem 1.6rem 1.8rem;
    box-shadow: var(--shadow);
  }
  .card .num {
    font-family: var(--font-mono); font-size: .74rem; color: var(--brand);
    letter-spacing: .1em; display: block; margin-bottom: .9rem;
  }
  .card p { margin: .55rem 0 0; color: var(--ink-2); font-size: .99rem; }

  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; margin-top: 3rem; }
  @media (max-width: 820px) { .split { grid-template-columns: 1fr; } }
  .split .card .who {
    font-family: var(--font-mono); font-size: .74rem; color: var(--muted);
    display: block; margin: .3rem 0 1.1rem;
  }
  .split ul { margin: 0; padding-left: 1.15rem; color: var(--ink-2); font-size: .99rem; }
  .split li { margin-bottom: .5rem; }
  .split li b { color: var(--ink); font-weight: 700; }

  /* A flat brand block for the closing call, the way commerce sites do it. */
  .callout {
    background: var(--brand); color: var(--brand-ink);
    border-radius: var(--radius-lg); padding: clamp(2.6rem, 5vw, 4.2rem);
    text-align: center;
  }
  .callout h2 { color: var(--brand-ink); }
  .callout p { color: var(--brand-ink); opacity: .88; }
  .callout .btn.primary { background: var(--brand-ink); color: var(--brand); }

  .prose h2 { font-size: 1.45rem; margin: 2.6rem 0 .7rem; letter-spacing: -.02em; }
  .prose h3 { margin: 1.9rem 0 .35rem; font-size: 1.06rem; }
  .prose p { color: var(--ink-2); }
  .prose a { color: var(--brand); font-weight: 600; }

  footer { border-top: 1px solid var(--line); padding: 3rem 0 4rem; }
  .foot-links { display: flex; flex-wrap: wrap; gap: 1.4rem; margin: 1.3rem 0; }
  .foot-links a { color: var(--muted); font-size: .95rem; }
  .fine { color: var(--muted); font-size: .87rem; max-width: 70ch; margin: 0 0 .7rem; }

  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>"""

NAV = """<a class="skip" href="#main">Skip to content</a>
<header class="nav"><div class="wrap nav-in">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="34" height="34">FileClear</a>
  <nav class="nav-links" aria-label="Main">
    <a href="/#how">How it works</a>
    <a href="/#different">Why yours differs</a>
    <a href="/support">Support</a>
  </nav>
  <!--email_off--><a class="btn primary small" href="mailto:hello@antipodetech.com?subject=FileClear%20early%20access">Get early access</a><!--/email_off-->
</div></header>"""

FOOT = """<footer><div class="wrap">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="34" height="34">FileClear</a>
  <nav class="foot-links" aria-label="Footer">
    <a href="/support">Support</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="https://antipodetech.com/">Antipode Technologies</a>
  </nav>
  <p class="fine">FileClear keeps records and works out dates. It is not an accountant,
  it gives no tax advice, and it does not file anything with CRA or with the province on
  your behalf. Every date links to the authority that publishes it, and that authority
  is the one to check before you rely on a date.</p>
  <p class="fine">&copy; 2026 Antipode Technologies Inc., made in Ontario, Canada.</p>
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


INDEX = """<section class="hero"><div class="wrap">
  <span class="eyebrow">Canadian corporate filings</span>
  <h1>Never miss a filing again.</h1>
  <p class="lead">FileClear reads how your corporation is set up and builds the exact
  filing calendar that follows from it. Every date, every form, every authority.</p>
  <div class="cta-row">
    <!--email_off--><a class="btn primary" href="mailto:hello@antipodetech.com?subject=FileClear%20early%20access">Get early access</a><!--/email_off-->
    <a class="btn ghost" href="#how">See how it works</a>
  </div>
  <p class="hero-note">In development. Opening to a first group of Canadian corporations soon.</p>
</div></section>

<section class="showcase"><div class="wrap">
  <div class="frame">
    <div class="frame-bar">
      <b>Antipode Technologies Inc.</b>
      <span>31 Dec year end &middot; Ontario</span>
    </div>
    <div class="frow cleared"><span class="d">15 Jan</span><span class="t">Payroll source deductions</span><span class="tag">Done</span></div>
    <div class="frow soon"><span class="d">28 Feb</span><span class="t">T4 and T5 slips</span><span class="tag">14 days</span></div>
    <div class="frow"><span class="d">15 Mar</span><span class="t">Employer health tax return</span><span class="tag">EHT</span></div>
    <div class="frow"><span class="d">31 Mar</span><span class="t">HST return and payment</span><span class="tag">GST34</span></div>
    <div class="frow"><span class="d">31 Mar</span><span class="t">Corporate tax balance owing</span><span class="tag">Payment</span></div>
    <div class="frow"><span class="d">30 Jun</span><span class="t">Corporate income tax return</span><span class="tag">T2</span></div>
    <div class="frow"><span class="d">30 Jun</span><span class="t">Ontario annual return</span><span class="tag">Registry</span></div>
  </div>
</div></section>

<section id="how"><div class="wrap">
  <div class="narrow">
    <span class="eyebrow">How it works</span>
    <h2>Six obligations. Four clocks. Two governments.</h2>
    <p class="lead">That is what an owner managed corporation carries, and no single
    place tells you which of them are yours.</p>
  </div>
  <div class="cards">
    <div class="card">
      <span class="num">01</span>
      <h3>Answer eight questions</h3>
      <p>Where you incorporated and when, your year end, your HST registration, whether
      you run payroll. All of it comes off documents you already have.</p>
    </div>
    <div class="card">
      <span class="num">02</span>
      <h3>Get your calendar</h3>
      <p>Every date those answers produce, with the form, the authority, and what
      happens if it slips. Nothing generic, nothing that is not yours.</p>
    </div>
    <div class="card">
      <span class="num">03</span>
      <h3>File with the numbers</h3>
      <p>HST returns, year end figures, the amounts each form asks for. Ready to enter
      or to hand to an accountant.</p>
    </div>
  </div>
</div></section>

<section id="different" class="band"><div class="wrap">
  <div class="narrow">
    <span class="eyebrow">Why yours differs</span>
    <h2>Two corporations, two completely different years.</h2>
    <p class="lead">Same revenue, same city. One answer during setup, and almost nothing
    about their calendars matches.</p>
  </div>
  <div class="split">
    <div class="card">
      <h3>Incorporated in Ontario</h3>
      <span class="who">31 Dec year end &middot; salary &middot; annual HST</span>
      <ul>
        <li>Annual return to the <b>province</b>, six months after year end</li>
        <li>Twelve payroll remittances, the 15th of each month</li>
        <li>T4 slips by the end of February</li>
        <li>Employer health tax return in March</li>
      </ul>
    </div>
    <div class="card">
      <h3>Incorporated federally</h3>
      <span class="who">30 Jun year end &middot; dividends &middot; quarterly HST</span>
      <ul>
        <li>Annual return to <b>Corporations Canada</b>, 60 days after the incorporation anniversary</li>
        <li>No payroll remittances at all</li>
        <li>T5 slips by the end of February</li>
        <li>Four HST returns, counted back from a June year end</li>
      </ul>
    </div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="callout">
    <h2>Tell us your year end.</h2>
    <p class="lead">Say where you incorporated and when your year ends, and you will
    hear the moment it opens.</p>
    <div class="cta-row" style="justify-content:center">
      <!--email_off--><a class="btn primary" href="mailto:hello@antipodetech.com?subject=FileClear%20early%20access">hello@antipodetech.com</a><!--/email_off-->
    </div>
  </div>
</div></section>"""

SUPPORT = """<section><div class="wrap narrow prose">
  <span class="eyebrow">Support</span>
  <h1 style="font-size:clamp(2.2rem,5vw,3.2rem)">Getting help</h1>
  <p class="lead">Email is the whole support system, and it reaches a person.</p>
  <p><!--email_off--><a href="mailto:hello@antipodetech.com?subject=FileClear%20support">hello@antipodetech.com</a><!--/email_off--><br>
  Antipode Technologies Inc., Ontario, Canada.</p>

  <h2>Common questions</h2>
  <h3>Does FileClear file my return for me?</h3>
  <p>No. It works out what is due and produces the numbers. You file, or your accountant
  does. It is not certified by CRA to transmit returns.</p>
  <h3>Is this tax advice?</h3>
  <p>No. Where a decision is a judgement, FileClear shows the arithmetic for each option
  and the rule behind it, and stops there.</p>
  <h3>Which corporations does it cover?</h3>
  <p>Canadian corporations, federal or provincial. The rules are most complete for
  Ontario, which is where it is being built and tested first.</p>
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
  <p><!--email_off--><a href="mailto:hello@antipodetech.com?subject=FileClear%20privacy">hello@antipodetech.com</a><!--/email_off--></p>
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
  <p><!--email_off--><a href="mailto:hello@antipodetech.com?subject=FileClear%20terms">hello@antipodetech.com</a><!--/email_off--></p>
</div></section>"""

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
    ("index.html", "", "FileClear: never miss a corporate filing",
     "FileClear reads how your Canadian corporation is set up and builds the filing "
     "calendar that follows from it, with the form, the date and the authority for each.",
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
