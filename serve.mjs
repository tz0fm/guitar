#!/usr/bin/env node
// Serves the Guitar app to your iPhone over your local Wi-Fi.
//
//   HTTPS (the app):           https://<this-mac>.local:8444
//   HTTP  (one-time setup):    http://<this-mac>.local:8081   -> certificate download + steps
//
// iOS only enables offline web apps (service workers) over HTTPS, so on first run
// this script creates a private certificate authority in ./.certs and uses it to
// sign a certificate for this Mac. You install the CA on your iPhone once.
// The CA is name-constrained to local addresses (*.local, localhost, private IPs),
// so it can't be used to impersonate real websites.
//
// No dependencies; needs Node 18+ and `openssl` on the PATH.

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const CERTS = path.join(ROOT, '.certs');
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 8444;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 8081;
const NEW_CA_NAME = 'Guitar Local CA';
// The name of the CA in use (a CA copied over from another project keeps its own name).
let CA_NAME = NEW_CA_NAME;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ---------- Addresses ---------- */

function lanIPv4() {
  const all = Object.entries(os.networkInterfaces())
    .flatMap(([name, addrs]) => (addrs || []).map((a) => ({ name, ...a })))
    .filter((a) => a.family === 'IPv4' && !a.internal);
  // Prefer Wi-Fi/Ethernet (en*) over VPNs and bridges.
  all.sort((a, b) => Number(b.name.startsWith('en')) - Number(a.name.startsWith('en')));
  return all.map((a) => a.address);
}

function localHostName() {
  try {
    const n = execFileSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' }).trim();
    if (n) return `${n}.local`;
  } catch { /* not macOS */ }
  const h = os.hostname();
  return h.endsWith('.local') ? h : `${h}.local`;
}

/* ---------- Certificates ---------- */

const certPath = (f) => path.join(CERTS, f);

function openssl(args) {
  try {
    execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    throw new Error(`openssl ${args[0]} failed:\n${e.stderr?.toString() || e.message}`);
  }
}

function ensureCA() {
  if (fs.existsSync(certPath('ca.key')) && fs.existsSync(certPath('ca.crt'))) return;
  fs.mkdirSync(CERTS, { recursive: true, mode: 0o700 });
  fs.writeFileSync(certPath('ca.cnf'), `
[req]
distinguished_name = dn
prompt = no
x509_extensions = v3_ca
[dn]
CN = ${NEW_CA_NAME}
O = Guitar (local)
[v3_ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical, permitted;DNS:local, permitted;DNS:localhost, permitted;IP:10.0.0.0/255.0.0.0, permitted;IP:172.16.0.0/255.240.0.0, permitted;IP:192.168.0.0/255.255.0.0, permitted;IP:127.0.0.0/255.0.0.0
`);
  openssl(['req', '-x509', '-new', '-nodes', '-newkey', 'rsa:2048', '-sha256', '-days', '3650',
    '-keyout', certPath('ca.key'), '-out', certPath('ca.crt'), '-config', certPath('ca.cnf')]);
  fs.chmodSync(certPath('ca.key'), 0o600);
  console.log(`Created a new local certificate authority in ${CERTS}`);
}

function caName() {
  try {
    const subj = execFileSync('openssl', ['x509', '-noout', '-subject', '-in', certPath('ca.crt')], { encoding: 'utf8' });
    const m = /CN\s*=\s*([^,\/\n]+)/.exec(subj);
    if (m) return m[1].trim();
  } catch { /* fall back to the default name */ }
  return NEW_CA_NAME;
}

function ensureServerCert(names, ips) {
  const san = [...names.map((n) => `DNS:${n}`), ...ips.map((ip) => `IP:${ip}`)].join(', ');
  const metaFile = certPath('server.json');
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const ageDays = (Date.now() - meta.created) / 86400000;
    if (meta.san === san && ageDays < 700 && fs.existsSync(certPath('server.crt'))) return;
  } catch { /* regenerate */ }

  fs.writeFileSync(certPath('server.cnf'), `
[req]
distinguished_name = dn
prompt = no
[dn]
CN = ${names[0]}
`);
  fs.writeFileSync(certPath('server.ext'), `
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = ${san}
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid, issuer
`);
  openssl(['req', '-new', '-nodes', '-newkey', 'rsa:2048', '-sha256',
    '-keyout', certPath('server.key'), '-out', certPath('server.csr'), '-config', certPath('server.cnf')]);
  // iOS rejects TLS server certificates valid for more than 825 days.
  openssl(['x509', '-req', '-in', certPath('server.csr'), '-CA', certPath('ca.crt'), '-CAkey', certPath('ca.key'),
    '-set_serial', '0x' + crypto.randomBytes(12).toString('hex'), '-days', '800', '-sha256',
    '-extfile', certPath('server.ext'), '-out', certPath('server.crt')]);
  fs.chmodSync(certPath('server.key'), 0o600);
  fs.writeFileSync(metaFile, JSON.stringify({ san, created: Date.now() }));
  console.log(`Issued server certificate for: ${san}`);
}

