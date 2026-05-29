import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWS } from './ws.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const secret = process.env['SESSION_SECRET'];
if (secret === undefined || secret.length < 32) {
  console.error('SESSION_SECRET must be set and at least 32 characters');
  process.exit(1);
}

const originsEnv = process.env['ALLOWED_ORIGINS'];
if (originsEnv === undefined || originsEnv.trim().length === 0) {
  console.error('ALLOWED_ORIGINS must be set (comma-separated list)');
  process.exit(1);
}
const allowedOrigins = new Set(originsEnv.split(',').map(s => s.trim()).filter(Boolean));

const portStr = process.env['PORT'] ?? '8080';
const port = parseInt(portStr, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a valid port number, got: ${portStr}`);
  process.exit(1);
}

// Resolved once at startup; STATIC_DIR env overrides the default sibling dist path.
const staticDir = process.env['STATIC_DIR'] ?? join(__dirname, '../../client/dist');
const staticReady = existsSync(join(staticDir, 'index.html'));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.ttf':   'font/ttf',
  '.txt':   'text/plain',
};

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  if (!staticReady) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }

  const pathname = (req.url ?? '/').split('?')[0] ?? '/';
  const filePath = join(staticDir, pathname);

  // Path traversal guard
  if (filePath !== staticDir && !filePath.startsWith(staticDir + sep)) {
    res.writeHead(403).end();
    return;
  }

  const stat = existsSync(filePath) ? statSync(filePath) : null;
  if (stat?.isFile()) {
    const mime = MIME[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    createReadStream(filePath).on('error', () => { if (!res.headersSent) res.writeHead(500).end(); }).pipe(res);
    return;
  }

  // SPA fallback: all non-file paths get index.html so React Router handles routing
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  createReadStream(join(staticDir, 'index.html')).on('error', () => { if (!res.headersSent) res.writeHead(500).end(); }).pipe(res);
}

const server = createServer(handleRequest);

initWS(server, secret, allowedOrigins);

server.listen(port, () => {
  console.log(`[online-rummy] Listening on :${port}`);
  console.log(`[online-rummy] Allowed origins: ${[...allowedOrigins].join(', ')}`);
  console.log(staticReady
    ? `[online-rummy] Serving static files from ${staticDir}`
    : `[online-rummy] Static dir not found (${staticDir}) — HTTP requests return 404`);
});

server.on('error', (err) => {
  console.error('[online-rummy] Fatal server error:', err);
  process.exit(1);
});
