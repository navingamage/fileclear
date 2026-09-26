# FileClear

Every filing a Canadian business owes, worked out from how that business is
actually set up, with the dates and the forms and who to send them to.
Incorporated or not: a corporation and a sole proprietorship are different
products wearing one name, and pretending otherwise is how a sole proprietor
gets told to file a T2.

> To *file clear* is to get to the end of a year with nothing outstanding and
> nobody waiting on you. It shares a suffix with TradeClear on purpose: both
> products exist so that a small company can prove it is current.

An owner-managed corporation carries six separate obligations on four different
clocks to two different governments, and no single place tells you what yours
are. An accountant is partly a bill for arithmetic and largely a bill for
remembering. FileClear does the remembering, computes the numbers, and tells you
what goes on which form.

## The plan is built from the company, not assumed

Onboarding asks where you incorporated, when, your fiscal year end, whether you
are a CCPC claiming the small business deduction, how you are registered for
HST, whether you run payroll, and whether you pay dividends. Those answers
change the plan substantially rather than cosmetically:

- A **federal** corporation files its annual return with Corporations Canada
  within 60 days of the anniversary of incorporation. An **Ontario** corporation
  files with the province through the Ontario Business Registry, six months
  after its fiscal year end. Nothing about those two is alike.
- A **CCPC claiming the small business deduction** has three months to pay its
  tax balance. Everyone else has two. A CCPC whose business limit has been used
  up by associated corporations is in the second group, not the first.
- An **annual HST filer** files three months after the year end. The 15 June
  date people repeat belongs to individuals, not corporations.
- A corporation that pays **only dividends** has no monthly remittance and no
  T4. One that pays a salary has twelve more deadlines a year.
- **Quarters are counted back from the fiscal year end**, so a 30 June year end
  has quarters closing in September, December, March and June.

## The engine

`worker/src/rules/obligations.ts` holds the rule set as data, in the same shape
Milepost uses for the Ontario parenting rules and for the same reason: the rules
change more often than the engine does, so a correction is one record and a test
rather than a new branch.

Each obligation names the authority that publishes it and links to the page that
is the source. FileClear tells you a date is coming; it is not the authority on
the date, and the link is how you check us.

```
cd worker && npm test
```

594 tests. The ones worth knowing about pin the differences above, plus the date
arithmetic, which is where the first real bug was: a month end has to stay a
month end. A 30 June year end plus six months is 31 December, not 30 December.
Clamping only downward moved every deadline a day early for any corporation
whose period ended in a 30 day month, silently, and only for them.

## Scope

FileClear does not transmit anything to CRA. It tracks, computes, says what is
due and when, and produces the numbers ready to be entered. No NETFILE
certification, which is a year of compliance work before a first customer, and
no software that appears to give tax advice.

Where a decision is genuinely a judgement, such as salary against dividends, the
plan is to show the arithmetic for each option and the rule behind it, and to
stop there. Presenting numbers is a tool. Printing a recommendation is advice.

## Where it runs

`fileclear.ca`, as a Worker with D1, with `fileclear.antipodetech.com`
redirecting to it. The same shape as TradeClear: the application owns the domain
because a director typing the name wants the dashboard, not a page about it.

## Reminders

A calendar you have to remember to open is a calendar you have already failed to
use, so a daily sweep emails before a window closes. Nothing about what is due
is stored: filings are recomputed from each profile every run, which means a
rule correction is live for everybody the next morning rather than only for
companies created after it.

`reminders_sent` is keyed by the engine's stable filing id, so a rule fix that
moves a date produces a filing nobody has been warned about, and the warning
goes out again. That is right, because the date changed.

Cloudflare crons are UTC and Ontario changes offset twice a year, so both
candidate hours are scheduled and `src/cron.ts` returns immediately unless the
local hour in Toronto is 07. That is 12:00 UTC through the winter and 11:00
through the summer, with no edit to the config in March or November.

Mail goes through ZeptoMail, the transactional side of the Zoho arrangement
Antipode already has. Without `ZEPTOMAIL_TOKEN` and `FC_MAIL_FROM` the sweep
still runs, works out what is due, and reports that it could not send: a
scheduled job that throws on a missing secret takes every other company's
reminder down with it.

## Year end

