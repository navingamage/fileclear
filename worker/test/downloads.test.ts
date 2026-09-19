import { describe, expect, it } from 'vitest';
import { serveDownload, releaseInfo } from '../src/downloads';

/**
 * The update feed, and the one rule about it that matters.
 *
 * A manifest cached hard is an app that keeps offering a version which has
 * been superseded, for as long as that cache lives, with nothing to say so.
 * An installer cached briefly is a large file fetched from the origin over and
 * over for no reason. The two need opposite answers and the difference is one
 * regex, which is exactly the kind of thing that gets inverted in an edit.
 */

/** Enough of an R2 bucket to answer a get. */
function bucket(objects: Record<string, string>) {
  return {
    async get(key: string) {
      if (!(key in objects)) return null;
      const body = objects[key]!;
      return {
        body,
        size: body.length,
        httpEtag: `"${key}"`,
        range: undefined,
        writeHttpMetadata() { /* nothing stored in this fake */ },
      };
    },
  } as unknown as R2Bucket;
}

const FEED = 'version: 1.2.0\n';
const env = () => ({
  DOWNLOADS: bucket({
    'latest-mac.yml': FEED,
    'latest.yml': FEED,
    'FileClear-1.2.0-arm64.dmg': 'not really a disk image',
    'release.json': '{"version":"1.2.0"}',
  }),
});

const get = (key: string) =>
  serveDownload(new Request(`https://fileclear.ca/download/${key}`), env(), key);

describe('caching', () => {
  it('holds the manifests to five minutes', async () => {
    for (const name of ['latest-mac.yml', 'latest.yml']) {
      const r = await get(name);
      expect(r.status).toBe(200);
      expect(r.headers.get('Cache-Control')).toBe('public, max-age=300, must-revalidate');
    }
  });

  /**
   * A released version number never points at different bytes than it did
   * yesterday, so the installer is as cacheable as anything gets.
   */
  it('caches an installer for a year', async () => {
    const r = await get('FileClear-1.2.0-arm64.dmg');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('never gives an installer the manifest cache policy, or the reverse', async () => {
    const feed = (await get('latest.yml')).headers.get('Cache-Control')!;
    const dmg = (await get('FileClear-1.2.0-arm64.dmg')).headers.get('Cache-Control')!;
    expect(feed).not.toBe(dmg);
    expect(feed).not.toContain('immutable');
    expect(dmg).not.toContain('must-revalidate');
  });
});

describe('what is served', () => {
  it('names the type so a browser does not guess', async () => {
    expect((await get('latest.yml')).headers.get('Content-Type'))
      .toBe('text/yaml; charset=utf-8');
    expect((await get('FileClear-1.2.0-arm64.dmg')).headers.get('Content-Type'))
      .toBe('application/x-apple-diskimage');
  });

  /** So the download keeps its own name rather than the last path segment. */
  it('attaches an installer with its filename', async () => {
    const r = await get('FileClear-1.2.0-arm64.dmg');
    expect(r.headers.get('Content-Disposition')).toContain('FileClear-1.2.0-arm64.dmg');
  });

  it('advertises range support, which is how a failed update resumes', async () => {
    expect((await get('latest.yml')).headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('is a 404 for something that is not there', async () => {
    expect((await get('FileClear-9.9.9.dmg')).status).toBe(404);
  });
});

describe('what cannot be asked for', () => {
  it('refuses traversal and anything with a path in it', async () => {
    for (const key of ['../wrangler.toml', 'a/b.dmg', '..%2Fsecret', '.env']) {
      expect((await get(key)).status, key).toBe(404);
    }
  });
});

describe('with no bucket bound', () => {
  /**
   * 503 rather than 404. "Not found" would tell somebody the release is
   * missing when what is actually true is that this deployment cannot look.
   */
  it('says it is not configured', async () => {
    const r = await serveDownload(
      new Request('https://fileclear.ca/download/latest.yml'), {}, 'latest.yml');
    expect(r.status).toBe(503);
  });
});

describe('the release manifest the download page reads', () => {
  it('serves it when something has been released', async () => {
    const r = await releaseInfo(env());
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  });

  /**
   * 404 rather than an invented shape, so the page can say "not published yet"
   * instead of rendering two buttons that go nowhere. An empty answer dressed
   * up as a successful one is how a download button ends up pointing at
   * nothing.
   */
  it('is a 404 before the first release rather than an empty success', async () => {
    const r = await releaseInfo({ DOWNLOADS: bucket({}) });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ released: false });
  });
});
