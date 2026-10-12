/**
 * The headers every response the Worker renders carries, and the one script
 * its pages run.
 *
 * FileClear's pages hold a company's books and, on the slips screen, the SINs
 * that go into a T4 file, and until this module they went out with no
 * security headers at all. Any site could frame the filing screen under a
 * transparent layer and have a signed-in person click through it, and nothing
 * told a browser to keep the connection on HTTPS. TradeClear and Peaberry
 * have carried these from the start; this brings FileClear level.
 *
 * The policy allows scripts from this origin only, which is why the copy
 * buttons and the business switcher moved out of inline markup into APP_JS.
 * Two outside origins are named on purpose:
 *
 * - Google Fonts, which the page head loads its type from.
 * - Cloudflare Web Analytics, whose beacon is injected at the edge and posts
 *   back to /cdn-cgi/rum on this host, so it needs both the script origin and
 *   'self' in connect-src. Blocking it would quietly stop the visit counts.
 *
 * Stripe is a form target because the billing buttons post here and are
 * answered with a redirect to Checkout or the portal, and browsers apply
 * form-action to where a form's redirect lands as well as to its action.
 *
 * Files from site/ are served by the asset layer as they are and are not
 * touched here; the download page has an inline script of its own.
 */

export const CSP = [
  "default-src 'none'",
  "script-src 'self' https://static.cloudflareinsights.com",
  // Inline <style> is how every page is styled, and the desktop app's preload
  // adds one of its own for the title bar.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "upgrade-insecure-requests",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': [
    'accelerometer=()', 'camera=()', 'geolocation=()', 'gyroscope=()', 'magnetometer=()',
    'microphone=()', 'payment=()', 'usb=()',
  ].join(', '),
};

/**
 * Adds the headers to a response the Worker made.
 *
 * A rendered page with no caching instruction of its own is marked no-store:
 * most of them are somebody's books, and the sign-in pages lose nothing by it.
 */
export function harden(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  if ((out.headers.get('Content-Type') ?? '').startsWith('text/html') && !out.headers.has('Cache-Control')) {
    out.headers.set('Cache-Control', 'no-store');
  }
  return out;
}

/**
 * The pages' only script, served at /app.js.
 *
 * Everything it does is an improvement on something that already works
 * without it. The switcher has a Switch button for a browser with scripts off,
 * and every figure on a filing screen is plain text that can be selected.
 */
export const APP_JS = `(function () {
  /* The business switcher submits as soon as a business is picked. */
  document.querySelectorAll('select[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });

  /* Copy buttons on the filing screens, only where the clipboard is there. */
  if (!navigator.clipboard) return;
  document.querySelectorAll('.file-line .copy').forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      var el = b.parentNode.querySelector('.file-v');
      var done = function (label) {
        b.textContent = label;
        setTimeout(function () { b.textContent = 'Copy'; }, 1600);
      };
      navigator.clipboard.writeText(el.textContent).then(function () {
        done('Copied');
      }, function () {
        /* The clipboard can be refused, by a browser setting or a policy.
           Selecting the figure means one keystroke still copies it. */
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        done('Selected');
      });
    });
  });
}());
`;
