/**
 * FileClear for Mac and Windows.
 *
 * This is a shell around fileclear.ca rather than a second implementation of
 * the product, and that is the design rather than a shortcut.
 *
 * The rules are the thing being sold. Every rate, every deadline and every
 * threshold is a claim about the outside world that was true on the day it was
 * typed, and the whole architecture of the web application exists so that a
 * correction reaches every customer the next morning rather than only the ones
 * who happen to update. A desktop build that carried its own copy of the rules
 * would hand that back: somebody running last spring's version would be quietly
 * wrong about a rate that changed in January, and nothing on their screen would
 * say so. So the calculation stays on the server and the app is a window onto
 * it, which means a deploy reaches every desktop immediately.
 *
 * What the shell adds that a browser tab does not: an icon that is always
 * there, a dock badge carrying what is outstanding, native menus and
 * shortcuts, an honest offline screen, and an update mechanism for the shell
 * itself.
 *
 * Security. A window that loads a remote origin gets no Node integration and
 * full context isolation, and navigation is held to the origins this app has a
 * reason to be on. The alternative, a window that can be steered anywhere, is
 * a browser without any of a browser's protections.
 */

const {
  app, BrowserWindow, Menu, shell, dialog, nativeTheme, session,
} = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

/**
 * Overridable so a build can be pointed at a local Worker during development.
 * Not a user setting: an installed copy that can be aimed at another origin is
 * a phishing tool with the product's own icon on it.
 */
const ORIGIN = process.env.FILECLEAR_ORIGIN || 'https://fileclear.ca';

/**
 * Where the window is allowed to go.
 *
 * Stripe is on the list because checkout and the billing portal are hosted
 * pages the product sends people to on purpose, and bouncing them out to a
 * browser mid-payment loses the session they were signed into. Everything else
 * opens in the system browser, where the address bar is visible.
 */
const ALLOWED = [ORIGIN, 'https://checkout.stripe.com', 'https://billing.stripe.com'];

const isAllowed = (url) => {
  try {
    const u = new URL(url);
    return ALLOWED.some((a) => u.origin === new URL(a).origin);
  } catch {
    return false;
  }
};

/**
 * The marketing site's pages, which are never shown inside the app.
 *
 * The same Worker serves both, so the app can reach the website by any route
 * that leads to one of these paths: the header logo, a redirect after signing
 * out, a link in a footer. The front page goes to sign in, because somebody in
 * the app wanting "home" means the product. The rest are the company's pages
 * rather than the product's, and they open in the browser where they belong.
 */
const WEBSITE_PATHS = ['/support', '/privacy', '/terms', '/download'];