The books are single entry on the surface, because a two person corporation will
not think in debits and credits. A row is a date, an account, an amount and the
HST that was on the document. Underneath they have to balance, because Schedule
100 is a balance sheet and one sided records cannot produce one.

One field bridges that: every row says where the money came from or went to,
defaulting to the bank. The HST leg is already recorded and the sign of every
leg follows from the kind of account, so `src/rules/postings.ts` derives a
balanced entry from the equation rather than guessing at the direction. The
worksheet shows the difference when it is not zero, because a balance sheet that
does not balance is the most useful signal a set of books can give, and quietly
plugging it is how a wrong return gets filed with confidence.

Capital cost allowance is the one thing that carries across years. Everything
else recomputes from the ledger on every read, but this year's opening pool is
last year's closing pool, so Schedule 8 is computed forward from the first
purchase and the year asked for is read off the end of that chain. Nothing is
stored except a claim smaller than the maximum, which is a decision rather than
a calculation.

Rules that are in flux are computed as enacted and flagged, not guessed. The
accelerated investment incentive is in its phase out, and the 2024 Fall Economic
Statement proposed restoring it; until that is law the smaller deduction is the
one shown, with a note saying why.

## Taking money out

Salary against dividends is the question every owner of a small corporation
asks, and the usual answers are folklore: dividends are cheaper, salary builds
RRSP room. Both are sometimes true. FileClear computes both routes from the same
starting point, what the corporation has available to distribute, and stops
there. It does not print a winner, because the gap is usually small enough that
things tax arithmetic cannot see decide it.

Two numbers are reported rather than one, because they routinely point opposite
ways. At $120,000 the salary route pays $2,797 less tax and still hands over
$6,496 less cash, because $9,293 of CPP came out of it. Reporting only the cash
gap makes dividends look like the obvious answer; reporting only the tax gap
makes salary look like it. CPP is kept out of the tax figure on purpose: it
leaves on the same day but buys a pension, and folding it into a tax rate is how
a comparison misleads.

Every rate is 2026 and was read off CRA and Ontario rather than recalled, with
the source named beside it. The tests anchor on the maximums CRA publishes, so
a mistyped rate or ceiling fails immediately rather than quietly.

## Status

Done: the obligation engine, accounts and sessions, onboarding, the filing
calendar grouped by month, the ledger with GIFI coded accounts, the HST return
computed both ways, the daily reminder sweep, the year end worksheet
(Schedules 100, 125, 8 and 1 and the tax that falls out of them), and the
compensation comparison.

## Slips and remittances

The calendar already knew when a T4 was due. What it could not say was what
goes on it, which is where people actually get stuck, so both slips are filled
in from what the ledger says was paid and every figure carries its box number.

The trap this is built around: **T4 and T5 are calendar year slips.** A
corporation with a June year end still reports January to December on them, and
only the T2 follows the fiscal year. Lining the two up produces slips CRA cannot
match to a remittance account, so the page says so and the year picker offers
calendar years only.

Source deductions are annualised the way CRA's own formula does it, so twelve
withholdings add up to the year's tax rather than drifting and leaving a balance
in April. The CPP exemption is prorated across periods, which is why a monthly
contribution is not a twelfth of the annual one. Being late on a remittance is
expensive out of proportion to its size, because the penalty is a percentage of
the whole remittance rather than of any shortfall, so that is shown in dollars
rather than described.

## Deploying

Workers Builds, and **the root directory has to be `worker`**. Both the
`package.json` and the `wrangler.toml` live there, and the repository root has
neither, so a build that runs at the root fails on `npm ci` with "can only
install with an existing package-lock.json" before it reaches anything else.
The empty "Detected the following tools from environment" line in the log is the
same cause: Cloudflare looks for a `package.json` to work out the runtime.

Root directory `worker`, build `npm ci && npm run typecheck && npm test`, deploy
`npx wrangler deploy`, with the whole repository checked
out so that `../site` resolves. The generated HTML is committed rather than
built at deploy time, because the build container has no Python.

That leaves one way to be wrong: edit the generator, forget to run it, and ship
HTML that no longer matches its source. `.github/workflows/site.yml` regenerates
on every push and fails if anything moved, which is where Python is available.
Same shape as TradeClear's layout job: the half that cannot run where the deploy
runs, runs where it can.

## Getting back in, and not being battered

