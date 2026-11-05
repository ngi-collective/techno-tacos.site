// Builds dist/ for GitHub Pages: only the files the page loads, in the same folders it loads them from.
// An explicit list keeps private files, such as team_data/email.txt, out of the site.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const THREE = 'sample_project/node_modules/three';
const DOMAIN = 'techno-tacos.site';

const ASSETS = [
  'index.html',
  'src',
  'assets',
  'team_data/diagrams.png',
  'team_data/project/one_pager.png',
  'sample_project/assets/waves.wav',
  'sample_project/assets/waternormals.jpg',
  `${THREE}/LICENSE`,
  `${THREE}/build/three.module.js`,
  `${THREE}/build/three.core.js`,
];

const ADDONS = [
  'controls/PointerLockControls.js',
  'loaders/GLTFLoader.js',
  'objects/Sky.js',
  'objects/Water.js',
  'utils/BufferGeometryUtils.js',
  'utils/SkeletonUtils.js',
  'webxr/VRButton.js',
].map((file) => `${THREE}/examples/jsm/${file}`);

const relativeImports = (source) => [...source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)].map((match) => match[1]);

// Pure apart from reading files: every add-on file reachable from `start` through relative imports.
const withDependencies = (start) => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    relativeImports(readFileSync(join(ROOT, file), 'utf8'))
      .forEach((path) => visit(posix.join(posix.dirname(file), path)));
  };
  start.forEach(visit);
  return [...seen];
};

const copy = (file) => {
  const target = join(DIST, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(ROOT, file), target, { recursive: true });
};

rmSync(DIST, { recursive: true, force: true });
[...ASSETS, ...withDependencies(ADDONS)].forEach(copy);
writeFileSync(join(DIST, 'CNAME'), `${DOMAIN}\n`);
writeFileSync(join(DIST, '.nojekyll'), ''); // Jekyll would otherwise skip node_modules.
console.log(`Built ${relative(ROOT, DIST)}/ for ${DOMAIN}`);
