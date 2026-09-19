#!/usr/bin/env node
//
// A signed request to the App Store Connect API.
//
//   source ~/.config/antipode/load-secrets.sh
//   node Scripts/asc.js GET /v1/certificates
//   node Scripts/asc.js POST /v1/certificates body.json
//
// No dependencies. Node's crypto does ES256, and its ieee-p1363 DSA encoding
// is exactly the raw r||s pair a JWS needs rather than the DER sequence
// openssl hands back, which is the part that usually goes wrong when people
// build these by hand.
//
// Nothing here prints a credential. The key is read from the path
// load-secrets.sh exports and never echoed.
const crypto = require('node:crypto');
const fs = require('node:fs');

const b64u = (b) => Buffer.from(b).toString('base64url');

function token() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
    throw new Error('App Store Connect credentials are not loaded. '
      + 'Run: source ~/.config/antipode/load-secrets.sh');
  }
  const header = b64u(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64u(JSON.stringify({
    iss: ASC_ISSUER_ID,
    iat: now,
    exp: now + 20 * 60,   // Apple's maximum for this audience
    aud: 'appstoreconnect-v1',
  }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`),
    { key: fs.readFileSync(ASC_KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64u(sig)}`;
}

async function main() {
  const [method, path, bodyFile] = process.argv.slice(2);
  if (!path) {
    console.error('usage: node Scripts/asc.js <METHOD> <path> [body.json]');
    process.exit(2);
  }
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method: method || 'GET',
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(bodyFile ? { 'Content-Type': 'application/json' } : {}),
    },
    body: bodyFile ? fs.readFileSync(bodyFile, 'utf8') : undefined,
  });
  const text = await res.text();
  process.stderr.write(`HTTP ${res.status}\n`);
  process.stdout.write(text);
  if (!res.ok) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exit(1); });
