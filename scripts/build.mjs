import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');
mkdirSync(docsDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'app.ts')],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2022'],
  outfile: path.join(docsDir, 'app.js'),
  format: 'esm',
});

copyFileSync(path.join(root, 'src', 'index.html'), path.join(docsDir, 'index.html'));
copyFileSync(path.join(root, 'src', 'style.css'), path.join(docsDir, 'style.css'));

// La primera vez que se publica el sitio, docs/data/db.json se siembra con
// los datos base (catálogo + recetario). A partir de ahí, la app YA NO lee
// este archivo — lee siempre data/db.json en la raíz del repo vía la
// GitHub API, para que los cambios sean commits reales. Este copiado es
// solo para que el repo tenga un punto de partida.
if (!existsSync(path.join(root, 'data', 'db.json'))) {
  console.log('⚠ No existe data/db.json — corre "npm run seed" primero.');
} else {
  console.log('✓ Build listo en /docs. Recuerda: los datos viven en /data/db.json (vía GitHub API), no en /docs.');
}

console.log('✓ docs/app.js, docs/index.html, docs/style.css generados.');
