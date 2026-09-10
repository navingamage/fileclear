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
      <td style="padding:12px 0;border-bottom:1px solid #e6ebe8;vertical-align:top;white-space:nowrap">
        <span style="font:500 13px ui-monospace,Menlo,monospace;color:#61706a">${escape(formatDue(i.due))}</span><br>
        <span style="font:600 13px system-ui;color:${i.daysAway <= 3 ? '#b42318' : '#61706a'}">${escape(when(i.daysAway))}</span>
      </td>
      <td style="padding:12px 0 12px 18px;border-bottom:1px solid #e6ebe8">
        <b style="font:700 15px system-ui;color:#0d1210">${escape(i.title)}</b>
        <span style="font:500 12px ui-monospace,Menlo,monospace;color:#61706a"> ${escape(i.form)}</span><br>
        <span style="font:400 13px system-ui;color:#37423d">If it is late: ${escape(i.penalty)}</span>
      </td>
    </tr>`).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f2f6f4;padding:28px 16px">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dde5e1;border-radius:16px;padding:28px">
  <p style="margin:0 0 6px;font:700 20px system-ui;color:#0d1210;letter-spacing:-.02em">${escape(companyName)}</p>
  <p style="margin:0 0 20px;font:400 15px system-ui;color:#61706a">
    ${items.length === 1 ? 'One filing is' : `${items.length} filings are`} coming up.</p>
  <table style="width:100%;border-collapse:collapse">${rows}</table>
  <p style="margin:24px 0 0">
    <a href="${escape(origin)}/dashboard"
       style="display:inline-block;background:#0d1210;color:#fff;text-decoration:none;
              font:600 15px system-ui;padding:12px 22px;border-radius:999px">See your calendar</a>
  </p>
  <p style="margin:22px 0 0;font:400 12px system-ui;color:#61706a;line-height:1.5">
    FileClear works out dates and does not file anything for you. Every date links to the
    authority that publishes it, and that authority is the one to check before you rely on it.
  </p>
</div></body></html>`;

  return { subject, text, html };
}
