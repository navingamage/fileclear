#!/usr/bin/env bash
#
# Turn a downloaded Developer ID Application certificate into a signing
# identity and a repository secret.
#
#   Scripts/finish-devid.sh ~/Downloads/developerID_application.cer
#
# Everything except the download itself was done when the key pair was made.
# Apple restricts creating a Developer ID certificate to the Account Holder and
# will not do it for an App Store Connect API key whatever role that key holds,
# which is the one step a script cannot take.
#
# The private key is at ~/.config/antipode/devid/fileclear-devid.key and the
# certificate is worthless without it. Apple issues a limited number of these
# and they cannot be freely reissued, so that file is worth backing up.
#
# No value is ever printed. The .p12 password comes from the login Keychain and
# goes to GitHub through stdin rather than through an argument, because argv is
# readable by anything that can run ps.
set -euo pipefail

CER="${1:-}"
DIR=~/.config/antipode/devid
KEY="$DIR/fileclear-devid.key"

if [ -z "$CER" ] || [ ! -f "$CER" ]; then
  echo "usage: Scripts/finish-devid.sh <path to the .cer downloaded from Apple>" >&2
  exit 2
fi
[ -f "$KEY" ] || { echo "no private key at $KEY. Without it the certificate cannot be used." >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077

# Apple hands back DER. Everything downstream wants PEM.
openssl x509 -inform DER -in "$CER" -out "$WORK/cert.pem" 2>/dev/null \
  || cp "$CER" "$WORK/cert.pem"

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

base64 -i "$DIR/fileclear-devid.p12" > "$WORK/p12.b64"
gh secret set MAC_CERT_P12 < "$WORK/p12.b64"

echo
echo "Signing identities now available:"
security find-identity -v -p codesigning | sed 's/[0-9A-F]\{40\}/<hash>/'
echo
echo "Next: git tag desktop-v1.0.0 && git push --tags"
