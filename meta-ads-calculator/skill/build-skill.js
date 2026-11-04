/* Assembles the Claude skill into dist/skill/gbs-ads-planner:
   SKILL.md, references, the CLI, a copy of the engine js and the single file tool.
   Run `npm run build` first so the tool file is current. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist', 'skill', 'gbs-ads-planner');
fs.rmSync(out, { recursive: true, force: true });
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
cp(path.join(__dirname, 'SKILL.md'), path.join(out, 'SKILL.md'));
for (const f of fs.readdirSync(path.join(__dirname, 'references'))) cp(path.join(__dirname, 'references', f), path.join(out, 'references', f));
cp(path.join(__dirname, 'scripts', 'gbs.js'), path.join(out, 'scripts', 'gbs.js'));
for (const f of fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js'))) cp(path.join(root, 'js', f), path.join(out, 'scripts', 'engine', f));
const tool = path.join(root, 'dist', 'meta-ads-business-calculator.html');
if (!fs.existsSync(tool)) { console.error('Run npm run build first'); process.exit(1); }
cp(tool, path.join(out, 'assets', 'meta-ads-business-calculator.html'));
console.log('Built skill at ' + path.relative(root, out));
