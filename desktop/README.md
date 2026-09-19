# FileClear for Mac and Windows

A shell around `fileclear.ca`, not a second implementation of the product.

That is the design rather than a shortcut, and the reason is the thing being
sold. Every rate, every deadline and every threshold in FileClear is a claim
about the outside world that was true on the day it was typed, and rates move
every January. The whole architecture of the web application exists so that a
correction reaches every customer the next morning rather than only the ones
who happen to update.

A desktop build carrying its own copy of the rules would hand that back.
Somebody still running last spring's version would be quietly wrong about a
rate that changed, and nothing on their screen would say so. So the calculation
stays on the server and the app is a window onto it, which means a deploy
reaches every desktop immediately with nothing to install.

What the shell adds that a browser tab does not: an icon that is always there
with the outstanding count on it, native menus and shortcuts, links out to CRA
and the registries opening in the user's own browser where the address bar is
visible, an honest offline screen, and an update mechanism for the shell
itself.

## Running it

```
cd desktop
npm install
npm start
```

Against a local Worker:

```
FILECLEAR_ORIGIN=http://localhost:8787 npm start
```

`FILECLEAR_ORIGIN` is an environment variable rather than a setting on purpose.
An installed copy that a user can aim at another origin is a phishing tool with
the product's own icon on it.

## Building

```
npm run build:mac
npm run build:win
```

`dist/` gets the installers, the zips electron-updater downloads, and the
`latest*.yml` manifests that are the update feed.

The icon comes from `build/icon.png`, which `Scripts/render-icons.py` renders
from `site/brand/mark.svg` along with every icon the website uses. Do not edit
it by hand; it will go out of step with the mark the next time anybody runs the
script.

## Releasing

Tag it. `.github/workflows/desktop.yml` builds both platforms and uploads to R2.

```
cd desktop && npm version 1.1.0 --no-git-tag-version
git commit -am "Desktop 1.1.0" && git tag desktop-v1.1.0
git push && git push --tags
```

The tag is the version. Nothing else decides it, so the number in
`package.json`, the number in the feed and the number a user sees are the same
number by construction.

Publishing is a separate job that runs after both platforms have built, so the
feed never moves for one platform while the other is still building. Within
that job the installers upload before the manifests, because an app that reads
a manifest naming a file that has not finished uploading fails its update, and
on Windows can leave a half written install behind.

## Where updates come from

`https://fileclear.ca/download/`, served by the Worker out of an R2 bucket
(`worker/src/downloads.ts`), with electron-updater's generic provider.

Not GitHub releases, for two reasons. The repository is private, so
electron-updater's GitHub provider would need a token shipped inside every copy
of the app, which is a credential handed to everybody who downloads it. And an
installer should come from the product's own domain: one fetched from a
personal GitHub account is the shape of a thing a person should not run.

The one caching rule that matters: `latest.yml` and `latest-mac.yml` are the
feed and are cached for five minutes. The installers are immutable, because a
released version number never points at different bytes than it did yesterday,
so they are cached for a year.

## Code signing, and what is missing

**An unsigned build is not shippable.** macOS refuses to open it at all on any
machine but the one that built it, and Windows SmartScreen warns on download
and again on first run. The workflow still produces unsigned builds and labels
them as such in the run summary, because a build that fails outright at the
last step is what tempts somebody into shipping one anyway.

Two things are needed and neither exists yet.

### macOS: a Developer ID Application certificate

Antipode has an Apple Developer Program membership, but the only certificate on
the build machine is an **Apple Development** one, which signs an app for
running on your own devices and nothing else. Distribution outside the App
Store needs a **Developer ID Application** certificate. It costs nothing beyond
the membership already held.

Create it in Xcode under Settings, Accounts, Manage Certificates, or at
developer.apple.com under Certificates. Then export it from Keychain Access as
a `.p12` with a password, and add both to the repository's Actions secrets:

| Secret | What it is |
| --- | --- |
| `MAC_CERT_P12` | the `.p12`, base64 encoded |
| `MAC_CERT_PASSWORD` | the password set when exporting it |

```
base64 -i DeveloperID.p12 | pbcopy
```

Notarisation, which is separate from signing and also required, reuses the App
Store Connect API key that already exists for the iOS work:

| Secret | Where it comes from |
| --- | --- |
| `ASC_KEY_P8` | the `.p8` key file, base64 encoded |
| `ASC_KEY_ID` | `ASC_KEY_ID` in `load-secrets.sh` |
| `ASC_ISSUER_ID` | `ASC_ISSUER_ID` in `load-secrets.sh` |

An API key is used rather than an Apple ID and an app specific password,
because a password in a secret is a password somebody has to rotate by hand.

### Windows: a code signing certificate

There is no certificate and this one costs money. An OV certificate is roughly
$200 to $400 a year and still shows a SmartScreen warning until the publisher
builds reputation over a few hundred installs. An EV certificate is more, needs
a hardware token or a cloud HSM, and carries SmartScreen reputation
immediately.

Azure Trusted Signing is the option worth pricing first: it is a few dollars a
month, it is EV-grade for SmartScreen purposes, and it needs no token to be
plugged into a build machine, which is what makes an EV certificate awkward in
CI.

| Secret | What it is |
| --- | --- |
| `WIN_CERT_PFX` | the `.pfx`, base64 encoded |
| `WIN_CERT_PASSWORD` | its password |

Until then the Windows build works and users meet "Windows protected your PC"
with a "More info, Run anyway" underneath. That is a real cost in installs and
is worth fixing before the app is promoted anywhere.

### Publishing

| Secret | What it is |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the `claude-integration` account token |
| `CLOUDFLARE_ACCOUNT_ID` | the Antipode account id |

Both are in the Keychain: `source ~/.config/antipode/load-secrets.sh`.

## Security posture

A window that loads a remote origin gets no Node integration, full context
isolation and a sandboxed renderer. Navigation is held to `fileclear.ca` and to
Stripe's hosted checkout and billing pages, which are places the product sends
people on purpose; everything else opens in the system browser.

`src/preload.js` is almost empty, and deliberately. A preload script is the one
place a remote page can be handed privileges a browser would never give it, so
the safe amount to expose to a page loaded over the network is as close to
nothing as the app can manage. It exposes the version and a flag saying this is
the desktop app. Anything more gets one named channel with a validated payload
rather than a general bridge.

## The dock badge

`/api/summary` gives the app what is outstanding, asked for every half hour and
on focus. It carries no filing detail: a number on an icon is a prompt to look
rather than an answer, and a notification for every deadline would duplicate
the email that already arrives on the right morning.

A signed out app clears the badge rather than showing a zero. Zero means
nothing is due, which the app cannot know without a session, and a deadline
product implying "you are clear" when it simply cannot see is the one wrong
answer worth engineering against. When the request fails outright the last
known count is left alone, for the same reason.
