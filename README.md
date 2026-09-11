# FileClear

Every filing a Canadian corporation owes, worked out from how that corporation
is actually set up, with the dates and the forms and who to send them to.

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

39 tests. The ones worth knowing about pin the differences above, plus the date
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

Workers Builds, from the `worker` directory, with the whole repository checked
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
