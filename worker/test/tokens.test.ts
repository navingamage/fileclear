import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every CSS custom property the application uses has to be defined in
 * site/brand/tokens.css, which is the one file the marketing pages and the app
 * both link.
 *
 * This exists because renaming the palette silently left `var(--accent-ink)`
 * behind in a button. An undefined custom property is not an error in CSS: the
 * declaration is simply dropped, so the button kept its shape and lost its text
 * colour, and nothing anywhere said so.
 */

const root = join(import.meta.dirname, '..', '..');
const tokens = readFileSync(join(root, 'site', 'brand', 'tokens.css'), 'utf8');
const views = readFileSync(join(root, 'worker', 'src', 'views.ts'), 'utf8');
const siteScript = readFileSync(join(root, 'Scripts', 'build-site.py'), 'utf8');

const defined = new Set(
  [...tokens.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!),
);
const used = (source: string) =>
  new Set([...source.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!));

describe('design tokens', () => {
  it('defines the palette in both schemes', () => {
    expect(defined.size).toBeGreaterThan(20);
    for (const core of ['--bg', '--ink', '--muted', '--line', '--brand',
      '--primary', '--danger', '--band', '--surface']) {
      expect(defined.has(core)).toBe(true);
    }
  });

  it('leaves no undefined token in the application', () => {
    const missing = [...used(views)].filter((t) => !defined.has(t));
    expect(missing).toEqual([]);
  });

  it('leaves no undefined token on the marketing pages', () => {
    const missing = [...used(siteScript)].filter((t) => !defined.has(t));
    expect(missing).toEqual([]);
  });

  /** Light stays white. It is a standing rule and it has been broken before. */
  it('keeps the light background pure white', () => {
    const lightBlock = tokens.slice(0, tokens.indexOf('@media'));
    expect(lightBlock).toMatch(/--bg:\s*#ffffff/i);
  });

  it('defines every token again for dark, so nothing falls back to the light value', () => {
    const dark = tokens.slice(tokens.indexOf('@media'));
    for (const core of ['--bg', '--ink', '--muted', '--line', '--brand',
      '--primary', '--danger', '--band', '--surface']) {
      expect(dark).toContain(`${core}:`);
    }
  });

  /**
   * Brand and danger are deliberately the same red now.
   *
   * That is normally a mistake, and it was forbidden here until the palette
   * moved to red. It works because the two never share a surface: the brand red
   * is a rule or a button on white, and the overdue red is a tinted row with
   * its own label. What must survive is a third colour for status that is not
   * the brand, otherwise "needs attention" and "this is our colour" become the
   * same signal and neither means anything.
   */
  it('keeps a status colour that is not the brand', () => {
    const brand = tokens.match(/--brand:\s*(#[0-9a-f]{6})/i)?.[1];
    const warn = tokens.match(/--warn:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(brand).toBeTruthy();
    expect(warn).toBeTruthy();
    expect(warn).not.toBe(brand);
  });

  it('gives danger its own tint rather than reusing a solid', () => {
    const danger = tokens.match(/--danger:\s*(#[0-9a-f]{6})/i)?.[1];
    const tint = tokens.match(/--danger-tint:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(danger).not.toBe(tint);
  });
});
