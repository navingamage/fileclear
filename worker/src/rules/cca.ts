/**
 * Capital cost allowance, Schedule 8.
 *
 * A capital purchase is not an expense. A laptop bought for $3,000 does not
 * reduce this year's income by $3,000; it joins a pool and a percentage of that
 * pool is deducted each year until it runs out. Getting this wrong in either
 * direction is expensive: expensing capital overstates the deduction and
 * invites a reassessment, and forgetting to claim CCA at all leaves money in
 * the pool that could have reduced tax.
 *
 * This is the one part of FileClear that has to remember something across
 * fiscal years. Everything else recomputes from the ledger on every read, which
 * is deliberate, but undepreciated capital cost is a genuine carried balance:
 * this year's opening pool is last year's closing pool, and the chain runs back
 * to the first purchase. So the schedule is computed for every year from the
 * beginning and the year asked for is read off the end of that chain, rather
 * than a closing balance being stored and trusted.
 *
 * CCA is also permissive. A corporation may claim any amount from zero up to
 * the maximum, and claiming less in a loss year keeps the pool for a year when
 * it is worth more. FileClear computes the maximum and lets the number be
 * reduced, because choosing to claim less is a decision, not a calculation.
 */

/** The classes a small service corporation actually uses. */
export interface CcaClass {
  /** CRA's class number, which is what Schedule 8 asks for. */
  number: number;
  name: string;
  /** Declining balance rate. */
  rate: number;
  /**
   * Whether the half year rule would normally apply. Almost everything, but
   * Class 12 at 100% and a few others are exempt, and the accelerated
   * investment incentive treats the two differently.
   */
  halfYear: boolean;
  hint?: string;
}

export const CCA_CLASSES: CcaClass[] = [
  { number: 50, name: 'Computers and systems software', rate: 0.55, halfYear: true,
    hint: 'Laptops, desktops, servers, monitors. The commonest class for a software business.' },
  { number: 8, name: 'Furniture, fixtures, other equipment', rate: 0.20, halfYear: true,
    hint: 'The catch all for equipment that has no class of its own.' },
  { number: 10, name: 'Motor vehicles', rate: 0.30, halfYear: true,
    hint: 'A passenger vehicle over the cost ceiling goes in class 10.1 instead, one car per class.' },
  { number: 12, name: 'Tools and software under $500', rate: 1.00, halfYear: false,
    hint: 'Written off in full. Application software is class 12, unlike systems software.' },
  { number: 13, name: 'Leasehold improvements', rate: 0, halfYear: true,
    hint: 'Straight line over the lease term rather than declining balance, so FileClear does not compute it.' },
  { number: 14.1 as number, name: 'Goodwill and intangibles', rate: 0.05, halfYear: true,
    hint: 'Incorporation costs over $3,000, goodwill, customer lists.' },
  { number: 53, name: 'Manufacturing and processing equipment', rate: 0.50, halfYear: true },
];

export const CLASS_BY_NUMBER = new Map(CCA_CLASSES.map((c) => [c.number, c]));

/**
 * The accelerated investment incentive, and where it stands.
 *
 * Normally only half a year's CCA may be claimed on an addition in the year it
 * becomes available for use. The incentive suspends that and adds an
 * enhancement on top, and it is being phased out:
 *
 *   available for use 2019 to 2023   three times the normal first year amount
 *   available for use 2024 to 2027   twice the normal first year amount
 *   available for use 2028 onward    the half year rule returns
 *
 * "Twice the normal first year amount" is the half year rule cancelled with no
 * enhancement left, so an addition in 2026 earns a full year of CCA and no more.
 *
 * The 2024 Fall Economic Statement proposed reinstating the incentive in full
 * for property acquired on or after 1 January 2025. As of CRA's own page in
 * June 2026 that is still a proposal and not law, so FileClear computes the
 * enacted rule and says so rather than choosing the more generous answer for
 * somebody who has to sign the return.
 */