/* ---------- Static file server ---------- */

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  let file = path.normalize(path.join(PUBLIC, pathname));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

/* ---------- Setup page (plain HTTP) ---------- */

function setupPage(host) {
  const appUrl = `https://${host}:${HTTPS_PORT}/`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guitar setup</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #111318; color: #f3f1ee; font: 17px/1.5 -apple-system, system-ui, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 26px; margin: 8px 0 4px; }
  p.sub { color: #8b909c; margin-top: 0; }
  ol { padding-left: 22px; }
  li { margin: 14px 0; }
  li b { color: #fff; }
  a.btn { display: block; text-align: center; background: #ff8a3d; color: #1a0f08; font-weight: 600;
          text-decoration: none; padding: 14px; border-radius: 14px; margin: 10px 0; }
  a.btn.alt { background: #252a34; color: #f3f1ee; }
  .note { color: #8b909c; font-size: 14px; background: #1a1d24; padding: 12px 14px; border-radius: 12px; }
  code { color: #ffb27d; word-break: break-all; }
</style></head>
<body><main>
  <h1>Install Guitar</h1>
  <p class="sub">One-time setup. Do this on your iPhone, in Safari.</p>
  <p class="note">Already trust <b>${CA_NAME}</b> on this iPhone (for example from the Metronome app)? Skip to step 4.</p>
  <ol>
    <li><b>Download the certificate.</b> Tap the button, then tap <b>Allow</b> and <b>Close</b>.
      <a class="btn" href="/guitar-ca.crt">Download certificate</a></li>
    <li><b>Install it.</b> Open <b>Settings → General → VPN &amp; Device Management</b>, tap
      <b>${CA_NAME}</b> and tap <b>Install</b>. (On some iOS versions a <b>Profile Downloaded</b> item appears at the top of Settings instead.)</li>
    <li><b>Trust it.</b> Open <b>Settings → General → About → Certificate Trust Settings</b> and turn on
      <b>${CA_NAME}</b>.</li>
    <li><b>Open the app</b> in Safari:
      <a class="btn alt" href="${appUrl}">${appUrl}</a></li>
    <li><b>Add it to your Home Screen.</b> Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.
      Open it from the new icon once while this Mac is still running the server.
      After that it works offline.</li>
  </ol>
  <p class="note">The certificate only works for local network addresses (<code>*.local</code> and private IPs),
  so it can't be used to intercept other websites. You can remove it at any time in
  Settings → General → VPN &amp; Device Management.</p>
</main></body></html>`;
}

function setupHandler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/guitar-ca.crt') {
    res.writeHead(200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Disposition': 'attachment; filename="guitar-ca.crt"',
    });
    res.end(fs.readFileSync(certPath('ca.crt')));
    return;
  }
  const host = (req.headers.host || '').replace(/:\d+$/, '') || localHostName();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(setupPage(host));
}

/* ---------- Main ---------- */

const hostName = localHostName();
const ips = lanIPv4();
ensureCA();
CA_NAME = caName();
ensureServerCert([hostName, 'localhost'], [...ips, '127.0.0.1']);

const log = (req) => console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.url}`);
https.createServer(
  { key: fs.readFileSync(certPath('server.key')), cert: fs.readFileSync(certPath('server.crt')) },
  (req, res) => { log(req); serveStatic(req, res); },
).listen(HTTPS_PORT, '0.0.0.0');
http.createServer((req, res) => { log(req); setupHandler(req, res); }).listen(HTTP_PORT, '0.0.0.0');

const ipHint = ips[0] ? `  (or http://${ips[0]}:${HTTP_PORT})` : '';
console.log(`
Guitar server running. Your iPhone must be on the same Wi-Fi as this Mac.

  First time? On your iPhone, open Safari and go to:
      http://${hostName}:${HTTP_PORT}${ipHint}
  and follow the steps there.

  Already set up? The app is at:
      https://${hostName}:${HTTPS_PORT}/

Press Ctrl+C to stop.
`);
