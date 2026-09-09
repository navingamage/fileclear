import pathlib, re

# Palette lifted off the app icon. Light stays plain white; the icon's navy is
# the dark ground; the red is the accent in both, deepened for light because
# #eb1e2b measures about 4:1 on white and body text needs 4.5.
STYLE = '''<style>
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: var(--font-body);
    font-size: 17px; line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  img { max-width: 100%; display: block; }

  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
  .narrow { max-width: 720px; }

  h1, h2, h3 {
    font-family: var(--font-display);
    font-weight: 800; letter-spacing: -0.03em; line-height: 1.05;
    margin: 0; text-wrap: balance;
  }
  h1 { font-size: clamp(2.4rem, 6vw, 4.1rem); }
  h2 { font-size: clamp(1.7rem, 3.4vw, 2.5rem); }
  h3 { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; }
  p { margin: 0 0 1rem; }
  .lead { font-size: 1.16rem; color: var(--ink-2); }
  .muted { color: var(--muted); }

  /* The structural motif is a ruled form: a label above a hairline, a value
     below it. It is the shape of every page CRA has ever printed. */
  .field-label {
    font-family: var(--font-mono);
    font-size: .7rem; letter-spacing: .16em; text-transform: uppercase;
    color: var(--muted); padding-bottom: .5rem;
    border-bottom: 1px solid var(--line-2); margin-bottom: 1.4rem;
    display: block;
  }

  .skip {
    position: absolute; left: 50%; translate: -50% -200%; z-index: 80;
    background: var(--bg); color: var(--ink); border: 1px solid var(--line-2);
    padding: .7rem 1.2rem; font-weight: 600;
  }
  .skip:focus { translate: -50% 0; text-decoration: none; }

  header.nav { border-bottom: 2px solid var(--rule); background: var(--bg); }
  .nav-in { display: flex; align-items: center; gap: 1.4rem; padding: 1rem 0; }
  .brand {
    display: flex; align-items: center; gap: .6rem; color: var(--ink);
    font-family: var(--font-display); font-weight: 800; font-size: 1.15rem;
    letter-spacing: -.03em;
  }
  .brand:hover { text-decoration: none; }
  .brand img { width: 32px; height: 32px; border-radius: 8px; }
  .nav-links { display: flex; gap: 1.5rem; margin-left: auto; }
  .nav-links a { color: var(--muted); font-size: .93rem; font-weight: 500; }
  .nav-links a:hover { color: var(--ink); text-decoration: none; }
  @media (max-width: 720px) { .nav-links { display: none; } }

  .btn {
    display: inline-block; padding: .78rem 1.4rem;
    border: 1.5px solid var(--rule); color: var(--ink); font-weight: 600;
    font-size: .96rem; background: transparent;
  }
  .btn:hover { text-decoration: none; background: var(--sunk); }
  .btn.primary {
    background: var(--accent); border-color: var(--accent); color: var(--accent-ink);
  }
  .btn.primary:hover { text-decoration: none; filter: brightness(1.08); }

  section { padding: clamp(3.4rem, 7vw, 6rem) 0; }
  section + section { border-top: 1px solid var(--line-2); }

  /* Hero: the claim on the left, the thing itself on the right. */
  .hero-grid {
    display: grid; grid-template-columns: 1.05fr .95fr;
    gap: clamp(2rem, 5vw, 4rem); align-items: start;
  }
  @media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; } }
  .hero-note { color: var(--muted); font-size: .95rem; }
  .cta-row { display: flex; gap: .8rem; flex-wrap: wrap; margin-top: 1.8rem; }

  /* The filing calendar, which is the product. Ruled like a statement. */
  .sheet { border: 2px solid var(--rule); background: var(--paper); }
  .sheet-head {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 1rem; padding: .9rem 1.1rem; border-bottom: 2px solid var(--rule);
    font-family: var(--font-mono); font-size: .72rem;
    letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
  }
  .rows { display: flex; flex-direction: column; }
  .row {
    display: grid; grid-template-columns: 5.6rem 1fr auto;
    gap: .9rem; align-items: baseline;
    padding: .78rem 1.1rem; border-bottom: 1px solid var(--line);
  }
  .row:last-child { border-bottom: 0; }
  .row.next { background: var(--accent-soft); }
  .row .d {
    font-family: var(--font-mono); font-size: .82rem;
    font-variant-numeric: tabular-nums; color: var(--ink);
  }
  .row.next .d { color: var(--accent); font-weight: 600; }
  .row .t { font-size: .95rem; }
  .row .f {
    font-family: var(--font-mono); font-size: .74rem;
    color: var(--muted); white-space: nowrap;
  }
  .sheet-foot {
    padding: .8rem 1.1rem; border-top: 2px solid var(--rule);
    font-size: .82rem; color: var(--muted);
  }

  /* Two companies, two plans. The argument of the product in one figure. */
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.4rem; margin-top: 2.2rem; }
  @media (max-width: 760px) { .split { grid-template-columns: 1fr; } }
  .card { border: 1px solid var(--line-2); padding: 1.4rem 1.4rem 1.5rem; background: var(--paper); }
  .card h3 { margin-bottom: .2rem; }
  .card .who {
    font-family: var(--font-mono); font-size: .74rem;
    color: var(--muted); margin-bottom: 1rem; display: block;
  }
  .card ul { margin: 0; padding-left: 1.1rem; font-size: .95rem; color: var(--ink-2); }
  .card li { margin-bottom: .45rem; }
  .card li b { color: var(--ink); font-weight: 600; }

  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.6rem; margin-top: 2.4rem; }
  @media (max-width: 820px) { .steps { grid-template-columns: 1fr; } }
  .step .n {
    font-family: var(--font-mono); font-size: .74rem; color: var(--accent);
    letter-spacing: .12em; display: block; margin-bottom: .7rem;
    padding-bottom: .5rem; border-bottom: 1px solid var(--line-2);
  }
  .step p { margin: .4rem 0 0; font-size: .96rem; color: var(--ink-2); }

  .pull {
    border-left: 3px solid var(--accent); padding: .3rem 0 .3rem 1.3rem;
    font-family: var(--font-display); font-weight: 600; font-size: 1.22rem;
    line-height: 1.35; letter-spacing: -.02em; margin: 2rem 0 0;
  }

  .prose h2 { margin: 2.4rem 0 .7rem; font-size: 1.35rem; }
  .prose h3 { margin: 1.8rem 0 .3rem; }
  .prose p { color: var(--ink-2); }

  footer { border-top: 2px solid var(--rule); padding: 2.6rem 0 3.4rem; }
  .foot-links { display: flex; flex-wrap: wrap; gap: 1.2rem; margin: 1.2rem 0; }
  .foot-links a { color: var(--muted); font-size: .92rem; }
  .fine { color: var(--muted); font-size: .84rem; max-width: 68ch; margin: 0 0 .7rem; }

  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>'''

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
 '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
 '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
 'family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&'
 'family=Public+Sans:wght@400;500;600&display=swap">')

