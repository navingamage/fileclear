/**
 * Billing, through Stripe.
 *
 * Two rules shape everything here. Card details never touch this Worker: the
 * card is entered on Stripe's own page and what comes back is an identifier.
 * And Stripe is the record of what somebody is entitled to, not this database;
 * D1 holds a copy so the application can answer "is this account paid" without
 * a network call, and that copy is refreshed from webhooks rather than written
 * from the application's own opinion.
 *
 * That second rule matters more than it looks. A subscription can end for
 * reasons the application never sees: a card expires, a payment is disputed,
 * somebody cancels from an email receipt. If entitlement is decided by what
 * this database happened to record at checkout, all of those leave a paying
 * screen open to somebody who has stopped paying, and a cancelled customer
 * locked out before the period they paid for has run.
 */

export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  FC_PRICE_MONTHLY?: string;
  FC_PRICE_YEARLY?: string;
  FC_PUBLIC_ORIGIN?: string;
}

const API = 'https://api.stripe.com/v1';

/**
 * Stripe's API takes form encoding, including for nested fields, which is why
 * this flattens rather than posting JSON.
 */
function encode(params: Record<string, string | number | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.set(k, String(v));
  }
  return body.toString();
}

async function call<T>(
  env: StripeEnv, path: string, params?: Record<string, string | number | undefined>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!env.STRIPE_SECRET_KEY) return { ok: false, error: 'STRIPE_SECRET_KEY is not set' };

  const response = await fetch(`${API}/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(params ? { body: encode(params) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 200);
    try {
      message = (JSON.parse(text).error?.message as string) ?? message;
    } catch { /* the raw body is the best we have */ }
    return { ok: false, error: `${response.status} ${message}` };
  }
  return { ok: true, data: JSON.parse(text) as T };
}

// ------------------------------------------------------------- entitlement

/**
 * The statuses Stripe uses that mean somebody may keep using the product.
 *
 * `past_due` is deliberately included. A failed renewal is usually an expired
 * card rather than a decision to leave, Stripe retries for a while, and locking
 * the door on the first failure loses customers who were always going to pay.
 * `canceled` stays entitled until the period end, which is what the terms
 * promise, and that is handled by the date rather than the status.
 */
export const ENTITLING_STATUSES = ['active', 'trialing', 'past_due'];

export interface Subscription {
  status: string;
  /** Seconds since the epoch, as Stripe reports it. */
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  plan: string;
}

/**
 * Whether an account may use the paid screens.
 *
 * A cancelled subscription keeps working to the end of the period already paid
 * for, because that is what the terms promise and taking it away early would be
 * a refund question nobody wants to have.
 */
export function entitled(
  sub: Subscription | null, trialEndsAt: string | null, now: Date = new Date(),
  todayIso?: string,
): { allowed: boolean; reason: 'subscription' | 'trial' | 'none'; trialDaysLeft: number } {
  const seconds = Math.floor(now.getTime() / 1000);

  if (sub) {
    const withinPeriod = sub.currentPeriodEnd > seconds;
    if (ENTITLING_STATUSES.includes(sub.status)) {
      return { allowed: true, reason: 'subscription', trialDaysLeft: 0 };
    }
    // Cancelled, but paid up to a date that has not arrived.
    if (sub.status === 'canceled' && withinPeriod) {
      return { allowed: true, reason: 'subscription', trialDaysLeft: 0 };
    }
  }

  if (trialEndsAt) {
    // Compared as calendar dates rather than instants. A trial is a date
    // somebody was told, so "ten days left" on the fifteenth has to mean it
    // ends on the twenty fifth, not on the twenty sixth because the comparison
    // happened at noon. The caller passes the Toronto date, since that is the
    // clock every other deadline in this product runs on.
    const today = todayIso ?? now.toISOString().slice(0, 10);
    const left = Math.round(
      (Date.parse(`${trialEndsAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (left >= 0) return { allowed: true, reason: 'trial', trialDaysLeft: left };
  }

  return { allowed: false, reason: 'none', trialDaysLeft: 0 };
}

// --------------------------------------------------------------- checkout

interface CheckoutSession { id: string; url: string; }

/**
 * A Checkout session, which is the page the card is actually entered on.
 *
 * `client_reference_id` carries the account id through Stripe and back in the
 * webhook, which is what lets a payment be matched to an account without
 * trusting anything the browser sends back.
 */
export async function checkoutUrl(
  env: StripeEnv, accountId: string, email: string, plan: 'monthly' | 'yearly',
  customerId?: string,
): Promise<{ url: string } | { error: string }> {
  const price = plan === 'yearly' ? env.FC_PRICE_YEARLY : env.FC_PRICE_MONTHLY;
  if (!price) return { error: `no price configured for the ${plan} plan` };

  const origin = env.FC_PUBLIC_ORIGIN ?? 'https://fileclear.ca';
  const result = await call<CheckoutSession>(env, 'checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    client_reference_id: accountId,
    // An existing customer is reused so somebody who resubscribes does not end
    // up as two customers with one payment history each.
    ...(customerId ? { customer: customerId } : { customer_email: email }),
    success_url: `${origin}/billing?paid=1`,
    cancel_url: `${origin}/billing`,
    allow_promotion_codes: 'true',
    'subscription_data[metadata][account_id]': accountId,
  });

  return result.ok ? { url: result.data.url } : { error: result.error };
}

