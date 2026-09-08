/**
 * fileclear.antipodetech.com, permanently redirected to fileclear.ca.
 *
 * Every Antipode product has a hostname under antipodetech.com, and for the
 * products that own a domain of their own that hostname is a redirect rather
 * than a second copy of the pages. Two hostnames serving the same site is one
 * for a search engine to split ranking across, and one for a customer to
 * bookmark and later find stale.
 *
 * The path is carried across, so an old link to /support still lands on
 * /support rather than on the front page.
 */
export default {
  fetch(request: Request): Response {
    const from = new URL(request.url);
    const to = new URL(from.pathname + from.search, 'https://fileclear.ca');
    return Response.redirect(to.toString(), 301);
  },
};
