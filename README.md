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

`fileclear.ca`, as a Worker with D1 and R2, with `fileclear.antipodetech.com`
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

## Status

Done: the obligation engine, accounts and sessions, onboarding, the filing
calendar grouped by month, the ledger with GIFI coded accounts, the HST return
computed both ways, and the daily reminder sweep.

Ahead: year end and the T2 worksheet, then the compensation planner and slips.
