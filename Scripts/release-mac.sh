#!/usr/bin/env bash
#
# Build, sign, notarise and publish the Mac app, from this Mac.
#
#   Scripts/release-mac.sh 1.0.0
#   Scripts/release-mac.sh 1.0.0 --dry-run        build and check, publish nothing
#   Scripts/release-mac.sh 1.0.0 --publish-only   publish what is already in dist/
#
# --publish-only exists because notarisation is a round trip to Apple that can
# take the better part of an hour, and throwing a finished one away to rebuild
# identical bytes is a poor trade. It verifies what it finds before sending it.
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
PUBLISH_ONLY=false
case "${2:-}" in
  --dry-run) DRY_RUN=true ;;
  --publish-only) PUBLISH_ONLY=true ;;
esac

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

cd desktop
if $PUBLISH_ONLY; then
  say "Using the build already in desktop/dist"
  [ -d dist ] || { echo "Nothing in desktop/dist to publish." >&2; exit 1; }
else
  say "Building $VERSION"
  npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null
  rm -rf dist

  if $NOTARIZE; then
    npx electron-builder --mac --publish never --config.mac.notarize=true
  else
    CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --publish never
  fi
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

# The disk image has to be notarised in its own right.
#
# electron-builder notarises the .app, by zipping it and submitting that, and
# then builds a dmg around the result. The app inside is therefore stapled and
# the image is not, and stapling cannot fix that on its own: the ticket is
# looked up by the hash of the thing being stapled, so a dmg that was never
# submitted answers "Record not found".
#
# It is not cosmetic. spctl on an unnotarised image reports
# "rejected, source=no usable signature", and that image is exactly what a
# person downloads and double clicks. Verified rather than assumed, because
# the app inside passing made it look finished.
if [ -n "$IDENTITY" ] && $NOTARIZE; then
  say "Notarising the disk images"
  pids=()
  for dmg in *.dmg; do
    [ -e "$dmg" ] || continue
    if xcrun stapler validate "$dmg" > /dev/null 2>&1; then
      echo "  $dmg already stapled"
      continue
    fi
    # In parallel: each is a round trip to Apple measured in tens of minutes,
    # and they do not depend on each other.
    (
      xcrun notarytool submit "$dmg" \
        --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" \
        --issuer "$APPLE_API_ISSUER" --wait --timeout 45m \
        > "$dmg.notarise.log" 2>&1
      grep -q 'status: Accepted' "$dmg.notarise.log" \
        && xcrun stapler staple "$dmg" > /dev/null 2>&1
    ) &
    pids+=($!)
    echo "  $dmg submitted"
  done
  for pid in "${pids[@]:-}"; do [ -n "$pid" ] && wait "$pid"; done

  for dmg in *.dmg; do
    [ -e "$dmg" ] || continue
    xcrun stapler validate "$dmg" > /dev/null 2>&1 \
      || { echo "  $dmg has no ticket. Not publishing an image a user's Mac" >&2
           echo "  will refuse. See $dmg.notarise.log" >&2; exit 1; }
    echo "  $dmg stapled"
  done
  rm -f ./*.notarise.log
fi

# The check that answers the question a user actually asks.
#
# spctl cannot judge a disk image that carries a notarisation ticket but no
# code signature of its own. Asked with --context context:primary-signature it
# reports "no usable signature", which is true and irrelevant, since a dmg is
# not code signed; asked without it, "Insufficient Context". Both read as a
# refusal and neither is one, and trusting the first of them held this release
# up over a build that was fine.
#
# So the image is mounted the way a double click mounts it, with the quarantine
# flag a browser attaches, and the app inside is put to Gatekeeper. That is the
# path a person takes: download, open, drag to Applications, launch. If the app
# comes back accepted and notarised at the end of it, the release opens cleanly
# on a Mac that has never seen it.
if [ -n "$IDENTITY" ]; then
  say "Opening each image the way a download is opened"
  for dmg in *.dmg; do
    [ -e "$dmg" ] || continue
    probe="$(mktemp -d)/$dmg"
    cp "$dmg" "$probe"
    xattr -w com.apple.quarantine "0081;$(printf %x "$(date +%s)");Safari;" "$probe"

    mount="$(mktemp -d)"
    if ! hdiutil attach "$probe" -nobrowse -readonly -mountpoint "$mount" \
         > /dev/null 2>&1; then
      echo "  $dmg will not mount" >&2
      exit 1
    fi

    app="$(find "$mount" -maxdepth 1 -name '*.app' | head -1)"
    verdict="$(spctl --assess --type execute -v "$app" 2>&1 | tail -2 | tr '\n' ' ')"
    hdiutil detach "$mount" > /dev/null 2>&1
    rm -rf "$probe" "$mount"

    case "$verdict" in
      *accepted*Notarized*) echo "  $dmg opens clean: $verdict" ;;
      *) echo "  $dmg would warn a user: $verdict" >&2; exit 1 ;;
    esac
  done
fi

# The claim the download page now makes is that one image runs natively
# everywhere. Checked rather than trusted: a configuration change that quietly
# produced a single architecture again would look identical from the outside
# until somebody on the other kind of Mac installed it.
if [ -d mac-universal ] || ls -d *.app > /dev/null 2>&1; then
  say "Checking the binary is actually universal"
  bin="$(find . -maxdepth 3 -name FileClear -type f -path '*/Contents/MacOS/*' | head -1)"
  if [ -n "$bin" ]; then
    archs="$(lipo -archs "$bin" 2>/dev/null)"
    echo "  $archs"
    case "$archs" in
      *arm64*x86_64*|*x86_64*arm64*) : ;;
      *) echo "  not universal. The download page promises it runs natively on both." >&2
         exit 1 ;;
    esac
  fi
fi

if $DRY_RUN; then
  say "Dry run: built and verified, nothing published"
  echo "  artefacts in desktop/dist/"
  exit 0
fi

# ---------------------------------------------------------------- publish

say "Publishing to R2"

# Retried, because a hundred and twenty megabyte upload fails transiently and
# the first attempt at this release did: "fetch failed" after two seconds,
# which is too quick to be the upload and was gone on the next try. A release
# that gives up halfway leaves some of the files in the bucket and the rest
# not, which is the state the ordering below exists to avoid.
put() {
  local attempt
  for attempt in 1 2 3; do
    if npx --yes wrangler@4 r2 object put "fileclear-releases/$1" \
         --file "$1" --remote > /dev/null 2>&1; then
      echo "  $1"
      return 0
    fi
    echo "  $1 failed, attempt $attempt of 3" >&2
    sleep $((attempt * 5))
  done
  echo "  giving up on $1" >&2
  return 1
}

# Installers before the manifest. An app that reads a manifest naming a file
# which has not finished uploading fails its update.
for f in *.dmg *.zip *.blockmap; do [ -e "$f" ] && put "$f"; done

# One universal image, read rather than assumed. Naming it here by hand is how
# a download button ends up pointing at a file that was renamed.
MAC="$(ls *.dmg 2>/dev/null | head -1)"
[ -n "$MAC" ] || { echo "no disk image in dist/" >&2; exit 1; }
cat > release.json <<JSON
{
  "version": "$VERSION",
  "releasedOn": "$(date -u +%Y-%m-%d)",
  "signed": $([ -n "$IDENTITY" ] && echo true || echo false),
  "notarized": $NOTARIZE,
  "mac": { "universal": "$MAC" },
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
CODE="$(curl -fsS -o /dev/null -w '%{http_code}' -r 0-1023 "https://fileclear.ca/download/$MAC")"
echo "  installer range request: HTTP $CODE (206 means resumable updates work)"

cd "$ROOT"
say "Released $VERSION"
echo "  Tag it so the release is a commit you can point at:"
echo "    git tag desktop-v$VERSION && git push --tags"