A reset token is random, single use, expires in an hour, and is **never stored**:
only its SHA-256 goes in the database, so a copy of that table is not a set of
working reset links. Spending one ends every session on the account, because
somebody resetting a password either forgot it or believes it was taken, and in
the second case leaving the other session alive defeats the exercise. Asking for
a link says the same thing whether or not the address has an account, since
answering differently is a way to find out who banks here.

Sign in, signup and reset are all throttled, counted in D1 because a Worker has
no memory worth the name. Two keys are counted for a sign in and either can
trip. Counting only the address lets one attacker work through a list of
accounts from a pool of addresses; counting only the account lets anybody lock a
customer out of their own product by failing their sign in on purpose, which
turns the protection into the attack. Counting both means the attacker meets the
address limit first, and the account limit stays loose enough that a real person
fumbling never reaches it. A successful sign in forgets the count.

## Being used for the first time

Set-up used to be thirty three fields in six groups on one page, three and a
half screens long, headed "Step 1 of 1", behind a navigation bar with eight
links that all went to empty screens. Everything the product knew how to ask was
asked before it had shown anybody anything, which is the wrong way round: a
person who has just signed up has no evidence yet that any of the typing is
worth it.

The questions are now ordered by what they buy. Four answers produce a calendar,
and each step saves, so the calendar exists from the first one and a half
finished set-up survives a closed tab. The fields that only matter at year end
are defaulted and left for the company page, where somebody who already trusts
the product can find them.

The navigation is hidden while that runs, because until a corporation exists
every link in it leads somewhere with nothing on it. Eight dead links is a worse
first impression than none, and it invites wandering off part way through the
one task that makes the rest work.

Signing in and signing up are two columns rather than a form adrift in a wide
empty page: the form on the left, and on the right three lines saying what
happens after the button. What somebody weighs before typing a password into a
tax product is how much work they are agreeing to, so the answer is on the page,
and it is deliberately smaller than what the product actually delivers.

## The ledger

The one screen somebody touches weekly rather than a few times a year, which is
why it was worth rebuilding. Measured before: every row was 125 pixels tall,
because five things were being laid out in a four column grid and the remove
button wrapped onto a line of its own. Twelve transactions filled two and a half
screens. There were no column headings, no totals to check against a statement,
no grouping, and fifty five words of explanation above the fold that a weekly
visitor reads once and then scrolls past forever.

Now a row is a row, at 62 pixels. Months are grouped the way the filing calendar
groups them, each with its own net, so checking a ledger can be done one
statement at a time. The four figures somebody reconciles against a bank
statement, money in, money out, HST collected and HST paid, are at the top. The
explanation folds away for whoever still wants it. Same twelve rows now take 1.8
screens instead of 2.5.

The empty state offers the fastest way in rather than saying "nothing recorded
yet" and leaving it there, because the quickest first ledger is a bank export
rather than a typed row.

## The year a corporation was incorporated in

Two bugs lived here, reported from a real set-up: federally incorporated on
11 August 2026, quarterly HST, a 31 July year end. Both came from treating the
year of incorporation as a year in which obligations had already accrued.

The federal annual return was being asked for 60 days after the incorporation
date rather than 60 days after the first anniversary. Corporations Canada is
explicit that "you do not file for the year the corporation was incorporated",
and that a return filed before the anniversary date "will not be accepted", so
the calendar was asking for a filing the registry would have refused.

The subtler one: a 31 July year end and an 11 August incorporation fall in the
same calendar year, so a guard comparing year numbers passed, and the engine
produced a T2 and a tax balance for a year that ended eleven days before the
corporation existed.

The fix is that every occurrence now carries the last day of the period it
reports on, and an occurrence whose period closed before incorporation does not
exist. That replaces the year-number comparison, which could not tell 31 July
from 11 August, and it covers the cases nobody had reached yet: a payroll
remittance for a month before incorporation, a T4 for the calendar year before
it. The HST quarters, which were already correct, are unchanged.

## Registering a federal corporation with its province

Checking one real account's dates turned up a filing that was missing rather
than wrong. A federal corporation is not automatically registered in the
province it operates from: Ontario requires an Initial Return under the
Corporations Information Act within 60 days of the corporation beginning to
carry on business there.