ICONS = ('<link rel="stylesheet" href="/brand/tokens.css">\n'
 '<link rel="icon" href="/favicon.ico" sizes="any">\n'
 '<link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png">\n'
 '<link rel="icon" type="image/png" sizes="192x192" href="/brand/icon-192.png">\n'
 '<link rel="apple-touch-icon" href="/brand/icon-180.png">\n'
 '<meta name="theme-color" content="#14110d">')

NAV = '''<a class="skip" href="#main">Skip to content</a>
<header class="nav"><div class="wrap nav-in">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="32" height="32">FileClear</a>
  <nav class="nav-links" aria-label="Main">
    <a href="/#how">How it works</a>
    <a href="/#plan">Your plan</a>
    <a href="/support">Support</a>
  </nav>
  <!--email_off--><a class="btn" href="mailto:hello@antipodetech.com?subject=FileClear">Get in touch</a><!--/email_off-->
</div></header>'''

FOOT = '''<footer><div class="wrap">
  <a class="brand" href="/"><img src="/brand/icon-192.png" alt="" width="32" height="32">FileClear</a>
  <nav class="foot-links" aria-label="Footer">
    <a href="/support">Support</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="https://antipodetech.com/">Antipode Technologies</a>
  </nav>
  <p class="fine">FileClear keeps records and works out dates. It is not an accountant,
  it gives no tax advice, and it does not file anything with CRA or with the province
  on your behalf. Every date links to the authority that publishes it, and that
  authority is the one to check before you rely on a date.</p>
  <p class="fine">&copy; 2026 Antipode Technologies Inc., made in Ontario, Canada.</p>
</div></footer>'''