const onOrigin = (url) => {
  try { return new URL(url).origin === new URL(ORIGIN).origin; } catch { return false; }
};
const pathOf = (url) => {
  try { return new URL(url).pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/'; }
  catch { return ''; }
};
const isRoot = (url) => onOrigin(url) && pathOf(url) === '/';
const isWebsitePage = (url) => onOrigin(url) && WEBSITE_PATHS.includes(pathOf(url));

let win = null;

// ---------------------------------------------------------------- the window

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    // The site's own background, so a cold start is not a white flash against
    // a dark application.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14110d' : '#ffffff',
    // Inset on macOS so the window has no separate title strip above a page
    // that already has a header. preload.js pads that header out of the way of
    // the traffic lights, which otherwise sit on top of the logo.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Placed rather than left to the system, so the padding in preload.js is
    // measured against a known position instead of whatever macOS chooses for
    // this window size. The buttons are 12 points across, so they occupy y=14
    // to y=26 and the 30 points of header padding clears them.
    trafficLightPosition: { x: 14, y: 14 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // The version is passed in rather than read from disk by the preload.
      // A sandboxed preload may require('electron') and nothing else, so
      // require('../package.json') threw and took the whole script with it,
      // silently: no exposed API, and no window chrome fix either.
      additionalArguments: [`--fc-version=${app.getVersion()}`],
      // Both of these are the whole security posture of an app that loads a
      // remote origin. Neither is negotiable.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Shown once there is something to look at rather than as an empty frame.
  win.once('ready-to-show', () => win.show());

  /**
   * Straight to the product, never the marketing page.
   *
   * Somebody who installed the app has already been sold to; opening on "A CPA
   * charges $2,000 to $4,000 a year" and a Start free button is asking them to
   * make a decision they made when they downloaded it. /signin redirects to
   * the dashboard when there is already a session, so this is the sign in page
   * exactly once and the calendar every time after.
   */
  win.loadURL(`${ORIGIN}/signin`);

  // A link to CRA, to Corporations Canada or to any of the sources the product
  // cites belongs in the system browser. Those pages are the user's own
  // business and the address bar is part of reading them safely.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowed(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  /**
   * One rule for every way the window can be sent somewhere.
   *
   * will-navigate covers links and form posts. It does not cover a server
   * redirect, which Electron reports as will-redirect instead, and signing out
   * is exactly that: a form post answered with a redirect. Guarding only the
   * first let the second land on the marketing page, styled for a browser, in
   * an app window. did-navigate is the last net, for anything that arrives by
   * a route neither of the first two sees.
   */
  const steer = (event, url) => {
    if (isRoot(url)) {
      event.preventDefault();
      win.loadURL(`${ORIGIN}/signin`);
      return true;
    }
    if (isWebsitePage(url)) {
      event.preventDefault();
      shell.openExternal(url);
      return true;
    }
    if (isAllowed(url)) return false;
    event.preventDefault();
    shell.openExternal(url);
    return true;
  };

  win.webContents.on('will-navigate', steer);
  win.webContents.on('will-redirect', steer);
  win.webContents.on('did-navigate', (_event, url) => {
    if (isRoot(url) || isWebsitePage(url)) win.loadURL(`${ORIGIN}/signin`);
  });

  /**
   * Offline, said plainly.
   *
   * The default is Chromium's own error page, which offers to check the cables
   * and looks like the product broke. What is actually true is narrower and
   * worth saying: the deadlines are worked out on the server, so without a
   * connection there is nothing to show, and the email reminders still go out
   * regardless of whether this app is running.
   */
  win.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    // -3 is an aborted load, which happens on every ordinary redirect.
    if (!isMainFrame || code === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'), {
      query: { reason: description || String(code), target: url || ORIGIN },
    });
  });

  win.on('closed', () => { win = null; });
}

// ------------------------------------------------------------------- the menu

function go(pathname) {
  if (!win) return createWindow();
  win.loadURL(`${ORIGIN}${pathname}`);
}

