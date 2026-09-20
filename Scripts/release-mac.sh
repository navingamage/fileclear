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
command -v aws > /dev/null || {
  echo "  the aws CLI is needed to upload in parts. brew install awscli" >&2
  exit 1
}

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
  # Found rather than named. This was hard coded to mac-arm64, which stopped
  # existing the moment the build became universal, and the release then failed
  # after notarisation had already succeeded.
  APP="$(find . -maxdepth 2 -name '*.app' -type d | head -1)"
  [ -n "$APP" ] || { echo "  no .app in dist/" >&2; exit 1; }
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

  # Stapling appends the ticket, so every image that was just stapled is a
  # couple of kilobytes larger than the manifest electron-builder wrote before
  # it. The manifest then describes a file that no longer exists. It does not
  # break the update, which follows `path:` to the unstapled zip, but it is
  # wrong data being served and the day something reads the image entry it
  # would reject a perfectly good image.
  say "Bringing the manifest back in step with the files"
  python3 "$ROOT/Scripts/refresh-feed.py" .
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
  # Five components from dist: mac-universal/FileClear.app/Contents/MacOS/FileClear.
  # maxdepth 3 found nothing, and because the check refuses to pass quietly it
  # stopped a release that was otherwise finished. Better that way round than
  # the alternative, but the depth was simply wrong.
  bin="$(find . -maxdepth 5 -name FileClear -type f -path '*/Contents/MacOS/*' | head -1)"
  [ -n "$bin" ] || { echo "  no binary found to check" >&2; exit 1; }
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
# Uploaded in parts over the S3 API rather than in one request through
# wrangler.
#
# `wrangler r2 object put` sends the whole file in a single PUT, and a single
# PUT of a universal disk image does not survive a link that drops packets: it
# failed three times running on 217 MiB, and a 121 MiB control failed too, so
# it was never about size. Multipart turns one fragile transfer into forty odd
# small ones, each retried on its own, which is what gets a large file across a
# connection that cannot hold a long one open.
#
# R2 accepts a Cloudflare API token as S3 credentials: the access key is the
# token's id and the secret is the SHA-256 of the token itself. So this needs
# no second credential, and the token still never appears in an argument.
_r2_s3_env() {
  AWS_ACCESS_KEY_ID="$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["id"])')"
  AWS_SECRET_ACCESS_KEY="$(printf '%s' "$CLOUDFLARE_API_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
  export AWS_DEFAULT_REGION=auto AWS_MAX_ATTEMPTS=12 AWS_RETRY_MODE=adaptive
  R2_ENDPOINT="https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
  aws configure set default.s3.multipart_threshold 8MB
  aws configure set default.s3.multipart_chunksize 8MB
  aws configure set default.s3.max_concurrent_requests 2
}

put() {
  local type=application/octet-stream attempt
  case "$1" in
    *.dmg) type=application/x-apple-diskimage ;;
    *.zip) type=application/zip ;;
    *.json) type=application/json ;;
    *.yml) type=text/yaml ;;
  esac
  for attempt in 1 2 3; do
    if aws s3 cp "$1" "s3://fileclear-releases/$1" \
         --endpoint-url "$R2_ENDPOINT" --content-type "$type" \
         --no-progress > /dev/null 2>&1; then
      echo "  $1"
      return 0
    fi
    echo "  $1 failed, attempt $attempt of 3" >&2
    sleep $((attempt * 5))
  done
  echo "  giving up on $1" >&2
  return 1
}

_r2_s3_env

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