def page(slug, title, desc, body, canonical=True):
    canon = '\n<link rel="canonical" href="https://fileclear.ca/' + slug + '">' if canonical else ''
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      '<title>' + title + '</title>\n<meta name="description" content="' + desc + '">'
      + canon + '\n' + ICONS + '\n' + FONTS + '\n' + STYLE + '\n</head>\n<body>\n'
      + NAV + '\n<main id="main">\n' + body + '\n</main>\n' + FOOT + '\n</body>\n</html>\n')

site = pathlib.Path("site")

# The calendar below is what the engine actually produces for this profile.
index_body = '''<section>
  <div class="wrap hero-grid">
    <div>
      <span class="field-label">Canadian corporate filings</span>
      <h1>Know every date your corporation owes.</h1>
      <p class="lead">FileClear reads how your company is set up, then builds the
      filing calendar that follows from it. Not a generic checklist. Yours.</p>
      <div class="cta-row">
        <!--email_off--><a class="btn primary" href="mailto:hello@antipodetech.com?subject=FileClear%20early%20access">Ask for early access</a><!--/email_off-->
        <a class="btn" href="#how">See how it works</a>
      </div>
      <p class="hero-note" style="margin-top:1.6rem">In development. Opening to a first
      group of Canadian corporations soon.</p>
    </div>

    <div class="sheet" role="img" aria-label="A sample filing calendar for an Ontario
      corporation with a 31 December year end, showing T4 and T5 slips due 28 February,
      employer health tax 15 March, HST and the corporate tax balance 31 March, and the
      T2 and Ontario annual return 30 June.">
      <div class="sheet-head"><span>Filing calendar</span><span>FY2026</span></div>
      <div class="rows">
        <div class="row"><span class="d">15 Jan</span><span class="t">Payroll source deductions</span><span class="f">PD7A</span></div>
        <div class="row next"><span class="d">28 Feb</span><span class="t">T4 and T5 slips</span><span class="f">T4 / T5</span></div>
        <div class="row"><span class="d">15 Mar</span><span class="t">Employer health tax return</span><span class="f">EHT</span></div>
        <div class="row"><span class="d">31 Mar</span><span class="t">HST return and payment</span><span class="f">GST34</span></div>
        <div class="row"><span class="d">31 Mar</span><span class="t">Corporate tax balance owing</span><span class="f">payment</span></div>
        <div class="row"><span class="d">30 Jun</span><span class="t">Corporate income tax return</span><span class="f">T2</span></div>
        <div class="row"><span class="d">30 Jun</span><span class="t">Ontario annual return</span><span class="f">OBR</span></div>
      </div>
      <div class="sheet-foot">Ontario corporation, 31 December year end, salary and
      dividends. Change any one of those and this list changes.</div>
    </div>
  </div>
</section>

<section id="how">
  <div class="wrap">
    <span class="field-label">How it works</span>
    <h2>Six obligations. Four clocks. Two governments.</h2>
    <p class="lead narrow">That is what an owner managed corporation carries, and no
    single place tells you which of them are yours.</p>
    <div class="steps">
      <div class="step">
        <span class="n">01</span>
        <h3>It asks about the company</h3>
        <p>Where you incorporated and when, your year end, your HST registration,
        whether you run payroll.</p>
      </div>
      <div class="step">
        <span class="n">02</span>
        <h3>It builds the calendar</h3>
        <p>Every date that follows from those answers, with the form, the authority
        and what happens if it slips.</p>
      </div>
      <div class="step">
        <span class="n">03</span>
        <h3>It produces the numbers</h3>
        <p>HST returns, year end figures, the amounts each form asks for. Ready to
        enter or to hand to an accountant.</p>
      </div>
    </div>
  </div>
</section>

<section id="plan">
  <div class="wrap">
    <span class="field-label">Your plan is not the next company's</span>
    <h2>Two corporations, two entirely different years.</h2>
    <p class="lead narrow">Same revenue, same province of operation. One answer during
    setup, and almost nothing about their calendars matches.</p>

    <div class="split">
      <div class="card">
        <h3>Incorporated in Ontario</h3>
        <span class="who">31 Dec year end &middot; salary &middot; annual HST</span>
        <ul>
          <li>Annual return to the <b>province</b>, 30 June</li>
          <li>Twelve payroll remittances, the 15th of each month</li>
          <li>T4 slips by 28 February</li>
          <li>Employer health tax return in March</li>
        </ul>
      </div>
      <div class="card">
        <h3>Incorporated federally</h3>
        <span class="who">30 Jun year end &middot; dividends &middot; quarterly HST</span>
        <ul>
          <li>Annual return to <b>Corporations Canada</b>, 60 days after the incorporation anniversary</li>
          <li>No payroll remittances at all</li>
          <li>T5 slips by 28 February</li>
          <li>Four HST returns, counted back from a June year end</li>
        </ul>
      </div>
    </div>

    <p class="pull">The federal annual return runs off the day you incorporated, not
    your year end. It is the one federal corporations miss, because every other date
    they have hangs off the year end.</p>
  </div>
</section>

<section>
  <div class="wrap narrow">
    <span class="field-label">Get in early</span>
    <h2>Tell us your year end and where you incorporated.</h2>
    <p class="lead">You will hear when it opens, and the first corporations in help
    decide what gets built next.</p>
    <div class="cta-row">
      <!--email_off--><a class="btn primary" href="mailto:hello@antipodetech.com?subject=FileClear%20early%20access">hello@antipodetech.com</a><!--/email_off-->
    </div>
  </div>
</section>'''

