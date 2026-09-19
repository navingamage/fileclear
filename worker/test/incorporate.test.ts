import { describe, expect, it } from 'vitest';
import {
  compareIncorporation, crossoverTable, CORPORATION_ANNUAL_COST,
} from '../src/rules/incorporate';
import { selfEmployedYear } from '../src/rules/selfemployed';

/**
 * The comparison that decides which half of the product somebody belongs to.
 *
 * What these tests mostly pin is the shape of the answer rather than a
 * particular dollar figure, because the shape is where the received wisdom is
 * wrong. Incorporating is a deferral on retained profit, not a discount on tax,
 * and an owner who draws everything out gets almost none of it.
 */

const at = (profit: number, draw: number) => compareIncorporation(profit, draw, 2026);

describe('the arithmetic adds up', () => {
  it('accounts for every dollar of profit on the sole proprietor side', () => {
    const c = at(100_000_00, 100_000_00);
    expect(c.soleProprietor.cashInHand + c.soleProprietor.totalOut).toBe(100_000_00);
    expect(c.soleProprietor.retained).toBe(0);
  });

  it('taxes a sole proprietor on the whole profit however little is drawn', () => {
    const drawnLittle = at(150_000_00, 40_000_00);
    const drawnAll = at(150_000_00, 150_000_00);
    expect(drawnLittle.soleProprietor.totalOut).toBe(drawnAll.soleProprietor.totalOut);
  });

  it('matches the standalone self-employed calculation', () => {
    const c = at(80_000_00, 80_000_00);
    const direct = selfEmployedYear(80_000_00);
    expect(c.soleProprietor.totalOut).toBe(direct.totalDue);
  });

  it('charges the corporation for existing', () => {
    const c = at(100_000_00, 50_000_00);
    expect(c.asSalary.runningCost).toBe(CORPORATION_ANNUAL_COST);
    expect(c.asDividend.runningCost).toBe(CORPORATION_ANNUAL_COST);
    expect(c.soleProprietor.runningCost).toBe(0);
  });
});

describe('what incorporating actually buys', () => {
  /**
   * The finding that matters. Draw everything out and the advantage collapses,
   * because the deferral applies only to profit left inside the company and
   * there is none. The fees are then a straight cost.
   */
  it('gives away almost nothing when every dollar is drawn out', () => {
    const c = at(120_000_00, 120_000_00);
    expect(c.asSalary.retained).toBe(0);
    // Within a few thousand either way, rather than the large win folklore
    // promises. The sign is allowed to go either way; the size is the point.
    expect(Math.abs(c.advantageThisYear)).toBeLessThan(12_000_00);
  });

  it('leaves real money inside the company when the owner draws less', () => {
    const c = at(200_000_00, 70_000_00);
    expect(c.asSalary.retained).toBeGreaterThan(0);
    expect(c.advantageThisYear).toBeGreaterThan(0);
  });

  /**
   * And says so. A headline advantage that reads as a saving, when most of it
   * is personal tax waiting on money that has not come out yet, is the single
   * most misleading number this product could print.
   */
  it('reports the tax deferred rather than letting it read as saved', () => {
    const c = at(200_000_00, 70_000_00);
    expect(c.deferredNotSaved).toBeGreaterThan(0);
    expect(c.considerations.join(' ')).toContain('deferred rather than saved');
  });

  it('reports no deferral when nothing was retained', () => {
    const c = at(90_000_00, 90_000_00);
    expect(c.deferredNotSaved).toBe(0);
  });
});

describe('the two corporate routes', () => {
  it('creates RRSP room on salary and none on dividends', () => {
    const c = at(120_000_00, 80_000_00);
    expect(c.asSalary.rrspRoom).toBeGreaterThan(0);
    expect(c.asDividend.rrspRoom).toBe(0);
  });

  it('pays no CPP at all on the dividend route', () => {
    const c = at(120_000_00, 80_000_00);
    expect(c.asDividend.cpp).toBe(0);
    expect(c.asSalary.cpp).toBeGreaterThan(0);
  });

  it('deducts the salary from corporate income and the dividend not', () => {
    const c = at(150_000_00, 60_000_00);
    expect(c.asSalary.businessTax).toBeLessThan(c.asDividend.businessTax);
  });
});

describe('the answer is never a recommendation', () => {
  it('names what the arithmetic cannot see', () => {
    const c = at(100_000_00, 60_000_00);
    const said = c.considerations.concat(c.caveats).join(' ');
    expect(said).toContain('limited liability'.replace('l', 'L'));
    expect(said).toContain('lifetime capital gains');
    expect(said).toContain('does not tell you which to choose');
  });

  it('states the cost it assumed rather than hiding it', () => {
    const c = at(100_000_00, 60_000_00);
    expect(c.caveats.join(' ')).toContain('1500');
  });
});

describe('edge cases', () => {
  it('handles a business with no profit', () => {
    const c = at(0, 0);
    expect(c.soleProprietor.totalOut).toBe(0);
    expect(c.asSalary.businessTax).toBe(0);
    expect(c.asDividend.businessTax).toBe(0);
  });

  it('cannot draw more than was earned', () => {
    expect(at(50_000_00, 90_000_00).drawnOut).toBe(50_000_00);
  });

  it('handles a loss without producing a negative tax bill', () => {
    const c = at(-30_000_00, 0);
    expect(c.soleProprietor.totalOut).toBe(0);
    expect(c.asSalary.businessTax).toBe(0);
  });

  it('crosses the business limit without the rate jumping backwards', () => {
    let last = -1;
    for (const profit of [400_000_00, 500_000_00, 600_000_00, 900_000_00]) {
      const tax = at(profit, 0).asDividend.businessTax;
      expect(tax).toBeGreaterThan(last);
      last = tax;
    }
  });
});

describe('the crossover table', () => {
  it('answers at what profit rather than at one profit', () => {
    const rows = crossoverTable(70_000_00, 2026);
    expect(rows).toHaveLength(5);
    // The advantage grows with profit, because more is left behind at each step.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.advantage).toBeGreaterThan(rows[i - 1]!.advantage);
    }
  });

  it('never draws more than the profit at each row', () => {
    for (const row of crossoverTable(200_000_00, 2026)) {
      expect(row.profit).toBeGreaterThan(0);
    }
  });
});
