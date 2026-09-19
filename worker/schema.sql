-- FileClear.
--
-- Two ideas shape this schema.
--
-- A company profile is a set of answers, and the filing calendar is derived
-- from it rather than stored. Storing generated deadlines would mean a rule
-- correction only reaching companies created after it, which is the failure
-- mode that makes compliance software untrustworthy. So filings are computed on
-- every read and only the things a person did to them are persisted.
--
-- That works because a filing's id is stable: rule id, period and due date. Fix
-- a rule and the ids that changed are exactly the filings whose dates moved,
-- which is correct, because a filing that moved is not the one that was ticked.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- accounts

CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  -- PBKDF2-SHA256, stored as iterations:salt:hash, all base64. Verified in
  -- constant time. There is no password reset flow yet and no third party
  -- identity provider; both are deliberate for now rather than forgotten.
  password     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

-- Case insensitive, because people do not type their own email consistently
-- and two accounts differing only in case is a support ticket, not a feature.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email ON accounts (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);

-- --------------------------------------------------------------- companies

-- One row is one CompanyProfile. Column names track the field names in
-- src/rules/profile.ts so the mapping in src/db.ts stays obvious.
--
-- An accountant or a founder with two corporations needs more than one, so
-- companies belong to an account rather than being the account.
CREATE TABLE IF NOT EXISTS companies (
  id                     TEXT PRIMARY KEY,
  account_id             TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  legal_name             TEXT NOT NULL,
  -- CBCA for federal, otherwise the province: ON, BC, AB and the rest.
  -- This decides which annual return exists at all, so it is not nullable.
  jurisdiction           TEXT NOT NULL,
  incorporation_date     TEXT NOT NULL,          -- yyyy-mm-dd

  -- A fiscal year end is any date, not necessarily 31 December, and every
  -- corporate deadline except the federal annual return hangs off it.
  fye_month              INTEGER NOT NULL CHECK (fye_month BETWEEN 1 AND 12),
  fye_day                INTEGER NOT NULL CHECK (fye_day BETWEEN 1 AND 31),

  is_ccpc                INTEGER NOT NULL DEFAULT 1,
  -- Separate from is_ccpc on purpose. A CCPC whose business limit has been used
  -- up by associated corporations does not get the extra month to pay, and
  -- collapsing these two into one flag is how that bug gets written.
  claims_sbd             INTEGER NOT NULL DEFAULT 1,

  gross_revenue          INTEGER NOT NULL DEFAULT 0,
  last_year_tax_payable  INTEGER NOT NULL DEFAULT 0,

  hst_registered         INTEGER NOT NULL DEFAULT 0,
  hst_period             TEXT    NOT NULL DEFAULT 'annual',
  hst_method             TEXT    NOT NULL DEFAULT 'regular',
  hst_last_year_net_tax  INTEGER NOT NULL DEFAULT 0,

  payroll_account        INTEGER NOT NULL DEFAULT 0,
  payroll_remitter       TEXT    NOT NULL DEFAULT 'regular',
  payroll_on_remuneration INTEGER NOT NULL DEFAULT 0,

  pays_dividends         INTEGER NOT NULL DEFAULT 0,
  is_construction        INTEGER NOT NULL DEFAULT 0,

  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS companies_account ON companies (account_id);

-- Permanent establishments, one row per province. A separate table rather than
-- a delimited column because provincial allocation on the T2 is a join, and
-- because Ontario employer health tax turns on whether ON is in this list.
CREATE TABLE IF NOT EXISTS company_provinces (
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  jurisdiction TEXT NOT NULL,
  PRIMARY KEY (company_id, jurisdiction)
);

-- ----------------------------------------------------------------- filings

-- What a person did to a computed filing. The filing itself is not stored.
--
-- filing_id is the engine's stable id: "<obligation>|<period>|<due date>". When
-- a rule is corrected and a date moves, the new filing has a new id and arrives
-- untouched, which is right: nobody ticked off the corrected one.
CREATE TABLE IF NOT EXISTS filing_states (
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filing_id   TEXT NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('done', 'dismissed')),
  note        TEXT,
  changed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, filing_id)
);
CREATE INDEX IF NOT EXISTS filing_states_company ON filing_states (company_id);

-- ------------------------------------------------------------ transactions

-- The ledger. One row is one line on a bank statement or one invoice.
--
-- Money is in cents, as an integer. Floating point money is how a return ends
-- up a penny out from the bank and a person spends an evening on it.
--
-- hst_cents is what was actually on the document rather than a computed 13%.
-- A supplier's rounding is theirs, a supplier outside Canada charges none, and
-- imputing tax that was never charged is claiming an input tax credit that does
-- not exist.
CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  txn_date    TEXT NOT NULL,                 -- yyyy-mm-dd
  account_id  TEXT NOT NULL,                 -- key into src/rules/gifi.ts
  amount_cents INTEGER NOT NULL,             -- before HST
  hst_cents   INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS transactions_company_date
  ON transactions (company_id, txn_date);

