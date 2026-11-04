// HTTPS static server. WebXR needs a secure context, so the Quest must load this over HTTPS.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the project root, one level up, so a build there can use this folder's node_modules and assets.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 8443);
const CERT_DIR = fileURLToPath(new URL('.certs', import.meta.url));

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

// Returns an absolute path inside root, or null. Dot segments stay private, which covers .certs and .claude.
const resolveRequest = (root, url) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'https://x').pathname);
  } catch {
    return null;
  }
  if (pathname.split('/').some((segment) => segment.startsWith('.'))) return null;
  const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  return file.startsWith(resolve(root) + sep) ? file : null;
};

const ensureCert = (dir, addresses) => {
  const [key, cert] = [join(dir, 'key.pem'), join(dir, 'cert.pem')];
  const altNames = ['DNS:localhost', 'IP:127.0.0.1', ...addresses.map((a) => `IP:${a}`)].join(',');
  if (!existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '30',
        '-subj', '/CN=beach-demo', '-addext', `subjectAltName=${altNames}`],
      { stdio: 'ignore' },
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
};

const addresses = lanAddresses(networkInterfaces());

createServer(ensureCert(CERT_DIR, addresses), (req, res) => {
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
  console.log(`Mac:   https://localhost:${PORT}/`);
  addresses.forEach((a) => console.log(`Quest: https://${a}:${PORT}/`));
  console.log('Starting beach: add sample_project/ to either address.');
});
