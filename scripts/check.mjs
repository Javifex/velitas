import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const file of readdirSync('dist').filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', `dist/${file}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.lang, 'es-CO');
for (const icon of manifest.icons) assert(existsSync(`dist/${icon.src}`), `Falta el icono ${icon.src}`);
const sw = readFileSync('dist/sw.js', 'utf8');
assert(sw.includes(`velitas-${pkg.version}`), 'Versión del caché incoherente');
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map(match => match[1]).filter(Boolean);
for (const asset of assets) assert(existsSync(`dist/${asset}`), `Falta recurso sin conexión: ${asset}`);
assert(sw.includes("'./'"), 'Falta el documento principal sin conexión');
for (const file of ['app.js', 'domain.js', 'storage.js', 'styles.css', 'manifest.webmanifest']) {
  assert(assets.includes(file), `Recurso fuera del caché: ${file}`);
}
const html = readFileSync('dist/index.html', 'utf8');
assert(html.includes('lang="es-CO"') && html.includes('apple-touch-icon.png'));
assert(!/https?:\/\//.test(html), 'El inicio debe funcionar sin recursos externos');
assert(readFileSync('dist/app.js', 'utf8').includes(pkg.version), 'Versión de la app incoherente');
console.log(`Velitas ${pkg.version}: sintaxis, metadatos e integridad PWA correctos.`);
