/**
 * Genera UN solo archivo JavaScript con toda la app (API, interfaz, reglas).
 * Sirve para pegarlo en el editor web de Cloudflare Workers, sin instalar nada.
 * La librería de PDF y Word se carga desde jsDelivr (CDN).
 *
 * Uso: node scripts/generar-worker-unico.mjs
 * Resultado: dist/ficha-candidatos-unico.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');

const VERSION_PDFJS = require('pdfjs-dist/package.json').version;
const VERSION_MAMMOTH = require('mammoth/package.json').version;
const CDN_PDF = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION_PDFJS}/build/pdf.min.mjs`;
const CDN_PDF_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION_PDFJS}/build/pdf.worker.min.mjs`;
const CDN_MAMMOTH = `https://cdn.jsdelivr.net/npm/mammoth@${VERSION_MAMMOTH}/mammoth.browser.min.js`;

// Reemplaza las rutas locales por las del CDN, porque el archivo único no trae la carpeta vendor.
const indexHtml = leer('public/index.html')
  .replace('vendor/mammoth.browser.min.js', CDN_MAMMOTH);
const appJs = leer('public/app.js')
  .replace("'./vendor/pdf.min.mjs'", JSON.stringify(CDN_PDF))
  .replace("'./vendor/pdf.worker.min.mjs'", JSON.stringify(CDN_PDF_WORKER));

const activos = {
  '/index.html': [indexHtml, 'text/html; charset=utf-8'],
  '/estilos.css': [leer('public/estilos.css'), 'text/css; charset=utf-8'],
  '/app.js': [appJs, 'application/javascript; charset=utf-8'],
  '/extraer-texto.mjs': [leer('public/extraer-texto.mjs'), 'application/javascript; charset=utf-8'],
};

const entrada = `
import workerApi from './src/worker.js';

const ACTIVOS = ${JSON.stringify(activos)};

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return workerApi.fetch(request, env, ctx);
    }
    const ruta = url.pathname === '/' ? '/index.html' : url.pathname;
    const activo = ACTIVOS[ruta];
    if (!activo) return new Response('No encontrado', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : activo[0], {
      headers: { 'content-type': activo[1], 'cache-control': 'no-cache' },
    });
  },
};
`;

fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
const salida = path.join(raiz, 'dist', 'ficha-candidatos-unico.js');

await esbuild.build({
  stdin: { contents: entrada, resolveDir: raiz, loader: 'js', sourcefile: 'entrada.js' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: salida,
  logLevel: 'warning',
});

const tamanio = (fs.statSync(salida).size / 1024).toFixed(1);
console.log(`Listo: ${path.relative(raiz, salida)} (${tamanio} KB)`);