-- --------------------------------------------------------------- reminders

-- Phase two. A calendar you have to remember to open is a calendar you have
-- already failed to use, so the product emails before a window closes.
ALTER TABLE companies ADD COLUMN remind_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN remind_lead_days INTEGER NOT NULL DEFAULT 14;

-- One row per filing already warned about, so a daily sweep does not send the
-- same reminder every morning for two weeks.
--
-- Keyed by the engine's stable filing id, which means a rule correction that
-- moves a date produces a filing nobody has been warned about yet, and the
-- warning goes out again. That is right: the date changed.
CREATE TABLE IF NOT EXISTS reminders_sent (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filing_id  TEXT NOT NULL,
  sent_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, filing_id)
);

-- ------------------------------------------------------- double entry, phase 3

-- Where the money came from or went to.
--
-- The books stay single entry on the surface: one row is one account and one
-- amount, because a two person corporation will not think in debits and
-- credits. But a balance sheet cannot be derived from one sided records, and
-- Schedule 100 of the T2 is a balance sheet, so the ledger has to balance
-- underneath.
--
-- This one column is enough. The HST leg is already recorded, and the sign of
-- every leg follows from what kind of account it is, so src/rules/postings.ts
-- expands each row into a balanced entry without asking for anything else.
--
-- Defaulted to the bank, which is what a row without one always meant.
ALTER TABLE transactions ADD COLUMN counter_account_id TEXT NOT NULL DEFAULT 'bank';

-- ------------------------------------------------------------ phase 3, year end