interface PortalSession { url: string; }

/**
 * Stripe's own billing portal, where a customer changes a card, downloads an
 * invoice or cancels.
 *
 * Building those screens would mean handling card details and proration rules,
 * and Stripe has already done it properly.
 */
export async function portalUrl(
  env: StripeEnv, customerId: string,
): Promise<{ url: string } | { error: string }> {
  const origin = env.FC_PUBLIC_ORIGIN ?? 'https://fileclear.ca';
  const result = await call<PortalSession>(env, 'billing_portal/sessions', {
    customer: customerId,
    return_url: `${origin}/billing`,
  });
  return result.ok ? { url: result.data.url } : { error: result.error };
}

// --------------------------------------------------------------- webhooks

/**
 * Stripe signs every webhook, and an unverified webhook endpoint is a way for
 * anyone who knows the URL to grant themselves a subscription.
 *
 * The signature covers the timestamp and the raw body together, so the body has
 * to be verified exactly as received. Parsing it first and re-serialising would
 * change the bytes and the signature would never match.
 */
export async function verifyWebhook(
  secret: string, payload: string, header: string, toleranceSeconds = 300,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=', 2) as [string, string]));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return { ok: false, reason: 'malformed signature header' };

  // Without this an old, genuinely signed request could be replayed forever.
  const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));

  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(expected, signature)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' };
}

/** Constant time, so a comparison cannot be used to guess a signature. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


/**
 * When the paid period ends.
 *
 * Stripe moved this from the subscription onto the subscription item. Reading
 * only the old place silently yields zero, and zero means a cancelled
 * subscription loses access the moment it is cancelled rather than running to
 * the end of the period already paid for, which is what the terms promise.
 * Both places are read so an older API version still works.
 */
function periodEnd(o: Record<string, unknown>): number {
  const top = Number(o.current_period_end ?? 0);
  if (top > 0) return top;
  const items = (o.items as { data?: { current_period_end?: number }[] } | undefined)?.data;
  return Number(items?.[0]?.current_period_end ?? 0);
}

export interface WebhookSubscription {
  accountId?: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  plan: string;
}

/**
 * The parts of an event this product acts on.
 *
 * Returns null for everything else rather than throwing. Stripe sends many
 * event types and will send new ones; an endpoint that errors on an event it
 * does not recognise gets retried forever and eventually disabled.
 */
export function subscriptionFromEvent(event: {
  type: string; data: { object: Record<string, unknown> };
}): WebhookSubscription | null {
  const o = event.data.object;

  if (event.type.startsWith('customer.subscription.')) {
    const items = (o.items as { data?: { price?: { id?: string } }[] } | undefined)?.data;
    return {
      accountId: (o.metadata as Record<string, string> | undefined)?.account_id,
      customerId: String(o.customer ?? ''),
      subscriptionId: String(o.id ?? ''),
      status: String(o.status ?? ''),
      currentPeriodEnd: periodEnd(o),
      cancelAtPeriodEnd: Boolean(o.cancel_at_period_end),
      plan: items?.[0]?.price?.id ?? '',
    };
  }

  // The first signal that a checkout succeeded, and the only event carrying
  // client_reference_id, which is how the account is identified the first time.
  if (event.type === 'checkout.session.completed') {
    return {
      accountId: o.client_reference_id ? String(o.client_reference_id) : undefined,
      customerId: String(o.customer ?? ''),
      subscriptionId: String(o.subscription ?? ''),
      status: 'active',
      currentPeriodEnd: 0,
      cancelAtPeriodEnd: false,
      plan: '',
    };
  }

  return null;
}

/**
 * Reads a subscription back from Stripe, which is the authority on it.
 *
 * Used only after a checkout event, which says a subscription exists without
 * saying what is in it. The live key is a restricted one without permission to
 * read subscriptions, so this fails there and the failure is logged rather than
 * swallowed: silence would look identical to a subscription that simply had
 * nothing to add.
 *
 * Nothing is lost when it fails. Stripe sends customer.subscription.created
 * moments later carrying the period end and the plan, and that fills in what
 * the checkout event could not.
 */
export async function fetchSubscription(
  env: StripeEnv, subscriptionId: string,
): Promise<WebhookSubscription | null> {
  const result = await call<Record<string, unknown>>(env, `subscriptions/${subscriptionId}`);
  if (!result.ok) {
    console.log(`could not read ${subscriptionId} back from Stripe: ${result.error}. `
      + 'The subscription webhook that follows will fill this in.');
    return null;
  }
  const o = result.data;
  const items = (o.items as { data?: { price?: { id?: string } }[] } | undefined)?.data;
  return {
    accountId: (o.metadata as Record<string, string> | undefined)?.account_id,
    customerId: String(o.customer ?? ''),
    subscriptionId: String(o.id ?? ''),
    status: String(o.status ?? ''),
    currentPeriodEnd: periodEnd(o),
    cancelAtPeriodEnd: Boolean(o.cancel_at_period_end),
    plan: items?.[0]?.price?.id ?? '',
  };
}
