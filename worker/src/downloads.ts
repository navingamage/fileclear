/**
 * The desktop builds, and the feed the desktop app updates itself from.
 *
 * Two reasons this is served from the application rather than from GitHub
 * releases. The repository is private, so electron-updater's GitHub provider
 * would need a token shipped inside every copy of the app, which is a
 * credential handed to everybody who downloads it. And a download should come
 * from the product's own domain: an installer fetched from a personal GitHub
 * account is the shape of something a person should not run.
 *
 * So the artefacts live in R2 and are served here, and the app is built with
 * electron-updater's generic provider pointed at this path. Nothing is secret:
 * these are public files by design, and the protection against a tampered
 * build is the code signature on it rather than an access control on the
 * bucket.
 *
 * The one rule that matters is about caching. `latest.yml` and `latest-mac.yml`
 * are the feed: cache them hard and an app keeps offering a version that has
 * been superseded, for as long as the cache lives. The installers themselves
 * are immutable, because a version number never points at two different files,
 * so those can be cached for as long as anything can be.
 */

export interface DownloadsEnv {
  DOWNLOADS?: R2Bucket;
}

/** The manifests electron-updater reads, which must never be cached long. */
const FEED = /^(latest|latest-mac|latest-linux)(-[a-z0-9]+)?\.yml$/;

/**
 * An installer or a delta, which is immutable: a released version number never
 * points at different bytes than it did yesterday.
 */
const IMMUTABLE = /\.(dmg|zip|exe|blockmap|AppImage|deb)$/;

function contentType(key: string): string {
  if (key.endsWith('.yml')) return 'text/yaml; charset=utf-8';
  if (key.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (key.endsWith('.zip')) return 'application/zip';
  if (key.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (key.endsWith('.blockmap')) return 'application/octet-stream';
  if (key.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function cacheFor(key: string): string {
  const name = key.split('/').pop() ?? key;
  if (FEED.test(name)) return 'public, max-age=300, must-revalidate';
  if (IMMUTABLE.test(name)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=300';
}

/**
 * Serve one file out of the bucket.
 *
 * Range requests are honoured because electron-updater resumes a partial
 * download rather than starting again, and a 200 in answer to a Range header
 * makes it start again on every retry. On a 120MB installer over a poor
 * connection that is the difference between an update that completes and one
 * that never does.
 */
export async function serveDownload(
  request: Request, env: DownloadsEnv, key: string,
): Promise<Response> {
  if (!env.DOWNLOADS) return new Response('downloads are not configured', { status: 503 });

  // No traversal, no absolute keys, no dotfiles. The bucket holds release
  // artefacts and nothing else, but the check costs nothing.
  if (!/^[A-Za-z0-9._-]+$/.test(key) || key.startsWith('.')) {
    return new Response('not found', { status: 404 });
  }

  const range = request.headers.get('range');
  const object = await env.DOWNLOADS.get(key, range ? { range: request.headers } : undefined);
  if (!object) return new Response('not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', contentType(key));
  headers.set('Cache-Control', cacheFor(key));
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  // The installer keeps its own name when saved, rather than inheriting the
  // last path segment of whatever URL the browser thinks it is on.
  if (IMMUTABLE.test(key)) {
    headers.set('Content-Disposition', `attachment; filename="${key}"`);
  }

  if (object.range && 'offset' in object.range) {
    const start = object.range.offset ?? 0;
    const length = object.range.length ?? (object.size - start);
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
}

export interface ReleaseInfo {
  version: string;
  releasedOn: string;
  mac?: { arm64?: string; x64?: string };
  windows?: string;
}

/**
 * What the download page asks for, so the version is not typed into the HTML.
 *
 * Written by the release workflow beside the artefacts. A page that hard codes
 * "version 1.2.0" is a page somebody has to remember to edit, and the failure
 * is silent: the link still works and points at something older than the
 * product.
 *
 * Returns 404 rather than an invented shape when nothing has been released, so
 * the page can say "not yet available" instead of offering a broken link. An
 * empty answer dressed up as a successful one is how a download button ends up
 * pointing at nothing.
 */
export async function releaseInfo(env: DownloadsEnv): Promise<Response> {
  if (!env.DOWNLOADS) return new Response('not configured', { status: 503 });
  const object = await env.DOWNLOADS.get('release.json');
  if (!object) return new Response('{"released":false}', {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}