export function firstYearFactor(availableForUse: string, halfYear: boolean): number {
  const year = Number(availableForUse.slice(0, 4));
  if (year >= 2019 && year <= 2023) return halfYear ? 1.5 : 1.5;
  if (year >= 2024 && year <= 2027) return halfYear ? 1.0 : 1.25;
  return halfYear ? 0.5 : 1.0;
}

/** True while the enacted rule is less generous than the pending proposal. */
export const AII_PROPOSAL_PENDING = (year: number): boolean => year >= 2025 && year <= 2027;

export interface AssetRecord {
  id: string;
  /** CRA class number. */
  classNumber: number;
  description: string;
  /** yyyy-mm-dd, the date it became available for use, not the invoice date. */
  availableForUse: string;
  /** Cents. The capital cost, HST excluded where the HST was recoverable. */
  costCents: number;
  /** yyyy-mm-dd when it was sold or scrapped, if it was. */
  disposedOn?: string;
  /** Cents received on disposal. */
  proceedsCents?: number;
}

export interface ClassRow {
  classNumber: number;
  name: string;
  rate: number;
  /** Column 2 on Schedule 8. */
  openingUcc: number;
  /** Column 3. */
  additions: number;
  /** Column 4. Proceeds, capped at cost, which is what the pool gives back. */
  dispositions: number;
  /** The uplift the incentive adds to the base, before the rate is applied. */
  incentiveAdjustment: number;
  /** What the rate is actually applied to. */
  base: number;
  /** Column 12, the most that may be claimed. */
  maximumCca: number;
  /** What is being claimed. Equal to the maximum unless it has been reduced. */
  claimed: number;
  /** Column 13, carried into next year. */
  closingUcc: number;
  /** Recapture, taxable, when a pool goes negative. */
  recapture: number;
  /** Terminal loss, deductible, when a class empties with a balance left. */
  terminalLoss: number;
}

export interface Schedule8 {
  from: string;
  to: string;
  rows: ClassRow[];
  totalCca: number;
  totalRecapture: number;
  totalTerminalLoss: number;
  notes: string[];
}

const round = (n: number): number => Math.round(n);

/**
 * Schedule 8 for one fiscal year, computed forward from the first purchase.
 *
 * `years` must be in chronological order and cover every year from the first
 * one with assets in it up to the one wanted, because each opening balance is
 * the previous closing balance. `claims` optionally reduces the claim for a
 * class in the year being reported, which is a decision a director is allowed
 * to make.
 */
