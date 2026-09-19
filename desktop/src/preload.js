/**
 * Deliberately almost empty.
 *
 * A preload script is the one place where a remote page can be handed
 * privileges the browser would never give it, so the safe amount to expose to a
 * page loaded over the network is as close to nothing as the app can manage.
 * FileClear's pages are server rendered and ask for nothing from the shell, so
 * the answer here is: the version, and a flag saying this is the desktop app at
 * all, in case a page ever wants to word something differently.
 *
 * If a future feature needs more, it gets one named channel with a validated
 * payload rather than a general bridge.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('fileclear', {
  desktop: true,
  version: process.env.npm_package_version || require('../package.json').version,
  platform: process.platform,
});