It is the easiest obligation in the product to miss, and for a structural
reason. There is no fee, and no annual return follows it, so it happens once,
early, and nothing later in the year reminds anybody it was supposed to happen.
A corporation can have a perfectly filed T2 and not be registered where it
trades.

The 60 days run from carrying on business, not from incorporation. FileClear
counts from incorporation, which is right for most corporations and says so
plainly, along with what to do if trading started later.

The test written beside this is worth keeping in mind. It used to assert that a
newly incorporated federal corporation owes nothing in its first two months,
which felt obviously true and was wrong: the absence of a filing FileClear did
not know about had been written down as correct behaviour.

## The mail, confirmed

Confirmed end to end on 15 September 2026 rather than assumed: a message sent
from `reminders@fileclear.ca` to `hello@fileclear.ca` arrived, and its headers
carried `dkim=pass`, `spf=pass` and `dmarc=pass`. Both directions work and all
three authentication checks agree with the From address.

That is worth recording because the failure it rules out is the quiet one. Mail
that sends without error and lands in a spam folder looks identical to mail that
works, and a product whose value is a reminder arriving on the right morning
cannot find that out from a customer months later.

DMARC stays at `p=none` for now, which reports forgery without stopping it. That
is the right setting while the domain has almost no history: tightening before
the aggregate reports show what actually sends is how a legitimate sender gets
silently filed as spam. The move to `p=quarantine` and then `p=reject` is in
`SCHEDULED_CHANGES` for December, so the weekly watch raises it rather than
relying on anybody remembering.

## Notices, and telling them apart

The slips screen carried eleven advisory boxes, all styled the same. Eleven
boxes that look equally important mean none of them gets read, and reading them
apart they were three different things wearing one costume: something to act on,
something to understand once, and the standing reminder that FileClear does not
file. Two of them said the same thing twice.

Only the first needs to interrupt. Explanations fold into one collapsible block
per section, because a note is read once and then known. The standing reminder
sits at the foot of every screen that produces a figure, said once, instead of
competing with a warning about a penalty. Slips went from eleven boxes to three.

Every screen that computes something now opens with the figure it exists to
produce, in a strip of four: the net tax to remit, the total tax payable, which
way the salary and dividend comparison came out, or the date both slips are due.
The compensation strip carries how much of the gap is CPP rather than tax, which
is the number that stops the comparison reading as "dividends win" when it
really means "dividends skip a pension contribution".

## Where a model is allowed to help

One line, drawn in `src/llm.ts` rather than left to judgement at each call
site: a model may **classify, draft or explain**. It may never compute. The
product's claim is that its numbers are right, and a model confidently wrong
about a tax rule is worse than no feature.

Two uses. It labels bank rows that neither a remembered correction nor a
keyword could identify, and it turns figures the engine has already worked out
into a paragraph. Both sit behind something that catches a wrong answer: a
suggestion appears in the import preview marked as a suggestion, in front of
somebody who is already checking, and an explanation is discarded outright if it
contains a dollar figure that was not in the input. That second guard is what
makes the feature safe to ship: a number the model produced rather than repeated
is arithmetic, which is the one thing it is not allowed to do.

Everything fails soft. No key, a timeout, a refusal, a malformed answer: all
degrade to exactly what the product did before, and none fail a request. A
bookkeeping page that will not load because an inference provider is having an
afternoon is not a trade worth making.

Measured rather than estimated: a classification call is about 70 tokens in and
7 out on Gemini Flash Lite, which is $0.00001. A customer importing monthly for
a year costs a hundredth of a cent.

## Staying current

Every rate in this product is a constant compiled into the Worker, which is a
claim about the outside world that was true on the day it was typed. Rates move
every January. Nothing about a hard coded 5.95% announces that it has stopped
being correct, and a tax product quietly a year out of date is worse than none,
because it is confidently wrong.

Three defences, in order of how much they can be trusted.

The rates carry the year they belong to, and if that year is behind the calendar
every screen that computes money says so. Arithmetic, no network, cannot fail.

Changes already announced are written down with their dates, so the warning
arrives before the change rather than after somebody files on the old number.
Ontario's dividend credit falling in January 2027 and the accelerated investment
incentive expiring in 2028 are both already in there. Anything still only
proposed stays out of it and becomes a caveat beside the calculation instead:
the enacted rule is computed and the proposal is named.

