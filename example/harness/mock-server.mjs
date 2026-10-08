// Deterministic HTTP(S) backend for the Harness tests. Runs on the host machine.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const HTTP_PORT = 8099;
export const HTTPS_PORT = 8100;

const hits = new Map();
const lastHeaders = new Map();
const hitTimes = new Map();
const aborted = new Map();
const notModified = new Map();
const versions = new Map();
// Concurrent requests per `group` query param: { now, max }.
const concurrency = new Map();
// Test progress recorded by mock-server-plugin.mjs, shown by the in-app panel (harness/TestProgress.tsx).
const report = new Map();
const runStartedAt = Date.now();
let runFinished = false;

export const markRunFinished = () => {
  runFinished = true;
};

export const recordTest = (entry) => {
  const id = `${entry.file}|${entry.suite}|${entry.name}`;
  report.set(id, { ...report.get(id), ...entry, order: report.get(id)?.order ?? report.size });
};

const json = (res, status, body, extraHeaders = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(body));
};

function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const [, route, ...rest] = url.pathname.split('/');
  const key = rest.join('/');

  if (route === '__report') {
    return json(res, 200, { runStartedAt, finished: runFinished, results: [...report.values()] });
  }

  if (route === '__hits') {
    return json(res, 200, {
      hits: hits.get(key) ?? 0,
      headers: lastHeaders.get(key) ?? null,
      times: hitTimes.get(key) ?? [],
      aborted: aborted.get(key) ?? 0,
      notModified: notModified.get(key) ?? 0,
    });
  }

  if (route === '__bump') {
    versions.set(key, (versions.get(key) ?? 1) + 1);
    return json(res, 200, { version: versions.get(key) });
  }

  if (route === '__concurrency') {
    return json(res, 200, { max: concurrency.get(key)?.max ?? 0 });
  }

  const hitKey = `${route}/${key}`;
  hits.set(hitKey, (hits.get(hitKey) ?? 0) + 1);
  lastHeaders.set(hitKey, req.headers);
  hitTimes.set(hitKey, [...(hitTimes.get(hitKey) ?? []), Date.now()]);
  const n = hits.get(hitKey);

  // A client that drops the connection before the response counts as aborted.
  res.on('close', () => {
    if (!res.writableFinished) aborted.set(hitKey, (aborted.get(hitKey) ?? 0) + 1);
  });

  const group = url.searchParams.get('group');
  if (group) {
    const c = concurrency.get(group) ?? { now: 0, max: 0 };
    c.now += 1;
    c.max = Math.max(c.max, c.now);
    concurrency.set(group, c);
    res.on('close', () => (c.now -= 1));
  }

  switch (route) {
    case 'static':
      // Long cache lifetime: a client that caches would stop hitting the server.
      return json(res, 200, { key, value: 'same' }, { 'Cache-Control': 'public, max-age=3600' });
    case 'counter':
      return json(res, 200, { key, n });
    case 'echo': {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () =>
        json(
          res,
          200,
          { key, method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body },
          { 'X-Echo-Key': key }
        )
      );
      return;
    }
    case 'etag': {
      const version = versions.get(key) ?? 1;
      const etag = `"v${version}"`;
      if (req.headers['if-none-match'] === etag) {
        notModified.set(hitKey, (notModified.get(hitKey) ?? 0) + 1);
        res.writeHead(304, { ETag: etag });
        return res.end();
      }
      return json(res, 200, { key, version }, { ETag: etag });
    }
    case 'flaky': {
      // The first `fails` requests fail, the rest succeed.
      const fails = Number(url.searchParams.get('fails') ?? 1);
      return n <= fails ? json(res, 500, { n }) : json(res, 200, { key, ok: true });
    }
    case 'status': {
      const code = Number(rest[0]);
      return json(res, code, { code, message: `status ${code}` }, { 'X-Status-Route': String(code) });
    }
    case 'status-text': {
      const code = Number(rest[0]);
      res.writeHead(code, { 'Content-Type': 'text/plain' });
      return res.end(`plain error ${code}`);
    }
    case 'delay':
      return setTimeout(() => json(res, 200, { key, delayed: Number(url.searchParams.get('ms')) }), Number(url.searchParams.get('ms')));
    case 'hang':
      return; // never respond
    case 'trickle': {
      // Sends a small chunk every 300ms for `ms` in total: never idle, but slow overall.
      const total = Number(url.searchParams.get('ms') ?? 3000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(`{"key":${JSON.stringify(key)},"parts":[`);
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += 300;
        if (elapsed >= total) {
          clearInterval(timer);
          res.end('0]}');
        } else {
          res.write('1,');
        }
      }, 300);
      req.on('close', () => clearInterval(timer));
      return;
    }
    case 'drop':
      return req.socket.destroy();
    case 'gzip': {
      const body = gzipSync(JSON.stringify({ key, gzipped: true }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
      return res.end(body);
    }
    case 'utf8':
      return json(res, 200, { key, text: 'héllo 👋 日本 ü — ✓' });
    case 'large': {
      const count = Number(url.searchParams.get('count') ?? 20000);
      return json(res, 200, Array.from({ length: count }, (_, i) => ({ i, title: `item ${i}` })));
    }
    case 'redirect': {
      const left = Number(url.searchParams.get('left') ?? 1);
      const target = left > 1 ? `/redirect/${key}?left=${left - 1}` : `/counter/${key}-final`;
      res.writeHead(302, { Location: target });
      return res.end();
    }
    case 'set-cookie':
      return json(res, 200, { key }, { 'Set-Cookie': `session=${key}; Path=/` });
    case 'empty':
      res.writeHead(204);
      return res.end();
    case 'text':
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('not json');
    default:
      return json(res, 404, { error: 'unknown route', route });
  }
}

function selfSignedCert() {
  const dir = mkdtempSync(join(tmpdir(), 'synctasks-harness-'));
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-subj', '/CN=localhost',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
  ], { stdio: 'ignore' });
  return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
}

export async function startMockServer() {
  const servers = [http.createServer(handle), https.createServer(selfSignedCert(), handle)];
  await Promise.all([
    new Promise((r) => servers[0].listen(HTTP_PORT, r)),
    new Promise((r) => servers[1].listen(HTTPS_PORT, r)),
  ]);
  return () =>
    Promise.all(
      servers.map((s) => new Promise((r) => {
        s.closeAllConnections?.();
        s.close(() => r());
      }))
    );
}
