#!/usr/bin/env bash
#
# Turn a Developer ID Application certificate into a signing identity and a
# repository secret.
#
#   Scripts/finish-devid.sh                         fetch it from Apple
#   Scripts/finish-devid.sh ~/Downloads/some.cer    use a file you downloaded
#   Scripts/finish-devid.sh --ci                    also set the MAC_CERT_P12 secret
#
# With no argument it asks App Store Connect for the certificate and pulls it
# down itself, so there is nothing to download and nothing to find in a
# Downloads folder. The API can read certificates perfectly well; it is only
# *creating* a Developer ID certificate that Apple reserves for the Account
# Holder, and no App Store Connect key can do that whatever role it holds.
#
# So the one manual step is, signed in as the Account Holder:
#
#   1. developer.apple.com/account/resources/certificates/add
#   2. Developer ID Application, G2 Sub-CA if it asks
#   3. upload ~/.config/antipode/devid/fileclear-devid.csr
#   4. Continue. There is no need to download anything.
#
# Then run this with no arguments.
#
# The private key is at ~/.config/antipode/devid/fileclear-devid.key and the
# certificate is worthless without it. Apple issues a limited number of these
# and will not freely reissue them, so that file is worth backing up.
#
# No value is ever printed. The .p12 password comes from the login Keychain and
# goes to GitHub through stdin rather than an argument, because argv is
# readable by anything that can run ps.
set -euo pipefail

cd "$(dirname "$0")/.."
CER=""
PUSH_SECRET=false
for arg in "$@"; do
  case "$arg" in
    --ci) PUSH_SECRET=true ;;
    *) CER="$arg" ;;
  esac
done
DIR=~/.config/antipode/devid
KEY="$DIR/fileclear-devid.key"