function buildMenu() {
  const mac = process.platform === 'darwin';

  const template = [
    ...(mac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: '&File',
      submenu: [
        ...(mac ? [] : [
          { label: 'Check for Updates…', click: () => checkForUpdates(true) },
          { type: 'separator' },
        ]),
        mac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    /**
     * The sections, with the shortcuts a person who lives in this product will
     * want. The ordering is the ordering of the navigation bar, because two
     * different orders for the same seven things is worse than either.
     */
    {
      label: '&Go',
      submenu: [
        { label: 'Filings', accelerator: 'CmdOrCtrl+1', click: () => go('/dashboard') },
        { label: 'Books', accelerator: 'CmdOrCtrl+2', click: () => go('/books') },
        { label: 'HST', accelerator: 'CmdOrCtrl+3', click: () => go('/hst') },
        { label: 'Year end', accelerator: 'CmdOrCtrl+4', click: () => go('/year-end') },
        { label: 'Slips', accelerator: 'CmdOrCtrl+5', click: () => go('/slips') },
        { type: 'separator' },
        { label: 'Pay yourself', click: () => go('/compensation') },
        { label: 'Should you incorporate?', click: () => go('/incorporate') },
        { type: 'separator' },
        { label: 'Business details', click: () => go('/onboarding') },
        { label: 'Billing', click: () => go('/billing') },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Support', click: () => shell.openExternal(`${ORIGIN}/support`) },
        { label: 'Privacy', click: () => shell.openExternal(`${ORIGIN}/privacy`) },
        { label: 'Terms', click: () => shell.openExternal(`${ORIGIN}/terms`) },
        { type: 'separator' },
        {
          label: 'About the figures',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'About the figures',
            message: 'FileClear works out what you owe and when.',
            detail:
              'It is not certified by CRA and it does not transmit anything, so every '
              + 'figure is one to enter rather than one that has been filed.\n\n'
              + 'The rules and rates live on the server rather than inside this app, so '
              + 'a correction reaches you the next time you open it rather than the next '
              + 'time you update.\n\n'
              + `Version ${app.getVersion()}.`,
          }),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// -------------------------------------------------------------- the dock badge

/**
 * What is outstanding, on the icon.
 *
 * Asked for every half hour and on focus, which is often enough to be current
 * and rare enough to cost nothing. It carries no detail on purpose: a number on
 * an icon is a prompt to look rather than an answer, and a notification for
 * every deadline would duplicate the email that already arrives on the right
 * morning.
 *
 * A signed out app clears the badge rather than showing a zero. Zero means
 * nothing is due, which the app cannot know without a session, and a deadline
 * product implying "you are clear" when it simply cannot see is the one wrong
 * answer worth engineering against.
 */
const BADGE_INTERVAL_MS = 30 * 60 * 1000;

async function refreshBadge() {
  if (!win) return;
  try {
    const cookies = await session.defaultSession.cookies.get({ url: ORIGIN });
    const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const response = await fetch(`${ORIGIN}/api/summary`, {
      headers: header ? { Cookie: header } : {},
    });
    if (!response.ok) return setBadge(null);
    const summary = await response.json();
    if (!summary.signedIn) return setBadge(null);
    setBadge(summary.overdue + summary.dueWithin30Days, summary.overdue > 0);
  } catch {
    // Offline, or the server is having an afternoon. Leaving the last known
    // count in place is better than clearing it, because clearing it says
    // "nothing is due" and what is actually true is "we could not ask".
  }
}

function setBadge(count, urgent = false) {
  if (process.platform === 'darwin') {
    app.dock.setBadge(count ? String(count) : '');
  } else if (win) {
    // Windows has no numeric badge, so the taskbar overlay carries the state
    // that matters: something is late.
    win.setOverlayIcon(null, urgent ? `${count} outstanding` : '');
  }
}

// ---------------------------------------------------------------- the updater

/**
 * Updating the shell.
 *
 * The screens and the rules update on their own, because they come from the
 * server every time the window loads. What has to be shipped is this file: the
 * menu, the window, the update mechanism itself and whatever Electron's own
 * security fixes require. That is a rare release and a small download, and it
 * is installed on quit rather than interrupting somebody in the middle of a
 * return.
 *
 * The feed is the product's own domain rather than a GitHub release, because
 * the repository is private and the GitHub provider would need a token inside
 * every installed copy.
 */
function configureUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('update-downloaded', (info) => {
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 1,
      cancelId: 1,
      title: 'An update is ready',
      message: `FileClear ${info.version} has been downloaded.`,
      detail:
        'It will be installed the next time you quit. Restarting now takes a few '
        + 'seconds and nothing you have entered is held in this app, so there is '
        + 'nothing to lose by doing it later either.',
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    // Failing to check for an update is not a reason to interrupt anybody. The
    // app works; it is simply this copy of the shell that is behind.
    console.log(`update check failed: ${err && err.message}`);
  });
}

function checkForUpdates(fromMenu = false) {
  // A packaged app only. In development there is no update to find and the
  // check throws, which is noise rather than information.
  if (!app.isPackaged) {
    if (fromMenu && win) {
      dialog.showMessageBox(win, {
        type: 'info',
        message: 'Updates are only checked in an installed copy.',
        detail: 'This is a development build.',
      });
    }
    return;
  }

  autoUpdater.checkForUpdates().then((result) => {
    if (!fromMenu || !win) return;
    const available = result && result.updateInfo
      && result.updateInfo.version !== app.getVersion();
    if (!available) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Up to date',
        message: `FileClear ${app.getVersion()} is the current version.`,
        detail:
          'The deadlines and rates are not in this app: they come from fileclear.ca '
          + 'every time you open it, so those are already current whatever this says.',
      });
    }
  }).catch(() => { /* reported through the error handler above */ });
}

// ------------------------------------------------------------------ lifecycle

// One instance. A second copy would compete for the same session cookie and
// show two windows disagreeing about who is signed in.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    configureUpdates();
    buildMenu();
    createWindow();

    refreshBadge();
    setInterval(refreshBadge, BADGE_INTERVAL_MS);
    app.on('browser-window-focus', refreshBadge);

    // Not on the first paint. A check competing with the initial page load
    // makes the slowest moment of the application slower still.
    setTimeout(() => checkForUpdates(false), 15_000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // macOS keeps an application running with no windows; Windows and Linux do
  // not, and pretending otherwise leaves a process nobody can see.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
