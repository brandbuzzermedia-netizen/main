#!/usr/bin/env node
/* Builds dist/point-vision-lead-engine.html: one self-contained file with CSS,
   JS and the logo inlined. Open it from disk, email it, or host it anywhere.
   It runs in local mode (browser storage). No dependencies. */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dataUri = (rel) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, rel)).toString('base64');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/app.css">', () => `<style>${read('css/app.css')}</style>`);
html = html.replace(/<script src="(js\/[\w/.-]+\.js)"><\/script>/g, (_, f) => `<script>${read(f).replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(/assets\/([\w-]+\.png)/g, (_, f) => dataUri('assets/' + f));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'point-vision-lead-engine.html');
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
