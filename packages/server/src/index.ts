import { createServer } from 'node:http';
import { initWS } from './ws.js';

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

const server = createServer((_req, res) => {
  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
});

initWS(server, secret, allowedOrigins);

server.listen(port, () => {
  console.log(`[online-rummy] Listening on :${port}`);
  console.log(`[online-rummy] Allowed origins: ${[...allowedOrigins].join(', ')}`);
});

server.on('error', (err) => {
  console.error('[online-rummy] Fatal server error:', err);
  process.exit(1);
});
