import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createApiHandler } from '../server/api.js';
import { createDatabase } from '../server/database.js';
import { createPosService } from '../server/pos-service.js';
import { createSessionManager } from '../server/session.js';

const root = normalize(new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const port = Number(process.env.PORT || 8765);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

const database = process.env.DATABASE_URL ? createDatabase(process.env.DATABASE_URL) : null;
const sessions = database ? createSessionManager(process.env.SESSION_SECRET, {
  secure: process.env.NODE_ENV === 'production'
}) : null;
const api = database ? createApiHandler(createPosService(database), sessions) : null;

const server = createServer(async (request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (requestedPath.startsWith('/api/')) {
    if (!api) {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Database mode is not configured' }));
      return;
    }
    return api(request, response, new URL(request.url, `http://${request.headers.host}`));
  }
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use.`);
    console.error(`Close the other server or start this one on another port:`);
    console.error(`  $env:PORT=8766; npm start`);
    process.exitCode = 1;
    return;
  }

  console.error(`Unable to start the development server: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Urban Clothing POS: http://127.0.0.1:${port}`);
  console.log(database ? 'Persistence: PostgreSQL' : 'Persistence: in-memory demonstration fallback');
});

async function shutdown() {
  server.close();
  if (database) await database.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
