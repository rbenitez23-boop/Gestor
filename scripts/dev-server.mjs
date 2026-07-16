// Servidor estático mínimo para desarrollo local — sin dependencias
// externas más allá de Node. Reconstruye con esbuild antes de servir.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');

console.log('Compilando…');
execSync('node scripts/build.mjs', { cwd: root, stdio: 'inherit' });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  let filePath = path.join(docsDir, req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 8080;
server.listen(PORT, () => console.log(`✓ http://localhost:${PORT}`));