(site/"index.html").write_text(page("", "FileClear: every filing your corporation owes",
  "FileClear reads how your Canadian corporation is set up and builds the filing "
  "calendar that follows from it, with the form, the date and the authority for each.",
  index_body))

support_body = '''<section><div class="wrap narrow prose">
  <span class="field-label">Support</span>
  <h1>Getting help</h1>
  <p class="lead">Email is the whole support system, and it reaches a person.</p>
  <p><!--email_off--><a href="mailto:hello@antipodetech.com?subject=FileClear%20support">hello@antipodetech.com</a><!--/email_off--><br>
  Antipode Technologies Inc., Ontario, Canada.</p>

  <h2>Common questions</h2>
  <h3>Does FileClear file my return for me?</h3>
  <p>No. It works out what is due and produces the numbers. You file, or your
  accountant does. It is not certified by CRA to transmit returns.</p>
  <h3>Is this tax advice?</h3>
  <p>No. Where a decision is a judgement, FileClear shows the arithmetic for each
  option and the rule behind it, and stops there.</p>
  <h3>Which corporations does it cover?</h3>
  <p>Canadian corporations, federal or provincial. The rules are most complete for
  Ontario, which is where it is being built and tested first.</p>
  <h3>Where do the dates come from?</h3>
  <p>Every obligation links to the CRA, Corporations Canada or Ontario page that
  publishes it. FileClear tells you a date is coming. It is not the authority on the
  date, and the link is how you check us.</p>
</div></section>'''
(site/"support.html").write_text(page("support", "Support &middot; FileClear",
  "How to get help with FileClear, and answers to the questions asked most often.",
  support_body))