A weekly job reduces each authority's page to the set of amounts and rates on it
and reports when that set moves. Reducing to figures rather than to text is what
makes it usable: navigation, banners and the "date modified" stamp on every
canada.ca page all change constantly, and a watch that fires every week is a
watch that gets switched off. An alert says what we hold and which file to edit,
never what the new rate is, because it does not know. A page that returns no
figures at all is reported as needing attention rather than hashed to the empty
digest, since an error page has no figures in it either.

## More than one person on the payroll

A one person corporation needs no employee register: the ledger's salary account
is the whole payroll and the T4 falls out of it. A second person changes that,
because one aggregate cannot be split back into two slips. So the register
exists once it is needed and not before, and when both exist and disagree the
difference is shown rather than reconciled away.

EI is the reason this is more than bookkeeping. Someone holding more than 40% of
the voting shares is not in insurable employment and pays none; an arm's length
employee is, and the employer pays 1.4 times what they do on top, which makes EI
the one payroll contribution that is not matched. There is a second exclusion
for people who do not deal at arm's length with the employer, and it turns on
whether the terms are what they would be between strangers. CRA decides that on
a ruling request, so FileClear raises it as a question rather than answering it
from a percentage.

Ontario's employer health tax comes in here too, because it arrives from a
direction nobody is watching: it is provincial, has nothing to do with CRA, and
most small corporations owe nothing and still have to file. The rate band is set
by total remuneration before the exemption and applied to what is left after it,
which is the easy thing to get backwards.

## Billing

Two rules shape it. Card details never touch the Worker: the card is entered on
Stripe's own page and what comes back is an identifier. And Stripe is the record
of what somebody is entitled to, not D1; the local copy exists so a page render
does not need a network call, and it is written from webhooks rather than from
the application's opinion at checkout. A subscription ends for reasons the
application never sees, and deciding entitlement from what happened to be
recorded at checkout leaves a paying screen open to somebody who stopped paying.

A cancelled subscription keeps working to the end of the period already paid
for, because that is what the terms promise, and that is a date question rather
than a status one. A past due subscription keeps working too: a failed renewal
is usually an expired card, Stripe retries, and locking the door on the first
failure loses customers who were always going to pay.

The paywall is deliberately partial. The calendar and the reminders stay open
after a trial ends, because switching off the thing that stops somebody missing
a deadline would make FileClear the cause of the penalty it exists to prevent.
The screens that compute money are what a subscription buys.

Thirty days free to start, dated rather than counted, on Toronto's clock like
every other date here.

## Status

Everything above, plus billing. Ahead: password reset and sign in throttling,
which matter before real customers, and Quebec and Alberta corporate tax, which
needs their own returns rather than their rates.


## Businesses that were never incorporated

FileClear began as a corporation product and a sole proprietor could not be set
up at all. They now are, and the split runs deeper than a label: a corporation
is a separate taxpayer with its own return, its own tax and a second decision
about taking money out, while a sole proprietorship *is* its owner. There is no
second taxpayer, no annual return to any registry, no dividend, and the
business's profit lands on a personal return that was already going to be
filed.

Each rule says which kinds of business owe it. The handful that are shared,
payroll and GST/HST and the construction return, are shared because CRA
genuinely treats them the same way rather than because it was convenient.

The pair worth knowing is a split that catches almost everybody. A self-employed
person files by 15 June and pays by 30 April, and an annual HST filer on a
December year end is on exactly the same two dates. The filing deadline was
extended for self-employed people and the payment deadline was not, so anybody
who waits until June to work out what they owe has been paying interest on it
since 1 May. Both dates appear, separately, in that order.

`normalise` enforces what a business without shares cannot be: not a CCPC, not
claiming the small business deduction, paying no dividend, and on a calendar
fiscal year. Without it a stale answer left over from the corporate form
produces a T5 for a business with no shareholders.

Set-up now asks one question on its own before anything else, because
everything downstream turns on the answer and so does the wording of the steps
after it. It used to open with the legal name and the date of incorporation
together, which assumed the answer: a sole proprietor met "Date of
incorporation" as the second field and had already been told the product was
not built for them.

