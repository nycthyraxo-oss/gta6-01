// serve.ts — a tiny static server for game/ so Costa Fuego can be played
// locally with no build step: `node serve.ts` serves on http://localhost:8080.
// Standard library only; refuses any path that climbs out of game/.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'game');
const portArg = process.argv.indexOf('--port');
const port = Number((portArg >= 0 && process.argv[portArg + 1]) || process.env.PORT || 8080);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const filePath = normalize(join(root, path));
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (_) {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(port, () => {
  console.log('Costa Fuego serving game/ at http://localhost:' + port);
});