privacy_body = '''<section><div class="wrap narrow prose">
  <span class="field-label">Privacy</span>
  <h1>Privacy policy</h1>
  <p class="muted">Last updated 8 September 2026</p>
  <h2>What we hold</h2>
  <p>What you enter about your corporation: its name, where and when it was
  incorporated, its year end, its tax registrations, and the transactions and
  documents you add. This is business information and we treat it as confidential.</p>
  <h2>What we do with it</h2>
  <p>We use it to work out your filing calendar and your figures, and for nothing
  else. We do not sell it, we do not share it, and we do not train anything on it.</p>
  <h2>Where it lives</h2>
  <p>On Cloudflare infrastructure. Documents you upload sit in private storage and are
  served only through the application after it has checked your session, so there is
  no public link to guess.</p>
  <h2>Payments</h2>
  <p>Handled by Stripe. We never see or store a card number.</p>
  <h2>Getting it back, or deleting it</h2>
  <p>Ask and we will export everything we hold about your corporation, or delete it.
  CRA requires business records to be kept six years, so deleting your account is not
  a substitute for keeping your own copies.</p>
  <h2>Contact</h2>
  <p><!--email_off--><a href="mailto:hello@antipodetech.com?subject=FileClear%20privacy">hello@antipodetech.com</a><!--/email_off--></p>
</div></section>'''
(site/"privacy.html").write_text(page("privacy", "Privacy &middot; FileClear",
  "What FileClear holds about your corporation, what it does with it, and how to get "
  "it back or delete it.", privacy_body))

terms_body = '''<section><div class="wrap narrow prose">
  <span class="field-label">Terms</span>
  <h1>Terms of use</h1>
  <p class="muted">Last updated 8 September 2026</p>
  <h2>The important one</h2>
  <p>FileClear is a record keeping and calculation tool. It is not an accountant, it
  gives no tax, legal or financial advice, and it does not file anything with CRA or
  with any province on your behalf. Filing correctly and on time remains yours. Every
  date links to the authority that publishes it, and that authority governs.</p>
  <h2>What you get</h2>
  <p>A licence to use FileClear for your own corporations, for as long as your
  subscription runs. The service is provided as it is, without warranty.</p>
  <h2>Your records</h2>
  <p>Your data stays yours. We hold it to run the service and you can export or delete
  it. CRA requires records to be kept six years, and that obligation is yours.</p>
  <h2>Payment</h2>
  <p>Subscriptions are billed through Stripe. Cancel any time; cancelling stops the
  next renewal and leaves the service running to the end of the period you paid for.</p>
  <h2>Governing law</h2>
  <p>Ontario, Canada.</p>
  <h2>Contact</h2>
  <p><!--email_off--><a href="mailto:hello@antipodetech.com?subject=FileClear%20terms">hello@antipodetech.com</a><!--/email_off--></p>
</div></section>'''
(site/"terms.html").write_text(page("terms", "Terms &middot; FileClear",
  "The terms covering use of FileClear, including what it is and what it deliberately "
  "is not.", terms_body))

notfound_body = '''<section><div class="wrap narrow">
  <span class="field-label">404</span>
  <h1>That page is not here.</h1>
  <p class="lead">It may have moved, or the link may be wrong.</p>
  <div class="cta-row">
    <a class="btn primary" href="/">Back to the start</a>
    <a class="btn" href="/support">Support</a>
  </div>
</div></section>'''
(site/"404.html").write_text(page("404", "Not found &middot; FileClear",
  "That page could not be found.", notfound_body, canonical=False))

ws = re.compile(r'\s+')
for f in sorted(site.glob("*.html")):
    b = re.sub(r'<style.*?</style>', '', f.read_text(), flags=re.S)
    b = re.sub(r'<[^>]+>', ' ', b)
    print(f.name.ljust(14), str(len(ws.sub(' ', b).split())).rjust(4), "words ",
          f.stat().st_size // 1024, "KB")