CPP is the difference people underestimate. An employee pays 5.95% and their
employer pays the matching 5.95%; self-employed, you are both, so the rate is
11.9% and the maximum is $9,292.90 rather than $4,230.45. It arrives as one
bill in April rather than in twenty six pieces. The split into a deduction and
a credit is not the contribution halved: the employer half and all of the
enhancement come off income, and only the employee's base share is a credit.
Treating the whole thing as deductible understates tax by a few hundred dollars
at the ceiling, which is small enough to go unnoticed.

Extracting the bracket arithmetic out of `personalTax` was how self-employment
income ended up on exactly the same brackets, basic personal amount, surtax and
health premium as a salary. All 526 tests that existed at the time passed
unchanged through that refactor, which is the evidence it moved nothing.

## Business use of home

The deduction most often got wrong, in both directions. Too little, because
people share the utilities and forget the rent or the mortgage interest, which
is usually the largest number on the page. Too much, because a space that is
also lived in is prorated by time as well as by area and the hours get left
out: a dining table used eight hours a day is 8/24 of its floor area, not one
whole room.

Only mortgage interest is deductible, never the principal, so the two are asked
for separately rather than as one housing cost somebody enters a whole payment
into. Capital cost allowance on a home is left out on purpose: claiming it can
cost part of the principal residence exemption when the house is sold, which is
almost always a larger number than the deduction it buys.

The inputs are stored rather than the claim, so a figure can be rebuilt and
explained years later if CRA asks how it was arrived at. Storing the computed
claim would freeze the arithmetic at whatever the code did on the day it was
saved, which is the same failure this product avoids by recomputing filings
from the profile.

It is also the one expense that cannot create or deepen a loss, which is why it
sits below the net income line rather than among the expenses. What will not
fit this year carries forward indefinitely against the same business, so the
unused part is reported rather than discarded.

## Whether to incorporate

The question that decides which half of the product somebody belongs to, and it
is answered almost everywhere with folklore. "Incorporate once you hit a
hundred thousand" is the usual number, repeated without a calculation behind
it.

The arithmetic says the threshold is not about income at all. A sole proprietor
is taxed on the whole profit whether or not they spend it; a corporation is
taxed at the small business rate on what stays inside, and the rest is taxed
again when it comes out. So incorporating is a **deferral** on the part of the
profit left in the company rather than a discount on tax. Draw every dollar out
to live on and the two routes land within a few thousand of each other and the
fees are a straight cost.

That is why the draw is a control on the screen rather than an assumption, and
why the headline figure is reported beside the tax still waiting on the
retained profit. A number that reads as a saving when most of it is a delay is
the most misleading thing this product could print.

No recommendation, for the same reason as the salary and dividend comparison.
Limited liability, a contract that requires a corporation, a partner joining
and the lifetime capital gains exemption on a sale are each capable of deciding
it on their own, and none of them are things tax arithmetic can see.

## The gaps a profile could reach and the calendar could not

Five settings the set-up form accepted produced no filing at all, which is the
worst shape for this product to be wrong in: an absent deadline reads as
nothing owing, and nothing about a blank month announces that a rule was never
written.

A monthly HST filer had no return. Both accelerated payroll remitters had no
remittance. A quarterly remitter's dates were counted back from the fiscal year
end, but CRA's payroll accounts run on the calendar, so a corporation with a
June year end saw four dates in the wrong months. Instalments were quarterly for
everybody, when quarterly is a concession an eligible CCPC earns and monthly is
the default, which understated a general rate corporation by eight payments a
year.

Annual returns now cover British Columbia and Alberta as well as federal and
Ontario. A corporation incorporated anywhere else is told plainly that its
registry's date is not computed here, rather than shown an empty calendar,
because inventing a date for a registry nobody checked is the failure this
product exists to prevent. Alberta and Quebec assess their own corporate tax,
which `provinces.ts` already knew and the calendar did not, so an AT1 and a
CO-17 appear for a corporation with an establishment there.

`test/gaps.test.ts` closes with the check that would have caught three of these
before a customer did: every value the form can produce has to reach at least
one rule.

## Deadlines on days nobody is open

CRA, Corporations Canada and the Ontario Business Registry all treat a filing
as on time if it arrives on the next business day when the statutory date falls
on a weekend or a public holiday. FileClear computed the statutory date and
stopped, which is right about the statute and wrong about the deadline: a
balance falling on Sunday 30 June was shown as due on the Sunday, so somebody
who paid on the Monday believed they were late and somebody who wanted the
weekend thought they could not have it.

