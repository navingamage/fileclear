/**
 * Deliberately almost empty.
 *
 * A preload script is the one place where a remote page can be handed
 * privileges the browser would never give it, so the safe amount to expose to a
 * page loaded over the network is as close to nothing as the app can manage.
 * FileClear's pages are server rendered and ask for nothing from the shell, so
 * what is exposed is the version, a flag saying this is the desktop app, and
 * the platform.
 *
 * If a future feature needs more, it gets one named channel with a validated
 * payload rather than a general bridge.
 */

const { contextBridge } = require('electron');

/**
 * The version arrives as a command line argument from the main process.
 *
 * It used to be read with require('../package.json'), which works in an
 * ordinary preload and throws in a sandboxed one: `sandbox: true` allows
 * require('electron') and nothing else. The throw took the whole script with
 * it and failed silently, so window.fileclear never existed and neither did
 * the chrome fix below. Nothing in the app depended on either, which is why it
 * went unnoticed until the traffic lights sat on the logo.
 */
const versionArg = process.argv.find((a) => a.startsWith('--fc-version=')) || '';

contextBridge.exposeInMainWorld('fileclear', {
  desktop: true,
  version: versionArg.slice('--fc-version='.length) || 'unknown',
  platform: process.platform,
});

/**
 * Get the page's own header out from under the traffic lights.
 *
 * The window uses titleBarStyle 'hiddenInset' so that there is no empty title
 * strip above a page that already has a header of its own. The cost is that
 * the content area starts at the very top of the window, and the close,
 * minimise and zoom buttons are drawn over whatever is there, which was the
 * FileClear logo.
 *
 * The padding is injected from here rather than served by the Worker because
 * only this side knows it is running in a window with inset controls. A
 * browser tab must not get it, and the same HTML serves both.
 *
 * It is applied to the app header and the marketing header alike, since a link
 * out to the terms or the privacy page lands on the second one.
 */
if (process.platform === 'darwin') {
  const PAD = `
    /* The traffic lights occupy roughly the first 70 points of the first 28.
       Padding the header down clears them without moving the page content,
       and -webkit-app-region makes the empty strip draggable, which is what a
       title bar is for. */
    header.app .app-in, header.nav .nav-in { padding-top: 30px; }
    header.app, header.nav { -webkit-app-region: drag; }
    header.app a, header.app button, header.app select, header.app input,
    header.nav a, header.nav button { -webkit-app-region: no-drag; }
  `;

  const apply = () => {
    if (document.getElementById('fc-desktop-chrome')) return;
    const style = document.createElement('style');
    style.id = 'fc-desktop-chrome';
    style.textContent = PAD;
    (document.head || document.documentElement).appendChild(style);
  };

  // DOMContentLoaded has usually not fired yet when a preload runs, but on a
  // fast local load it can have, so both paths are covered rather than
  // assuming one.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
}