export function schedule8(
  assets: AssetRecord[],
  years: { from: string; to: string }[],
  claims: Record<number, number> = {},
): Schedule8 {
  const last = years[years.length - 1];
  if (!last) return { from: '', to: '', rows: [], totalCca: 0, totalRecapture: 0, totalTerminalLoss: 0, notes: [] };

  const ucc = new Map<number, number>();
  const costInPool = new Map<number, number>();
  let rows: ClassRow[] = [];
  const notes: string[] = [];

  for (const year of years) {
    const isTarget = year.to === last.to;
    rows = [];

    const touched = new Set<number>();
    for (const a of assets) {
      if (a.availableForUse <= year.to) touched.add(a.classNumber);
    }
    for (const n of ucc.keys()) touched.add(n);

    for (const classNumber of [...touched].sort((a, b) => a - b)) {
      const cls = CLASS_BY_NUMBER.get(classNumber);
      if (!cls) continue;

      const openingUcc = ucc.get(classNumber) ?? 0;

      const inYear = (a: AssetRecord) =>
        a.availableForUse >= year.from && a.availableForUse <= year.to;
      const additions = assets
        .filter((a) => a.classNumber === classNumber && inYear(a))
        .reduce((s, a) => s + a.costCents, 0);

      // Proceeds reduce the pool, but never by more than the asset cost. Any
      // excess is a capital gain, which belongs on Schedule 6 and not here.
      let dispositions = 0;
      let gainNote = false;
      for (const a of assets) {
        if (a.classNumber !== classNumber || !a.disposedOn) continue;
        if (a.disposedOn < year.from || a.disposedOn > year.to) continue;
        const proceeds = a.proceedsCents ?? 0;
        dispositions += Math.min(proceeds, a.costCents);
        if (proceeds > a.costCents) gainNote = true;
      }
      if (gainNote && isTarget) {
        notes.push(`Class ${classNumber}: sold for more than it cost. The excess is a `
          + 'capital gain for Schedule 6, and only the cost comes off the pool here.');
      }

      const netAdditions = additions - dispositions;

      // The incentive applies to a net addition. A class with more coming out
      // than going in gets nothing, which is the rule and also the only answer
      // that does not manufacture a deduction.
      const factor = netAdditions > 0
        ? firstYearFactor(year.to, cls.halfYear)
        : 1;
      const incentiveAdjustment = netAdditions > 0
        ? round(netAdditions * (factor - 1))
        : 0;

      const beforeCca = openingUcc + additions - dispositions;
      const base = Math.max(0, beforeCca + incentiveAdjustment);

      // Track cost still in the pool, so an emptied class can be recognised.
      const costBefore = costInPool.get(classNumber) ?? 0;
      const disposedCost = assets
        .filter((a) => a.classNumber === classNumber && a.disposedOn
          && a.disposedOn >= year.from && a.disposedOn <= year.to)
        .reduce((s, a) => s + a.costCents, 0);
      const costAfter = costBefore + additions - disposedCost;
      costInPool.set(classNumber, costAfter);

      let recapture = 0;
      let terminalLoss = 0;
      let maximumCca = 0;

      if (beforeCca < 0) {
        // More came out than the pool held. The excess was depreciation already
        // claimed and is taken back into income.
        recapture = -beforeCca;
      } else if (costAfter === 0 && beforeCca > 0) {
        // Nothing left in the class but a balance remains: the rest of the cost
        // is deductible now rather than at 55% a year forever.
        terminalLoss = beforeCca;
      } else {
        // The enhancement raises the base the rate is applied to, but a claim
        // can never exceed what is actually in the pool. It only bites at a
        // high rate: class 12 is 100%, so without the cap a $400 tool would
        // produce a $500 deduction. Undepreciated capital cost only goes
        // negative through a disposition, which is recapture, never through a
        // deduction.
        maximumCca = Math.min(round(base * cls.rate), Math.max(0, beforeCca));
        if (cls.rate === 0) {
          maximumCca = 0;
          if (isTarget && beforeCca > 0) {
            notes.push(`Class ${classNumber} is straight line over the lease term, `
              + 'which FileClear does not compute. Work that one out separately.');
          }
        }
      }

      const asked = isTarget ? claims[classNumber] : undefined;
      const claimed = asked === undefined
        ? maximumCca
        : Math.max(0, Math.min(maximumCca, Math.round(asked)));

      const closingUcc = recapture > 0 ? 0
        : terminalLoss > 0 ? 0
        : beforeCca - claimed;

      ucc.set(classNumber, closingUcc);
      rows.push({
        classNumber, name: cls.name, rate: cls.rate,
        openingUcc, additions, dispositions,
        incentiveAdjustment, base, maximumCca, claimed, closingUcc,
        recapture, terminalLoss,
      });
    }
  }

  const live = rows.filter((r) =>
    r.openingUcc || r.additions || r.dispositions || r.closingUcc || r.claimed);

  if (AII_PROPOSAL_PENDING(Number(last.to.slice(0, 4))) && live.some((r) => r.additions > 0)) {
    notes.push('Additions here use the accelerated investment incentive as it is '
      + 'currently enacted, which is in its phase out. The 2024 Fall Economic Statement '
      + 'proposed restoring it in full for property acquired from 1 January 2025. That '
      + 'was still a proposal at CRA’s last update, so the smaller deduction is the '
      + 'one shown. If it becomes law the claim goes up.');
  }

  return {
    from: last.from,
    to: last.to,
    rows: live,
    totalCca: live.reduce((s, r) => s + r.claimed, 0),
    totalRecapture: live.reduce((s, r) => s + r.recapture, 0),
    totalTerminalLoss: live.reduce((s, r) => s + r.terminalLoss, 0),
    notes,
  };
}