Both dates are kept. The statutory one identifies the filing, because filing
ids are stored and shifting them would have unticked everything anybody had
ticked off, once, on the day the weekend rule shipped. The effective one is
what every screen shows and what the reminder sweep counts from, and the
difference is explained where it appears rather than left to be noticed.

Good Friday moves, so Easter is computed rather than tabulated. Accelerated
threshold 2 remittances are due three *working* days after each period closes,
which over a long weekend is five or six calendar days, and CRA means working
days.

## Mac and Windows

`desktop/` is an Electron shell around fileclear.ca, and that is the design
rather than a shortcut. Every rate in this product is a claim about the outside
world that was true the day it was typed, and the whole architecture exists so
a correction reaches everybody the next morning rather than only the people who
happen to update. A desktop build carrying its own copy of the rules would hand
that back: somebody on last spring's version would be quietly wrong about a
rate that changed, with nothing on screen to say so.

So the arithmetic stays on the server and the app is a window onto it. A deploy
reaches every desktop immediately, with nothing to install. The shell updates
separately and rarely, through electron-updater, and installs on quit rather
than interrupting a return.

What it adds over a browser tab: the outstanding count on the dock or taskbar
icon, native menus and shortcuts, links to CRA and the registries opening in
the user's own browser where the address bar is visible, and an offline screen
that says what is actually true rather than offering to check the cables.

Updates come from `fileclear.ca/download/`, served by the Worker out of R2, not
from GitHub releases. The repository is private, so electron-updater's GitHub
provider would need a token shipped inside every copy of the app, which is a
credential handed to everybody who downloads it. And an installer should come
from the product's own domain: one fetched from a personal GitHub account is
the shape of a thing a person should not run.

The caching rule that matters is the one that is easy to invert. The manifests
are the feed and are held to five minutes; cache them hard and an app keeps
offering a superseded version for as long as the cache lives. The installers
are immutable, because a released version number never points at different
bytes than it did yesterday.

Releases are made from the Mac by `Scripts/release-mac.sh` rather than in CI.
macOS runners bill at ten times the Linux rate on a private repository, so a
five minute build spends fifty of the two thousand free minutes in a month,
which is most of the budget for something this machine does in ninety seconds
with the certificate already in its Keychain. The workflow is still there and
earns its place back the day Windows has a certificate, because that genuinely
cannot be built on a Mac.

The script checks the tree is clean, that the generated site has not fallen
behind its generator, and that the tests pass, all before spending two minutes
on a build. Then it asks Gatekeeper what a user's Mac will make of the result,
rather than asking codesign whether a signature exists, and reads the live feed
back afterwards rather than trusting the upload.

`desktop/README.md` has the signing story. macOS needs a Developer ID
Application certificate, which costs nothing beyond the Apple Developer
membership already held and is the one step Apple reserves for the Account
Holder: an App Store Connect API key is refused whatever role it holds. Windows
needs a certificate that has to be bought, and is parked until then.


## Filing, and what FileClear is allowed to send

Whether FileClear can file something for you has a different answer for each
authority, and the answers are theirs rather than a choice made here.

GST/HST, the T2 and the T1 can only be transmitted on somebody's behalf by
software CRA has certified. CRA lists GST/HST Internet File Transfer as needing
certified software, and certification is a process a developer applies for with
CRA's GST/HST Electronic Filing Services Section, not a feature. Ontario's
annual return can be filed for a client only through its Partner Portal, a web
portal for approved intermediaries such as accountants and lawyers. Corporations
Canada files through its Online Filing Centre. None of them has a public filing
interface.

So every filing on the calendar has a File it screen that does everything short
of the submit button. For an HST return that is the figures in the order GST/HST
NETFILE asks for them, lines 90 and 91 included, with CRA's own line names, the
lines CRA calculates itself marked as ones to check rather than type, where to
file, how to pay and by when. For an annual return it is what to have in hand,
what the registry will ask, the fee and the link. Then the confirmation number
comes back here, which marks the filing done and keeps a copy of the figures as
they were filed.

That copy is the one place this product stores a computed figure, and the
reason is the usual reason turned round. A correction should reach everybody the
next morning because a calculation is not a fact; once a return has gone to CRA
it is a fact about the past, and the ledger changing afterwards must not change
what FileClear says was filed.

