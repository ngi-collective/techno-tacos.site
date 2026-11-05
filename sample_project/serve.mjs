// HTTP static server for local development. WebXR needs HTTPS, so test on a Quest through the deployed site.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the project root, one level up, so a build there can use this folder's node_modules and assets.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const lanAddresses = (interfaces) =>
  Object.values(interfaces)
    .flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

// Returns an absolute path inside root, or null. Dot segments stay private, which covers .claude and .git.
const resolveRequest = (root, url) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://x').pathname);
  } catch {
    return null;
  }
  if (pathname.split('/').some((segment) => segment.startsWith('.'))) return null;
  const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  return file.startsWith(resolve(root) + sep) ? file : null;
};

const addresses = lanAddresses(networkInterfaces());

createServer((req, res) => {
  const file = resolveRequest(ROOT, req.url);
  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Mac:     http://localhost:${PORT}/`);
  addresses.forEach((a) => console.log(`Network: http://${a}:${PORT}/`));
  console.log('Starting beach: add sample_project/ to either address.');
});
