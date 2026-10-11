// Production build: bundles and minifies the browser code into dist/ with content-hashed file names
// (so browsers can cache them forever). `npm start` runs this automatically; `npm run dev` skips it.
import { build } from 'esbuild';
import { rm, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public'); const out = path.join(root, 'dist');
await rm(out, { recursive: true, force: true }); await mkdir(path.join(out, 'assets'), { recursive: true });

const js = await build({
  entryPoints: { app: path.join(pub, 'js/app.js') }, bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2022',
  outdir: path.join(out, 'assets'), entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]', metafile: true, logLevel: 'error',
});
const css = await build({
  entryPoints: { style: path.join(pub, 'css/style.css') }, bundle: false, minify: true, outdir: path.join(out, 'assets'), entryNames: '[name]-[hash]', metafile: true, logLevel: 'error',
});
const find = (meta, re) => Object.keys(meta.outputs).map((f) => path.basename(f)).find((f) => re.test(f));
const jsFile = find(js.metafile, /^app-.*\.js$/); const cssFile = find(css.metafile, /^style-.*\.css$/);

let html = await readFile(path.join(pub, 'index.html'), 'utf8');
html = html.replace('/css/style.css', `/assets/${cssFile}`).replace('/js/app.js', `/assets/${jsFile}`);
await writeFile(path.join(out, 'index.html'), html);
await cp(path.join(pub, 'img'), path.join(out, 'img'), { recursive: true });
console.log(`Built dist/: ${jsFile}, ${cssFile}`);