The screen found three things wrong on the way. The HST screen labelled HST
collected as line 105 and input tax credits as line 108, which are the totals
after adjustments that CRA calculates; the figures go on 103 and 106. An
unincorporated annual HST filer was told to pay by the return's 15 June
deadline, when the money is due on 30 April, which is the six weeks of interest
this product exists to prevent. And the calendar fetched filings from today
onwards, so a missed filing disappeared the morning after its deadline and the
overdue count could only read zero. It now keeps anything that fell due while
FileClear was watching and was never ticked off.

### T4 and T5: the one return FileClear hands CRA directly

Information returns are the exception. CRA's Internet File Transfer accepts an
XML file from "in-house developed software" with no certification, as long as
the file validates against CRA's published schema. So the slips screen makes
the T4 or T5, slips and summary together, as that file, and the person uploads
it with their CRA business account or a web access code. CRA answers with a
submission number, which goes back on the calendar like any other confirmation.

The generator is tested with `xmllint` against both CRA schema packages, the
current xmlschm1-26-3 and the draft 1-27-1, vendored under `test/fixtures`. It
leaves out optional fields with no value, which CRA has rejected since October
2025, and it fills the recipient fields a T5 schema requires but an individual
does not have with the values CRA's specification gives for them.

The business details are kept so they are typed once: the RP and RZ account
numbers, the address and the contact. The SINs are not. They are asked for when
the file is made, go into that one file, and are stored nowhere, and the
response carries `Cache-Control: no-store`.

The T4 deduction boxes are editable on that form, box 14 is not. Box 14 is the
ledger's salary. Boxes 16 to 26 report what was actually withheld, which only
the payroll records know, so FileClear's figures are offered as the starting
point rather than the answer.

### The T2 and the T1: other software, exact figures

The T2 and the T1 still go through certified software. The File it screen names
products from CRA's own lists, the T2 list for a corporation and the NETFILE
list for a person, where Better Tax, GenuTax Standard and Wealthsimple Tax are
free, and links to both lists rather than recommending one. Then it gives the
figures schedule by schedule in the order the software asks: Schedule 125 and
Schedule 100 by GIFI code, Schedule 8 class by class, Schedule 1 from amount A
to line 300, and for a person the T2125 by its own line numbers. Totals the
software computes are marked as ones to check, never to type. The Schedule 1
line numbers were checked against CRA's form: recapture is line 107, the meals
add back 121, capital cost allowance 403 and a terminal loss 404.

### Tax tables by year

Personal tax, CPP, EI and the RRSP limit are held one set per tax year in
`TABLES` in `src/rules/personal.ts`: 2024, 2025 and 2026, each read off that
year's T4127 payroll formulas and CRA's table of limits. A 2025 slip carries
2025 CPP and EI, a 2025 T2125 is taxed at 14.5% on the lowest federal bracket,
which is 15% for half of 2025 and 14% for the other half, and the 2025 basic
personal amount, and so on. A test checks every CPP and EI maximum against its
own ceilings, so a table typed wrong fails before it reaches a slip.

A year with no tables of its own, such as 2023, gets the nearest year held and
says so on every screen that uses it. The T1 filing screen goes further and
offers only lines 13499 and 13500 for such a year, since a tax figure to check
against would be confidently wrong. The salary and dividend comparison and the
incorporation question look forward, so they use the current year.

Each January needs one new entry in `TABLES` and `RATE_YEAR` moved to it. The
rate watch on the calendar says so ahead of time.

## The chart of accounts, checked against RC4088

Six GIFI codes were wrong until they were checked against CRA's guide rather
than recalled. Travel sat on 8242, Subsidies and grants, an income code, so a
corporation copying Schedule 125 would have reported its airfare as government
assistance. Software was on 8523, Meals and entertainment; telephone on 8914,
Equipment rental; HST recoverable on 1067, Interest receivable; the employer's
CPP and EI on 9061, Commissions; and source deductions payable on 2650, which is
not a GIFI code.

Underneath that, the unincorporated year end printed GIFI codes as though they
were T2125 lines. The two coincide more often than not, which is why it looked
right, and where they differ a figure lands in the wrong box: telephone is 9225
in GIFI and 9220 on the T2125. Each account now carries both. The T2125 was also
deducting meals in full when line 8523 asks for the allowable part only.
