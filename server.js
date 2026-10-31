#!/usr/bin/env node
'use strict';
/**
 * WA Infra Audit — WhatsApp Business infrastructure tracking tool.
 *
 * Single command, zero dependencies:   node server.js
 * Dashboard:                           http://localhost:3900
 * Instant demo:                        http://localhost:3900/?demo=1
 *
 * Security model:
 *  - Read-only: the tool only performs GET requests against the Graph API.
 *  - The access token lives in memory for the duration of one audit.
 *    It is never logged and never written to disk.
 *  - The server binds to localhost by default.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Tiny .env loader (no dependencies) ─────────────────────────────
(function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env — fine, token can be pasted in the dashboard */ }
})();

if (typeof fetch === 'undefined') {
  console.error('This tool requires Node.js 18 or newer (global fetch). Your version: ' + process.version);
  process.exit(1);
}

const { runAudit } = require('./lib/auditor');
const { demoReport } = require('./lib/demo');
const { GRAPH_VERSION } = require('./lib/metaApi');

const PORT = Number(process.env.PORT) || 3900;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ── API ───────────────────────────────────────────────────────────
  if (url.pathname === '/api/demo') {
    return sendJson(res, 200, demoReport());
  }

  if (url.pathname === '/api/env-token') {
    // Only reveals WHETHER a token exists in .env — never the token itself.
    return sendJson(res, 200, { present: Boolean(process.env.META_ACCESS_TOKEN) });
  }

  if (url.pathname === '/api/audit' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const { token } = JSON.parse(body || '{}');
        const t = (token && token.trim()) || process.env.META_ACCESS_TOKEN;
        if (!t) {
          return sendJson(res, 400, {
            error: 'No access token provided. Paste a Meta token in the dashboard or set META_ACCESS_TOKEN in .env',
          });
        }
        const report = await runAudit(t);
        sendJson(res, 200, report);
      } catch (e) {
        sendJson(res, 500, { error: e.message || String(e), code: e.code, type: e.type });
      }
    });
    return;
  }

  // ── Static dashboard ─────────────────────────────────────────────
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(PUB, path.normalize(rel).replace(/^([.]{2}[\\/])+/, ''));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  WA INFRA AUDIT — infrastructure tracking tool      │');
  console.log('  ├─────────────────────────────────────────────────────┤');
  console.log(`  │  Dashboard   http://localhost:${PORT}                  │`);
  console.log(`  │  Demo mode   http://localhost:${PORT}/?demo=1          │`);
  console.log(`  │  Graph API   ${GRAPH_VERSION}  ·  read-only  ·  0 deps       │`);
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('');
});
