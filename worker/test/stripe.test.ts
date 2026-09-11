import { describe, expect, it } from 'vitest';
import {
  entitled, verifyWebhook, subscriptionFromEvent, ENTITLING_STATUSES,
  type Subscription,
} from '../src/stripe';

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  status: 'active',
  currentPeriodEnd: Math.floor(Date.now() / 1000) + 86_400 * 20,
  cancelAtPeriodEnd: false,
  plan: 'price_x',
  ...over,
});

const NOW = new Date('2026-06-15T12:00:00Z');
const inDays = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe('who may use the paid screens', () => {
  it('lets an active subscriber in', () => {
    expect(entitled(sub(), null, NOW).allowed).toBe(true);
    expect(entitled(sub(), null, NOW).reason).toBe('subscription');
  });

  /**
   * A failed renewal is usually an expired card rather than a decision to
   * leave, and Stripe retries for a while. Locking the door on the first
   * failure loses customers who were always going to pay.
   */
  it('lets a past due subscriber keep working while Stripe retries', () => {
    expect(entitled(sub({ status: 'past_due' }), null, NOW).allowed).toBe(true);
    expect(ENTITLING_STATUSES).toContain('past_due');
  });

  /**
   * The terms promise the service runs to the end of the period already paid
   * for. That is a date question, not a status question, which is why the
   * period end is stored at all.
   */
  it('keeps a cancelled subscription running to the end of the paid period', () => {
    const cancelled = sub({
      status: 'canceled',
      currentPeriodEnd: Math.floor(NOW.getTime() / 1000) + 86_400 * 5,
    });
    expect(entitled(cancelled, null, NOW).allowed).toBe(true);
  });

  it('closes it once that period has passed', () => {
    const expired = sub({
      status: 'canceled',
      currentPeriodEnd: Math.floor(NOW.getTime() / 1000) - 86_400,
    });
    expect(entitled(expired, null, NOW).allowed).toBe(false);
  });

  it('falls back to the trial when there is no subscription', () => {
    const r = entitled(null, inDays(10), NOW);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('trial');
    expect(r.trialDaysLeft).toBe(10);
  });

  it('counts the last day of the trial as still inside it', () => {
    const r = entitled(null, inDays(0), NOW);
    expect(r.allowed).toBe(true);
    expect(r.trialDaysLeft).toBe(0);
  });

  /**
   * Measured as calendar dates, not instants. Ten days left on the fifteenth
   * has to mean it ends on the twenty fifth, whatever time of day it is when
   * the page is rendered.
   */
  it('does not change the count with the time of day', () => {
    const ends = inDays(10);
    const counts = ['00:30', '12:00', '23:45'].map((t) =>
      entitled(null, ends, new Date(`2026-06-15T${t}:00Z`), '2026-06-15').trialDaysLeft);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(10);
  });

  it('closes once the trial date has passed', () => {
    const r = entitled(null, inDays(-1), NOW);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('none');
  });

  it('refuses an account with neither', () => {
    expect(entitled(null, null, NOW).allowed).toBe(false);
  });

  it('prefers a subscription over a trial that has not run out', () => {
    expect(entitled(sub(), inDays(5), NOW).reason).toBe('subscription');
  });
});

describe('the webhook signature', () => {
  const SECRET = 'whsec_test_secret';
  const payload = '{"id":"evt_1","type":"customer.subscription.updated"}';

  async function sign(body: string, timestamp: number, secret = SECRET): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign(
      'HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${timestamp},v1=${hex}`;
  }

  const at = Math.floor(NOW.getTime() / 1000);

  it('accepts a correctly signed payload', async () => {
    const header = await sign(payload, at);
    expect(await verifyWebhook(SECRET, payload, header, 300, NOW)).toEqual({ ok: true });
  });

  /**
   * Without this an endpoint anybody can find would grant subscriptions to
   * anybody who posts to it.
   */
  it('rejects a payload signed with the wrong secret', async () => {
    const header = await sign(payload, at, 'whsec_not_it');
    const r = await verifyWebhook(SECRET, payload, header, 300, NOW);
    expect(r).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects a payload that was altered after signing', async () => {
    const header = await sign(payload, at);
    const tampered = payload.replace('evt_1', 'evt_2');
    expect((await verifyWebhook(SECRET, tampered, header, 300, NOW)).ok).toBe(false);
  });

  /** A genuinely signed request must not be replayable forever. */
  it('rejects a signature older than the tolerance', async () => {
    const header = await sign(payload, at - 600);
    const r = await verifyWebhook(SECRET, payload, header, 300, NOW);
    expect(r).toEqual({ ok: false, reason: 'timestamp outside tolerance' });
  });

  it('rejects a header it cannot read', async () => {
    for (const header of ['', 'nonsense', 't=123', 'v1=abc']) {
      expect((await verifyWebhook(SECRET, payload, header, 300, NOW)).ok).toBe(false);
    }
  });
});

describe('reading an event', () => {
  it('takes the account id from a completed checkout', () => {
    const parsed = subscriptionFromEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'acc_1', customer: 'cus_1', subscription: 'sub_1' } },
    });
    expect(parsed).toMatchObject({
      accountId: 'acc_1', customerId: 'cus_1', subscriptionId: 'sub_1',
    });
    // No period end on a checkout event, which is why it gets read back.
    expect(parsed!.currentPeriodEnd).toBe(0);
  });

  it('reads status and period end off a subscription event', () => {
    const parsed = subscriptionFromEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1', customer: 'cus_1', status: 'active',
          cancel_at_period_end: true,
          metadata: { account_id: 'acc_1' },
          items: { data: [{ current_period_end: 1800000000, price: { id: 'price_x' } }] },
        },
      },
    });
    expect(parsed).toEqual({
      accountId: 'acc_1', customerId: 'cus_1', subscriptionId: 'sub_1',
      status: 'active', currentPeriodEnd: 1800000000, cancelAtPeriodEnd: true,
      plan: 'price_x',
    });
  });

  /**
   * Stripe moved the period end from the subscription onto the subscription
   * item. Reading only the old place yields zero, and zero means a cancelled
   * subscription loses access the moment it is cancelled instead of running to
   * the end of the period already paid for.
   */
  it('reads the period end off the item, where Stripe now puts it', () => {
    const parsed = subscriptionFromEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1', customer: 'cus_1', status: 'active',
          items: { data: [{ current_period_end: 1791677186, price: { id: 'price_x' } }] },
        },
      },
    });
    expect(parsed!.currentPeriodEnd).toBe(1791677186);
  });

  it('still reads it from the old place when an older API sends it there', () => {
    const parsed = subscriptionFromEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1', customer: 'cus_1', status: 'active',
          current_period_end: 1700000000,
          items: { data: [{ price: { id: 'price_x' } }] },
        },
      },
    });
    expect(parsed!.currentPeriodEnd).toBe(1700000000);
  });

  /**
   * Stripe sends many event types and will send new ones. An endpoint that
   * throws on one it does not recognise gets retried forever and eventually
   * disabled.
   */
  it('ignores an event it does not act on', () => {
    expect(subscriptionFromEvent({
      type: 'invoice.payment_succeeded', data: { object: { id: 'in_1' } },
    })).toBeNull();
  });

  it('survives an event missing the fields it wants', () => {
    const parsed = subscriptionFromEvent({
      type: 'customer.subscription.deleted', data: { object: {} },
    });
    expect(parsed).toMatchObject({ status: '', customerId: '', plan: '' });
  });
});
