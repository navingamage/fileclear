#!/usr/bin/env bash
#
# Build, sign, notarise and publish the Mac app, from this Mac.
#
#   Scripts/release-mac.sh 1.0.0
#   Scripts/release-mac.sh 1.0.0 --dry-run     build and notarise, publish nothing
#
# Why this is not a GitHub workflow.
#
# macOS runners bill at ten times the rate of Linux on a private repository, so
# a five minute build spends fifty minutes of a two thousand minute allowance.
# Three or four releases a month is most of the budget for something this
# machine does in ninety seconds, for nothing, with the signing certificate
# already in its Keychain and no need to export it as a base64 secret at all.
#
# The workflow is still there for when Windows joins, because that genuinely
# cannot be built here. Until then this is the release.
#
# Nothing here prints a credential. The notarisation key is read from the path
# load-secrets.sh exports; the Cloudflare token is read from the Keychain the
# same way and never appears in an argument.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
VERSION="${1:-}"
DRY_RUN=false
[ "${2:-}" = "--dry-run" ] && DRY_RUN=true

if [ -z "$VERSION" ]; then
  echo "usage: Scripts/release-mac.sh <version> [--dry-run]" >&2
  echo "   eg: Scripts/release-mac.sh 1.0.0" >&2
  exit 2
fi
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "version should look like 1.0.0" >&2
  exit 2
fi

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# --------------------------------------------------------------- preflight
#
# Everything that can be checked before spending two minutes on a build is
# checked before spending two minutes on a build.

say "Checking the tree"
if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree is not clean. A release should be a commit you can point at." >&2
  git status --short >&2
  exit 1
fi

# The generated site is committed, so it can fall behind its generator. That
# check used to live in CI; with CI unavailable it lives here, because a
# release is the moment it matters most.
say "Checking the generated site is current"
python3 Scripts/build-site.py > /dev/null
if ! git diff --quiet -- site; then
  echo "site/ does not match Scripts/build-site.py. Commit the regenerated HTML first." >&2
  git diff --stat -- site >&2
  git checkout -- site
  exit 1
fi
echo "  site/ is current"

say "Checking the worker still passes"
npm --prefix worker run typecheck > /dev/null
npm --prefix worker test 2>&1 | tail -3

say "Checking credentials"
# shellcheck disable=SC1090
source ~/.config/antipode/load-secrets.sh > /dev/null 2>&1 || true
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "no Cloudflare token. source ~/.config/antipode/load-secrets.sh" >&2; exit 1; }
echo "  Cloudflare: loaded"

IDENTITY="$(security find-identity -v -p codesigning \
  | grep -o 'Developer ID Application: [^"]*' | head -1 || true)"
if [ -n "$IDENTITY" ]; then
  echo "  signing as: $IDENTITY"
else
  echo "  no Developer ID Application certificate in the Keychain."
  echo "  See desktop/README.md. An unsigned build cannot be published:"
  echo "  macOS refuses to open it anywhere but the machine that made it."
  $DRY_RUN || exit 1
fi

NOTARIZE=false
if [ -n "${ASC_KEY_PATH:-}" ] && [ -f "${ASC_KEY_PATH}" ] && [ -n "$IDENTITY" ]; then
  NOTARIZE=true
  export APPLE_API_KEY="$ASC_KEY_PATH"
  export APPLE_API_KEY_ID="$ASC_KEY_ID"
  export APPLE_API_ISSUER="$ASC_ISSUER_ID"
  echo "  notarisation: on"
else
  echo "  notarisation: off"
fi

# ------------------------------------------------------------------ build

say "Building $VERSION"
cd desktop
npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null
rm -rf dist

if $NOTARIZE; then
  npx electron-builder --mac --publish never --config.mac.notarize=true
else
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --publish never
fi

cd dist
say "Built"
ls -1 *.dmg *.zip latest-mac.yml 2>/dev/null | sed 's/^/  /'

# The check that catches a build which said it signed and did not. Gatekeeper
# is the thing a user meets, so ask Gatekeeper rather than asking codesign
# whether a signature exists.
if [ -n "$IDENTITY" ]; then
  say "Checking what a user's Mac will make of it"
  APP="$(ls -d ../dist/mac-arm64/*.app 2>/dev/null | head -1 || ls -d mac-arm64/*.app | head -1)"
  codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | sed 's/^/  /'
  spctl --assess --type execute --verbose=2 "$APP" 2>&1 | sed 's/^/  /' || {
    echo "  Gatekeeper rejected the app. Do not publish this." >&2
    exit 1
  }
fi

if $DRY_RUN; then
  say "Dry run: built and verified, nothing published"
  echo "  artefacts in desktop/dist/"
  exit 0
fi

# ---------------------------------------------------------------- publish

say "Publishing to R2"
put() { npx --yes wrangler@4 r2 object put "fileclear-releases/$1" --file "$1" --remote > /dev/null && echo "  $1"; }

# Installers before the manifest. An app that reads a manifest naming a file
# which has not finished uploading fails its update.
for f in *.dmg *.zip *.blockmap; do [ -e "$f" ] && put "$f"; done

MAC_ARM="$(ls *arm64*.dmg | head -1)"
MAC_X64="$(ls *.dmg | grep -v arm64 | head -1)"
cat > release.json <<JSON
{
  "version": "$VERSION",
  "releasedOn": "$(date -u +%Y-%m-%d)",
  "signed": $([ -n "$IDENTITY" ] && echo true || echo false),
  "notarized": $NOTARIZE,
  "mac": { "arm64": "$MAC_ARM", "x64": "$MAC_X64" },
  "windows": null
}
JSON
put release.json
put latest-mac.yml

# ------------------------------------------------------------------ verify
#
# Ask the live site rather than trusting the upload, because "published" is a
# claim about what a user will get and only the user's path can answer it.

say "Checking what is actually live"
sleep 2
FEED="$(curl -fsS https://fileclear.ca/download/latest-mac.yml | head -1)"
echo "  feed says: $FEED"
REL="$(curl -fsS https://fileclear.ca/api/release)"
echo "  page reads: $REL"
CODE="$(curl -fsS -o /dev/null -w '%{http_code}' -r 0-1023 "https://fileclear.ca/download/$MAC_ARM")"
echo "  installer range request: HTTP $CODE (206 means resumable updates work)"

cd "$ROOT"
say "Released $VERSION"
echo "  Tag it so the release is a commit you can point at:"
echo "    git tag desktop-v$VERSION && git push --tags"
