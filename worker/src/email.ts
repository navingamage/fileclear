/**
 * Transactional mail through ZeptoMail.
 *
 * Antipode's mail runs on Zoho, so ZeptoMail is the transactional side of an
 * arrangement that already exists rather than a new dependency. Kith sends the
 * same way.
 *
 * Nothing here is marketing. A reminder goes to the person who owns the
 * corporation it is about, about their own deadline, which is why it does not
 * carry the unsubscribe machinery a commercial message would need. If FileClear
 * ever sends something promotional it needs the CASL treatment, including a
 * physical mailing address, and that is a different function from this one.
 */

export interface MailEnv {
  ZEPTOMAIL_TOKEN?: string;
  FC_MAIL_FROM?: string;
  /**
   * Where a reply goes. Needed because reminders are sent from fileclear.ca,
   * which has no MX records and never will: it is a sending domain only. Hit
   * reply on a reminder without this and the answer bounces, which is a bad
   * way to treat somebody who is asking a question about their own deadline.
   */
  FC_MAIL_REPLY_TO?: string;
  FC_PUBLIC_ORIGIN?: string;
}

/** Splits `Name <addr@example.com>` into its parts. A bare address is fine. */
function address(value: string, fallbackName: string): { address: string; name: string } {
  const match = value.match(/^(.*?)\s*<(.+)>$/);
  return match
    ? { address: match[2]!, name: match[1]!.trim() || fallbackName }
    : { address: value, name: fallbackName };
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult { sent: boolean; reason?: string; }

/**
 * The Canadian data centre, not the default .com one.
 *
 * ZeptoMail runs separate data centres and a send token is only valid in the
 * one that issued it. Antipode's account is Canadian: the bounce record points
 * at cluster89.zeptomail.ca and Zoho Mail sits on zohocloud.ca. Posting this
 * token to api.zeptomail.com returns SERR_157, "Invalid API Token found",
 * which reads as a bad secret rather than a wrong address and is why this is
 * written down here.
 *
 * The failure would have been quiet. An unsendable reminder is recorded as
 * skipped and retried the next morning, so the sweep would have reported
 * itself healthy every day while never delivering anything.
 */
const ZEPTO_HOST = 'api.zeptomail.ca';
const ZEPTO_URL = `https://${ZEPTO_HOST}/v1.1/email`;

/**
 * Refuses rather than throws when it is not configured.
 *
 * A scheduled sweep that dies on a missing secret takes the whole run with it
 * and every other company's reminder along with it, so an unconfigured mailer
 * is a reported no-op.
 */
export async function send(env: MailEnv, mail: Mail): Promise<SendResult> {
  if (!env.ZEPTOMAIL_TOKEN) return { sent: false, reason: 'ZEPTOMAIL_TOKEN is not set' };
  if (!env.FC_MAIL_FROM) return { sent: false, reason: 'FC_MAIL_FROM is not set' };
  if (!mail.to.includes('@')) return { sent: false, reason: 'no recipient' };

  const from = address(env.FC_MAIL_FROM, 'FileClear');
  const replyTo = env.FC_MAIL_REPLY_TO
    ? [address(env.FC_MAIL_REPLY_TO, 'FileClear')]
    : undefined;

  const response = await fetch(ZEPTO_URL, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [{ email_address: { address: mail.to } }],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: mail.subject,
      textbody: mail.text,
      htmlbody: mail.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { sent: false, reason: `${response.status} ${detail.slice(0, 200)}` };
  }
  return { sent: true };
}

// ------------------------------------------------------------------ the mail

export interface ReminderItem {
  title: string;
  form: string;
  due: string;
  daysAway: number;
  authority: string;
  penalty: string;
}

const escape = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The brand, inlined.
 *
 * A mail client strips <style> and knows nothing about CSS custom properties,
 * so tokens.css cannot reach here and these are hand copied from it. They were
 * left behind on the palette FileClear used before the redesign, which is how a
 * reminder ended up arriving in green from a red product. Copied values drift;
 * the defence is keeping them in one place and naming where they came from.
 */
const C = {
  ground: '#f1f5f7',   // --band
  card:   '#ffffff',   // --surface
  ink:    '#0b0d0f',   // --ink
  body:   '#333c45',   // --ink-2
  muted:  '#5c6773',   // --muted
  line:   '#dde4e9',   // --line
  brand:  '#c8102e',   // --brand
};

const SANS = '"IBM Plex Sans",system-ui,-apple-system,sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,Menlo,monospace';

/** One card on one ground, so every FileClear mail is recognisably the same. */
function wrapper(inner: string, footnote: string): string {
  return `<!doctype html><html><body style="margin:0;background:${C.ground};padding:28px 16px">
<div style="max-width:560px;margin:0 auto;background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:28px">
${inner}
  <p style="margin:22px 0 0;font:400 12px ${SANS};color:${C.muted};line-height:1.5">${footnote}</p>
</div></body></html>`;
}

/** The dark pill used for the one action in a message. */
const button = (href: string, label: string): string =>
  `<a href="${escape(href)}" style="display:inline-block;background:${C.ink};color:#fff;`
  + `text-decoration:none;font:600 15px ${SANS};padding:12px 22px;border-radius:6px">${label}</a>`;

const DISCLAIMER =
  'FileClear works out dates and does not file anything for you. Every date links to the '
  + 'authority that publishes it, and that authority is the one to check before you rely on it.';

export function formatDue(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function when(days: number): string {
  if (days < 0) return `${-days} days overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days`;
}

/**
 * The subject names the nearest deadline rather than saying "you have
 * reminders", because the subject line is the whole message for most people.
 */
export function reminderMail(
  companyName: string, items: ReminderItem[], origin: string,
): Omit<Mail, 'to'> {
  const soonest = items[0]!;
  const subject = items.length === 1
    ? `${soonest.title} ${when(soonest.daysAway)}`
    : `${soonest.title} ${when(soonest.daysAway)}, and ${items.length - 1} more`;

  const lines = items.map((i) =>
    `  ${formatDue(i.due)}  ${i.title} (${i.form}), ${when(i.daysAway)}\n`
    + `      ${i.authority}. If it is late: ${i.penalty}`).join('\n\n');

  const text =
    `${companyName}\n\n`
    + `${items.length === 1 ? 'One filing is' : `${items.length} filings are`} coming up.\n\n`
    + `${lines}\n\n`
    + `Your full calendar: ${origin}/dashboard\n\n`
    + 'FileClear works out dates and does not file anything for you. Every date links\n'
    + 'to the authority that publishes it, and that authority is the one to check.\n';

  const rows = items.map((i) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${C.line};vertical-align:top;white-space:nowrap">
        <span style="font:500 13px ${MONO};color:${C.muted};font-variant-numeric:tabular-nums">${escape(formatDue(i.due))}</span><br>
        <span style="font:600 13px ${SANS};color:${i.daysAway <= 3 ? C.brand : C.muted}">${escape(when(i.daysAway))}</span>
      </td>
      <td style="padding:12px 0 12px 18px;border-bottom:1px solid ${C.line}">
        <b style="font:600 15px ${SANS};color:${C.ink};letter-spacing:-.01em">${escape(i.title)}</b>
        <span style="font:500 12px ${MONO};color:${C.muted}"> ${escape(i.form)}</span><br>
        <span style="font:400 13px ${SANS};color:${C.body}">If it is late: ${escape(i.penalty)}</span>
      </td>
    </tr>`).join('');

  const html = wrapper(`
  <p style="margin:0 0 6px;font:600 20px ${SANS};color:${C.ink};letter-spacing:-.02em">${escape(companyName)}</p>
  <p style="margin:0 0 20px;font:400 15px ${SANS};color:${C.muted}">
    ${items.length === 1 ? 'One filing is' : `${items.length} filings are`} coming up.</p>
  <table style="width:100%;border-collapse:collapse">${rows}</table>
  <p style="margin:24px 0 0">${button(`${origin}/dashboard`, 'See your calendar')}</p>`, DISCLAIMER);

  return { subject, text, html };
}

// ------------------------------------------------------------------ welcome

/**
 * Sent the moment an account is created.
 *
 * It confirms the address works, which is the only proof either side has that
 * reminders will ever arrive. A product whose whole value is an email that
 * turns up on the right morning cannot wait until the first deadline to
 * discover the address was mistyped.
 *
 * It is deliberately not a verification link. Nothing is gated on clicking it,
 * because an unverified account here can only reach its own filing calendar,
 * and a link that must be clicked before the product works is a wall in front
 * of somebody who has just decided to try it.
 */
export function welcomeMail(email: string, origin: string): Omit<Mail, 'to'> {
  const subject = 'Your FileClear account is ready';

  const text =
    'Your FileClear account is ready.\n\n'
    + `Signed up as ${email}.\n\n`
    + 'Next: tell FileClear where you incorporated and when your year ends. Every\n'
    + 'answer changes which filings exist for you, and the calendar is built from\n'
    + 'those answers rather than from a template.\n\n'
    + `Set up your company: ${origin}/onboarding\n\n`
    + 'Reminders arrive in the morning, before a window closes rather than after.\n'
    + 'If this was not you, reply to this message and we will remove the account.\n';

  const html = wrapper(`
  <p style="margin:0 0 6px;font:600 20px ${SANS};color:${C.ink};letter-spacing:-.02em">Your account is ready</p>
  <p style="margin:0 0 18px;font:400 15px ${SANS};color:${C.muted}">Signed up as
    <span style="font:500 14px ${MONO};color:${C.body}">${escape(email)}</span>.</p>
  <p style="margin:0 0 20px;font:400 15px ${SANS};color:${C.body};line-height:1.55">
    Next, tell FileClear where you incorporated and when your year ends. Every answer
    changes which filings exist for you, so the calendar is built from those answers
    rather than from a template.</p>
  <p style="margin:0 0 0">${button(`${origin}/onboarding`, 'Set up your company')}</p>`,
    'Reminders arrive in the morning, before a window closes rather than after. '
    + 'If this was not you, reply to this message and we will remove the account.');

  return { subject, text, html };
}