[ -f "$KEY" ] || {
  echo "No private key at $KEY." >&2
  echo "Without it a certificate cannot be used, and this is the key the CSR was made from." >&2
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077

# A named file that is not there is its own problem, and saying "usage" for it
# sends somebody to re-read the arguments when what they need to know is that
# the path is wrong.
if [ -n "$CER" ] && [ ! -f "$CER" ]; then
  echo "No file at: $CER" >&2
  echo >&2
  echo "Run it with no arguments and it will fetch the certificate from Apple instead." >&2
  exit 1
fi

if [ -n "$CER" ]; then
  echo "Using $CER"
  openssl x509 -inform DER -in "$CER" -out "$WORK/cert.pem" 2>/dev/null \
    || cp "$CER" "$WORK/cert.pem"
else
  echo "Asking App Store Connect for the certificate"
  # shellcheck disable=SC1090
  source ~/.config/antipode/load-secrets.sh > /dev/null 2>&1 || true
  node Scripts/asc.js GET "/v1/certificates?limit=200" > "$WORK/certs.json" 2>/dev/null || {
    echo "Could not reach App Store Connect. Is the key loaded?" >&2
    echo "  source ~/.config/antipode/load-secrets.sh" >&2
    exit 1
  }

  # Pick by matching the public key against the private key here, not by
  # picking the newest Developer ID certificate. If there is more than one on
  # the account, only one of them belongs to this key pair, and choosing the
  # wrong one produces an identity that imports cleanly and then cannot sign.
  OURS="$(openssl rsa -in "$KEY" -pubout 2>/dev/null)"
  FOUND=""
  COUNT=0
  while IFS=$'\t' read -r cid ctype cname; do
    [ -n "$cid" ] || continue
    COUNT=$((COUNT + 1))
    python3 -c "
import json, sys, base64, pathlib
d = json.load(open('$WORK/certs.json'))
for c in d['data']:
    if c['id'] == '$cid':
        pathlib.Path('$WORK/candidate.der').write_bytes(
            base64.b64decode(c['attributes']['certificateContent']))
"
    openssl x509 -inform DER -in "$WORK/candidate.der" -out "$WORK/candidate.pem" 2>/dev/null || continue
    if [ "$(openssl x509 -in "$WORK/candidate.pem" -noout -pubkey)" = "$OURS" ]; then
      FOUND="$cname"
      cp "$WORK/candidate.pem" "$WORK/cert.pem"
      break
    fi
  done < <(python3 -c "
import json
d = json.load(open('$WORK/certs.json'))
for c in d['data']:
    a = c['attributes']
    if a['certificateType'].startswith('DEVELOPER_ID_APPLICATION'):
        print(c['id'], a['certificateType'], a.get('displayName',''), sep='\t')
")

  if [ -z "$FOUND" ]; then
    if [ "$COUNT" -eq 0 ]; then
      echo >&2
      echo "There is no Developer ID Application certificate on the account yet." >&2
    else
      echo >&2
      echo "Found $COUNT Developer ID certificate(s), but none made from the key here." >&2
    fi
    echo >&2
    echo "Signed in as the Account Holder:" >&2
    echo "  1. https://developer.apple.com/account/resources/certificates/add" >&2
    echo "  2. choose Developer ID Application, and G2 Sub-CA if it asks" >&2
    echo "  3. upload $DIR/fileclear-devid.csr" >&2
    echo "  4. Continue. You do not need to download anything." >&2
    echo >&2
    echo "Then run this again with no arguments." >&2
    echo >&2
    echo "Apple reserves creating this one certificate for the Account Holder, so" >&2
    echo "an App Store Connect key is refused whatever role it holds. Everything" >&2
    echo "else is already done." >&2
    exit 1
  fi
  echo "  found it on the account"
fi

# The check worth doing before anything else: a certificate whose public key is
# not this private key's is a certificate for somebody else's key, and it will
# import cleanly and then fail to sign with a message that explains nothing.
if ! diff -q <(openssl x509 -in "$WORK/cert.pem" -noout -pubkey) \
             <(openssl rsa -in "$KEY" -pubout 2>/dev/null) >/dev/null; then
  echo "That certificate does not match the private key in $DIR." >&2
  echo "It was issued for a different signing request." >&2
  exit 1
fi

echo "Certificate:"
openssl x509 -in "$WORK/cert.pem" -noout -subject -enddate | sed 's/^/  /'

# The intermediate has to travel with the certificate. Without it macOS cannot
# build a chain to the Apple root, and codesign fails on a machine that has not
# happened to cache it.
curl -fsS -o "$WORK/g2.cer" https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer || true
curl -fsS -o "$WORK/g1.cer" https://www.apple.com/certificateauthority/DeveloperIDCA.cer || true
: > "$WORK/chain.pem"
for c in "$WORK/g2.cer" "$WORK/g1.cer"; do
  [ -s "$c" ] && openssl x509 -inform DER -in "$c" >> "$WORK/chain.pem" 2>/dev/null || true
done

PW="$(security find-generic-password -a "$USER" -s antipode-fileclear-mac-cert-password -w)"
[ -n "$PW" ] || { echo "no password in the Keychain under antipode-fileclear-mac-cert-password" >&2; exit 1; }
# Exported before openssl runs, not after: -passout env:PW reads the
# environment of the child process, so setting it afterwards leaves openssl
# prompting on a terminal that may not be there.
export PW

openssl pkcs12 -export \
  -inkey "$KEY" -in "$WORK/cert.pem" \
  -passout env:PW \
  $([ -s "$WORK/chain.pem" ] && echo -certfile "$WORK/chain.pem") \
  -out "$DIR/fileclear-devid.p12"
chmod 600 "$DIR/fileclear-devid.p12"
echo "Wrote $DIR/fileclear-devid.p12"

# Into the login Keychain as well, so the certificate can be used for a local
# signed build without going through CI.
security import "$DIR/fileclear-devid.p12" -k ~/Library/Keychains/login.keychain-db \
  -P "$PW" -T /usr/bin/codesign -T /usr/bin/productsign 2>/dev/null \
  && echo "Imported into the login Keychain" \
  || echo "Already in the login Keychain, or import declined"

# Pushing the certificate to GitHub is a decision rather than a step.
#
# A Developer ID certificate is what tells every Mac in the world that a binary
# came from Antipode Technologies. Apple issues few of them, revoking one
# invalidates apps already signed with it, and there is no way to scope it to
# one product. Put it in a repository secret and the blast radius of a
# compromised GitHub account grows to include the ability to sign anything at
# all as this company.
#
# Kept on this machine, the certificate is protected by the Keychain and never
# leaves. Scripts/release-mac.sh signs from there, so nothing about shipping
# needs the secret to exist. It is worth setting only when a build has to
# happen somewhere else, which today means Windows, which does not use this
# certificate anyway.
if $PUSH_SECRET; then
  base64 -i "$DIR/fileclear-devid.p12" > "$WORK/p12.b64"
  gh secret set MAC_CERT_P12 < "$WORK/p12.b64"
  echo "MAC_CERT_P12 set. The certificate can now sign from CI as well as here."
else
  echo
  echo "The certificate stays on this machine. Scripts/release-mac.sh signs from"
  echo "the Keychain, so nothing about releasing needs it anywhere else."
  echo "Run with --ci if you ever want the build to sign on a GitHub runner."
fi

echo
echo "Signing identities now available:"
security find-identity -v -p codesigning | sed 's/[0-9A-F]\{40\}/<hash>/'
echo
echo "Next: Scripts/release-mac.sh 1.0.0"
