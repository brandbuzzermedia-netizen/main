#!/usr/bin/env node
/* Builds dist/meta-ads-business-calculator.html: one self-contained file
   (CSS, JS and images inlined). Use this file for publishing as a Claude
   artifact, emailing, or dropping onto any static host. No dependencies. */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dataUri = (rel) =>
  'data:image/png;base64,' + fs.readFileSync(path.join(root, rel)).toString('base64');

let html = read('index.html');
const css = read('css/styles.css');

html = html.replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>${css}</style>`);
// Inline every local script (market data, door module, app).
html = html.replace(/<script src="(js\/[\w-]+\.js)"><\/script>/g, (_, f) => `<script>${read(f)}</script>`);

// Inline every assets/*.png reference (HTML attributes and JS strings).
html = html.replace(/assets\/([\w-]+\.png)/g, (_, f) => dataUri('assets/' + f));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'meta-ads-business-calculator.html');
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