-- The capital asset register.
--
-- A laptop is not an expense. It joins a class, and a percentage of that class
-- is deducted each year until the pool runs out, which is Schedule 8. So a
-- capital purchase is recorded twice on purpose: once in the ledger, where the
-- money left the bank, and once here, where the tax treatment lives.
--
-- available_for_use is the date the thing could actually be used, which is not
-- always the invoice date, and it is the date CRA cares about.
CREATE TABLE IF NOT EXISTS assets (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  class_number      REAL NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  available_for_use TEXT NOT NULL,              -- yyyy-mm-dd
  cost_cents        INTEGER NOT NULL,
  disposed_on       TEXT,                       -- yyyy-mm-dd, when sold or scrapped
  proceeds_cents    INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS assets_company ON assets (company_id, available_for_use);

-- A capital cost allowance claim smaller than the maximum.
--
-- CCA is permissive: any amount from zero up to the maximum may be claimed, and
-- claiming less in a loss year keeps the pool for a year when the deduction is
-- worth more. Only a reduction is stored, because the maximum is computed. An
-- empty table means every class is claimed in full, which is the common case.
CREATE TABLE IF NOT EXISTS cca_claims (
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year_end      TEXT NOT NULL,                  -- yyyy-mm-dd, identifies the fiscal year
  class_number  REAL NOT NULL,
  claimed_cents INTEGER NOT NULL,
  PRIMARY KEY (company_id, year_end, class_number)
);

-- ------------------------------------------------------- watching the sources

-- One row per authority page being watched.
--
-- Every rate in this product is a constant compiled into the Worker, which is a
-- claim about the outside world that was true the day it was typed. This is how
-- the claim gets rechecked: a hash of the figure bearing text on the page it
-- came from, compared each week.
--
-- Only the digest is kept, not the page. The question is whether it changed,
-- and storing government web pages to answer that would be a strange use of a
-- database.
CREATE TABLE IF NOT EXISTS source_watch (
  source_id  TEXT PRIMARY KEY,
  digest     TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------ the payroll

-- Who is on the payroll.
--
-- A one person corporation does not need this: the ledger's salary account is
-- the whole story and the T4 falls out of it. The moment there is a second
-- person it does, because one aggregate cannot be split back into two slips.
--
-- voting_share_pct is here rather than on the profile because it is a fact
-- about each person, and it decides insurability: over 40% of the voting shares
-- and the employment is excluded from EI whatever anybody would prefer.
CREATE TABLE IF NOT EXISTS employees (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  annual_salary_cents INTEGER NOT NULL,
  voting_share_pct    REAL NOT NULL DEFAULT 0,
  pay_frequency  TEXT NOT NULL DEFAULT 'monthly',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS employees_company ON employees (company_id);

-- --------------------------------------------------- more than one corporation

-- Which company the account is currently looking at.
--
-- The schema always allowed an account to own several; the application only
-- ever read the first, which meant incorporating a second company made it
-- invisible. That assumption sat in a query rather than in a screen, which is
-- the expensive kind.
--
-- Kept on the account rather than in a cookie so the choice follows the person
-- between devices, and nullable so an account with one company never has to
-- think about it.
ALTER TABLE accounts ADD COLUMN active_company_id TEXT;

-- ------------------------------------------------------------------ billing

-- A free trial, dated rather than counted.
--
-- Set when the account is created, so the trial is a date somebody can be told
-- rather than a number of logins nobody can check. Stripe's own trial would
-- need a card up front, and asking for one before the product has proved
-- anything is how a trial stops being a trial.
ALTER TABLE accounts ADD COLUMN trial_ends_at TEXT;

-- A copy of what Stripe says the account is entitled to.
--
-- Stripe is the record, not this table. A subscription ends for reasons the
-- application never sees: a card expires, a payment is disputed, somebody
-- cancels from an email receipt. So this is written from webhooks rather than
-- from the application's own opinion at checkout, and it exists only so a page
-- render does not need a network call.
--
-- current_period_end is kept because a cancelled subscription still entitles
-- somebody until the period they paid for runs out, which is what the terms
-- promise. That is a date question, not a status question.
CREATE TABLE IF NOT EXISTS subscriptions (
  account_id             TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'none',
  current_period_end     INTEGER NOT NULL DEFAULT 0,
  cancel_at_period_end   INTEGER NOT NULL DEFAULT 0,
  plan                   TEXT NOT NULL DEFAULT '',
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions (stripe_customer_id);

-- --------------------------------------------------------- getting back in

-- Password reset tokens.
--
-- Only the SHA-256 of a token is kept, never the token, so a copy of this table
-- is not a set of working reset links. One live token per account: asking again
-- replaces the last rather than leaving a trail of usable links behind.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS password_resets_account ON password_resets (account_id);

-- Attempt counters for sign in, signup and password reset.
--
-- A Worker has no memory worth the name, so the counter lives here. One row per
-- key, a fixed window, and the key is either an address or an account: either
-- can trip, which stops a spread out attack without letting anybody lock a
-- customer out of their own product by failing their sign in on purpose.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL      -- epoch milliseconds
);

-- --------------------------------------------------------- reading a bank file

-- What an account was corrected to, so the next import does not ask again.
--
-- Keyed on the stable part of a bank description rather than the whole string,
-- because a card transaction carries a different reference number every time
-- and matching the whole thing would remember nothing.
CREATE TABLE IF NOT EXISTS import_rules (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pattern    TEXT NOT NULL,
  account_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, pattern)
);

-- ------------------------------------------- businesses that are not companies

-- Incorporated, or not.
--
-- FileClear was a corporation product, so every row that existed before this
-- column did was a corporation and the default says so. That is a statement
-- about history rather than a safe fallback.
--
-- The obligations are almost entirely different. A sole proprietorship files no
-- T2 and no annual return to any registry; its profit goes on form T2125 inside
-- the owner's personal return, which is due 15 June while the money is due
-- 30 April. Only payroll, GST/HST and the construction return are genuinely
-- shared, and they are shared because CRA treats them the same way.
ALTER TABLE companies ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'corporation';

-- Whether the business trades under a name other than the owner's own.
--
-- Only meaningful for a sole proprietorship, and only because an Ontario
-- business name registration expires five years after it is made. Nothing
-- chases it: no return depends on it and no authority writes, so it is usually
-- discovered at a bank.
ALTER TABLE companies ADD COLUMN registered_business_name INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN business_name_registered_on TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------- business use of home

-- What the home costs, and how much of it is the business's.
--
-- One row per business per fiscal year, because the numbers change every year
-- and because a claim has to be reconstructable years later if CRA asks how it
-- was arrived at. Storing the computed claim instead of its inputs would make
-- that impossible, and it would freeze the arithmetic at whatever the code did
-- on the day it was saved.
--
-- hours_per_week is null for a room used only for the business. That is not the
-- same as zero, and the distinction is the whole difference between a claim
-- prorated by time and one that is not.
CREATE TABLE IF NOT EXISTS home_office (
  company_id           TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year_end             TEXT NOT NULL,          -- yyyy-mm-dd, identifies the year
  home_area            REAL NOT NULL,
  work_area            REAL NOT NULL,
  hours_per_week       REAL,
  rent_cents           INTEGER NOT NULL DEFAULT 0,
  -- Interest only. The principal is not deductible, which is why this is not a
  -- single "mortgage" column somebody would put their whole payment in.
  mortgage_interest_cents INTEGER NOT NULL DEFAULT 0,
  property_tax_cents   INTEGER NOT NULL DEFAULT 0,
  insurance_cents      INTEGER NOT NULL DEFAULT 0,
  utilities_cents      INTEGER NOT NULL DEFAULT 0,
  maintenance_cents    INTEGER NOT NULL DEFAULT 0,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, year_end)
);
