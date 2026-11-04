// Builds the browser-only studio preview into ./out.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const HERE = resolve(import.meta.dirname);
const APP = resolve(HERE, "..");
const OUT = join(HERE, "dist");
const req = createRequire(join(APP, "package.json"));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "fonts"), { recursive: true });
mkdirSync(join(OUT, "brand"), { recursive: true });

// 1. JavaScript (and report.css, imported by the report renderer).
await build({
  entryPoints: [join(HERE, "src/main.tsx")],
  bundle: true, minify: true, format: "iife", target: "es2022", jsx: "automatic",
  outfile: join(OUT, "main.js"),
  nodePaths: [join(APP, "node_modules")],
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".ttf": "file" },
  plugins: [{
    name: "aliases",
    setup(b) {
      // Site-relative asset paths, so the studio works in any folder or subdomain.
      b.onLoad({ filter: /components[\\/]report[\\/]marks\.tsx$/ }, async (a) => ({
        contents: readFileSync(a.path, "utf8").replace('"/brand/bee.png"', '"brand/bee.png"'), loader: "tsx", resolveDir: dirname(a.path),
      }));
      b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(HERE, "src/link-shim.tsx") }));
      // Claude is called from the browser with the key saved in Settings.
      b.onResolve({ filter: /^(\.\/client|@\/lib\/ai\/client)$/ }, (a) => (a.path.startsWith("@") || a.importer.includes(join("lib", "ai"))) ? { path: join(HERE, "src/ai-client.ts") } : undefined);
      b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: join(APP, "src"), kind: a.kind }));
    },
  }],
  logLevel: "warning",
});

// 2. Tailwind: the app's theme, with classes from the app and the preview.
const postcss = req("postcss");
const tailwind = req("@tailwindcss/postcss");
const globals = readFileSync(join(APP, "src/app/(app)/globals.css"), "utf8")
  .replace('@import "tailwindcss";', `@import "tailwindcss" source(none);\n@source "${APP}/src";\n@source "${HERE}/src";`);
const css = await postcss([tailwind({ base: APP })]).process(globals, { from: join(APP, "src/app/(app)/globals.css") });

// 3. Fonts: the app's self-hosted static files under the variable names it uses.
const faces = [
  ["Baloo 2", "--font-baloo", [["Baloo2-SemiBold", 600], ["Baloo2-Bold", 700], ["Baloo2-ExtraBold", 800]]],
  ["Poppins", "--font-poppins", [["Poppins-Regular", 400], ["Poppins-Medium", 500], ["Poppins-SemiBold", 600], ["Poppins-Bold", 700]]],
  ["Instrument Serif", "--font-instrument-serif", [["InstrumentSerif-Regular", 400], ["InstrumentSerif-Italic", 400, "italic"]]],
  ["Hanken Grotesk", "--font-hanken", [["HankenGrotesk-Regular", 400], ["HankenGrotesk-Medium", 500], ["HankenGrotesk-SemiBold", 600], ["HankenGrotesk-Bold", 700]]],
];
let fontCss = ":root{" + faces.map(([f, v]) => `${v}:'${f}'`).join(";") + "}\n";
for (const [family, , files] of faces) for (const [file, w, style = "normal"] of files) {
  cpSync(join(APP, "src/fonts", file + ".ttf"), join(OUT, "fonts", file + ".ttf"));
  fontCss += `@font-face{font-family:'${family}';font-weight:${w};font-style:${style};font-display:block;src:url(fonts/${file}.ttf) format('truetype')}\n`;
}
writeFileSync(join(OUT, "app.css"), fontCss + css.css);
for (const f of readdirSync(join(APP, "public/brand"))) cpSync(join(APP, "public/brand", f), join(OUT, "brand", f));
console.log("built", readdirSync(OUT).join(", "));

// 4. The page, as a complete document for any static host (e.g. a Hostinger subdomain).
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>GBS Report Studio</title>
<link rel="icon" href="brand/bee.png">
<link rel="stylesheet" href="app.css">
<link rel="stylesheet" href="main.css">
</head>
<body>
<div id="root"></div>
<script src="main.js"></script>
</body>
</html>
`;
writeFileSync(join(OUT, "index.html"), page);
// Keeps the studio out of search results.
writeFileSync(join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");
