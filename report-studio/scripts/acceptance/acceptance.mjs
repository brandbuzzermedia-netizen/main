// Three-client acceptance test: Thrishank (sample), Wudgres, Lykes.
// Run against a fresh store (the server's DATA_DIR must start empty):
//   DATA_DIR=/tmp/gbs-acc STUDIO_PASSWORD=bee-secret npm start -- -p 3100
//   node scripts/acceptance/make-fixtures.mjs /tmp/gbs-acc-out
//   node scripts/acceptance/acceptance.mjs /tmp/gbs-acc /tmp/gbs-acc-out
// Checks names, colours, logos, figures, calculations, wording, screenshots,
// file folders, PDF names, history, duplicate, share links and, above all,
// that nothing from one client appears in another client's report.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
const B = process.env.BASE || 'http://127.0.0.1:3100', DATA = process.argv[2], DIR = process.argv[3] || process.cwd();
const results = []; const check = (ok, msg) => { results.push([ok, msg]); console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(B + '/login'); await p.fill('input[name=name]', 'Mehul'); await p.fill('input[name=password]', process.env.STUDIO_PASSWORD || 'bee-secret');
await p.click('button[type=submit]'); await p.waitForURL(B + '/');

async function addClient(c) {
  await p.goto(B + '/clients/new');
  for (const [k, v] of Object.entries(c.fields)) await p.fill(`input[name=${k}]`, v);
  await p.selectOption('select[name=template]', c.template);
  await p.setInputFiles('input[name=logo]', `${DIR}/${c.logo}`);
  await p.fill('input[name=primary]', c.primary); await p.fill('input[name=accent]', c.accent);
  await p.fill('textarea[name=notes]', c.notes);
  await p.click('button[type=submit]:has-text("Add client")'); await p.waitForURL((u) => /\/clients\/[a-z-]+$/.test(u.pathname) && !u.pathname.endsWith('/new'));
  return new URL(p.url()).pathname.split('/').pop();
}
async function fill(fields) { for (const [k, v] of Object.entries(fields)) { if (k === 'meta.resultType') await p.selectOption(`select[name="${k}"]`, v); else await p.fill(`[name="${k}"]`, v); } }
async function addPosts(posts) {
  for (let i = 0; i < posts.length; i++) {
    if (i > 0 || !(await p.locator('[aria-label="Post 1 date"]').count())) await p.click('button:has-text("+ Add post")');
    const x = posts[i], n = i + 1;
    await p.fill(`[aria-label="Post ${n} date"]`, x.date); await p.selectOption(`[aria-label="Post ${n} type"]`, x.type);
    await p.fill(`[aria-label="Post ${n} theme"]`, x.theme); await p.fill(`[aria-label="Post ${n} caption"]`, x.caption);
    for (const k of ['views', 'reach', 'likes', 'comments', 'shares', 'saves']) await p.fill(`[aria-label="Post ${n} ${k}"]`, String(x[k]));
  }
}
async function submit(re) { await p.click('button[type=submit]:has-text("Create report")'); await p.waitForURL(re, { timeout: 20000 }); }
async function pdf(id) {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.evaluate((u) => { const a = document.createElement('a'); a.href = u; document.body.append(a); a.click(); }, `/api/reports/${id}/pdf`)]);
  const file = `${DIR}/${dl.suggestedFilename()}`; await dl.saveAs(file);
  return { name: dl.suggestedFilename(), text: execFileSync('pdftotext', ['-layout', file, '-']).toString(), images: execFileSync('pdfimages', ['-list', file]).toString().trim().split('\n').length - 2, pages: Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file]).toString())[1]) };
}

// ---- 1. Two new clients, added through the UI only
const wud = await addClient({ fields: { name: 'Wudgres', company: 'Wudgres Doors Pvt Ltd', industry: 'Doors', location: 'Mysuru, India', contact: 'Ravi K', website: 'https://wudgres.com', instagram: '@wudgres', facebook: 'https://facebook.com/wudgresdoors' }, template: 'minimal', logo: 'wudgres-logo.png', primary: '#8b5e3c', accent: '#e36414', notes: 'Prefers lead numbers first.' });
const lyk = await addClient({ fields: { name: 'Lykes', company: 'Lykes Fashion LLP', industry: 'Fashion', location: 'Bengaluru, India', contact: 'Ananya S', website: 'https://lykes.in', instagram: 'https://instagram.com/lykes.store', facebook: '' }, template: 'dark', logo: 'lykes-logo.png', primary: '#7b2cbf', accent: '#ff8fa3', notes: 'Instagram only, no ads.' });
check(wud === 'wudgres' && lyk === 'lykes', `clients created with ids ${wud}, ${lyk}`);

// ---- 2. Thrishank: Start next month (September) from the sample August report
await p.goto(B + '/clients/thrishank');
await p.click('a:has-text("Start next month")'); await p.waitForURL(/create\?from=thrishank-2026-08/);
check((await p.inputValue('[name="periodStart"]')) === '2026-09-01', 'Thrishank next month defaults to September 2026');
check((await p.inputValue('[name="ig.views"]')) === '' && (await p.inputValue('[name="prev.views"]')) === '81560', 'metrics reset; August figures carried as previous month');
check((await p.inputValue('[name="ig.followersStart"]')) === '726', 'opening followers = August closing followers');
await fill({ 'ig.views': '90114', 'ig.unique': '38002', 'ig.nonFol': '96.1', 'ig.followers': '781', 'meta.spend': '9120.50', 'meta.conv': '402', 'meta.impr': '120330', 'meta.reach': '41870' });
await addPosts([{ date: '2026-09-05', type: 'Reel', theme: 'Product showcase', caption: 'Teak entrance doors, crafted to last.', views: 21000, reach: 15100, likes: 410, comments: 22, shares: 35, saves: 61 }, { date: '2026-09-17', type: 'Post', theme: 'Festival', caption: 'Happy Ganesh Chaturthi from our workshop.', views: 6400, reach: 5200, likes: 180, comments: 9, shares: 4, saves: 7 }]);
await p.setInputFiles('input[name="shots.instagram"]', `${DIR}/thrishank-ig.png`);
await submit(/\/reports\/thrishank-2026-09/);

// ---- 3. Wudgres September: leads campaign, posts, IG + Meta screenshots
await p.goto(B + '/clients/wudgres'); await p.click('a:has-text("+ Create monthly report")'); await p.waitForURL(/create\?client=wudgres/);
check((await p.inputValue('select[name=template]')) === 'minimal', 'Wudgres report starts with its own template (Minimal)');
await fill({ periodStart: '2026-09-01', periodEnd: '2026-09-30', 'ig.views': '54210', 'ig.unique': '21904', 'ig.engaged': '1876', 'ig.followersStart': '3301', 'ig.followers': '3412', 'ig.likes': '2410', 'ig.comments': '133', 'ig.shares': '96', 'ig.saves': '208',
  'meta.campaign': 'Wudgres – Lead form', 'meta.objective': 'Leads', 'meta.resultType': 'Leads', 'meta.spend': '18500', 'meta.conv': '74', 'meta.impr': '142330', 'meta.reach': '61207', 'meta.clicks': '1904' });
await addPosts([{ date: '2026-09-03', type: 'Reel', theme: 'Installation', caption: 'Watch a flush door go in, start to finish.', views: 14800, reach: 11200, likes: 520, comments: 31, shares: 40, saves: 66 }, { date: '2026-09-12', type: 'Carousel', theme: 'Catalogue', caption: 'Five laminate finishes for modern homes.', views: 7300, reach: 6100, likes: 300, comments: 18, shares: 12, saves: 90 }, { date: '2026-09-25', type: 'Post', theme: 'Testimonial', caption: 'What our customers say about Wudgres.', views: 4100, reach: 3600, likes: 140, comments: 11, shares: 3, saves: 8 }]);
await p.setInputFiles('input[name="shots.instagram"]', `${DIR}/wudgres-ig.png`);
await p.setInputFiles('input[name="shots.meta"]', `${DIR}/wudgres-meta.png`);
await submit(/\/reports\/wudgres-2026-09/);

// ---- 4. Lykes September: Instagram only, no posts listed, no ads
await p.goto(B + '/create?client=lykes');
await fill({ periodStart: '2026-09-01', periodEnd: '2026-09-30', 'ig.views': '128900', 'ig.unique': '47320', 'ig.engaged': '6145', 'ig.nonFol': '71.4', 'ig.followersStart': '18240', 'ig.followers': '18925', 'ig.likes': '9820', 'ig.comments': '644', 'ig.shares': '1210', 'ig.saves': '1893', 'ig.posts': '14', 'ig.reels': '9', 'ig.stories': '31' });
if (await p.locator('[aria-label="Remove post 1"]').count()) await p.click('[aria-label="Remove post 1"]');
await p.setInputFiles('input[name="shots.instagram"]', [`${DIR}/lykes-ig.png`, `${DIR}/lykes-ig2.png`]);
await submit(/\/reports\/lykes-2026-09/);

// ---- 5. PDFs: names, contents, isolation
const pdfs = { thrishank: await pdf('thrishank-2026-09'), wudgres: await pdf('wudgres-2026-09'), lykes: await pdf('lykes-2026-09') };
const own = { thrishank: ['Thrishank Doors', '90,114', '402', 'messaging conversations'], wudgres: ['Wudgres', 'Wudgres Doors Pvt Ltd', '@wudgres', 'wudgres.com', '54,210', '74 leads', '₹250.00', 'Cost per lead', '1,876'], lykes: ['Lykes', 'Lykes Fashion LLP', '@lykes.store', '128,900', '6,145', '13,567', '31'] };
const foreign = { thrishank: ['Wudgres', 'Lykes', 'lykes', '54,210', '128,900'], wudgres: ['Thrishank', 'Lykes', 'lykes', 'messaging', 'conversations', '90,114', '128,900', 'Teak'], lykes: ['Thrishank', 'Wudgres', 'wudgres', 'Meta Ads', 'messaging', 'Campaign performance', '54,210', '90,114', 'Content performance'] };
const expectedName = { thrishank: 'Thrishank_Doors_September_2026_Monthly_Performance_Report.pdf', wudgres: 'Wudgres_September_2026_Monthly_Performance_Report.pdf', lykes: 'Lykes_September_2026_Monthly_Performance_Report.pdf' };
for (const k of Object.keys(pdfs)) {
  const r = pdfs[k], t = r.text.replace(/\s+/g, ' ');
  check(r.name === expectedName[k], `${k}: PDF file name ${r.name}`);
  const missing = own[k].filter((s) => !t.includes(s)); check(!missing.length, `${k}: PDF has its own data${missing.length ? ' (missing ' + missing.join(', ') + ')' : ''}`);
  const leaked = foreign[k].filter((s) => t.includes(s)); check(!leaked.length, `${k}: no other client's data in PDF${leaked.length ? ' (found ' + leaked.join(', ') + ')' : ''}`);
  console.log(`      ${k}: ${r.pages} pages, ${r.images} images`);
}
check(pdfs.lykes.pages < pdfs.wudgres.pages, `Lykes (no ads, no post list) has fewer pages (${pdfs.lykes.pages}) than Wudgres (${pdfs.wudgres.pages}); no empty sections`);
check(/Interactions.*13,567|13,567/.test(pdfs.lykes.text), 'Lykes interactions calculated: 9,820 + 644 + 1,210 + 1,893 = 13,567');
check(pdfs.wudgres.text.includes('+111'), 'Wudgres net followers calculated from start/end: 3,412 − 3,301 = +111');
check(pdfs.wudgres.text.includes('1.34%'), 'Wudgres CTR calculated: 1,904 ÷ 142,330 = 1.34%');

// ---- 6. Screenshots stored per client/month, logos per client
const files = (d) => existsSync(d) ? readdirSync(d) : [];
const F = `${DATA}/files`;
check(files(`${F}/wudgres/september-2026/instagram`).length === 1 && files(`${F}/wudgres/september-2026/meta-ads`).length === 1, 'Wudgres screenshots in wudgres/september-2026/{instagram,meta-ads}');
check(files(`${F}/lykes/september-2026/instagram`).length === 2 && !existsSync(`${F}/lykes/september-2026/meta-ads`), 'Lykes screenshots in lykes/september-2026/instagram only');
check(files(`${F}/thrishank/september-2026/instagram`).length === 1, 'Thrishank screenshot in thrishank/september-2026/instagram');
check(files(`${F}/wudgres/brand`).length === 1 && files(`${F}/lykes/brand`).length === 1, 'logos in each client\'s brand folder');

// ---- 7. Report pages use each client's branding
for (const [id, color, tpl] of [['wudgres-2026-09', 'rgb(139, 94, 60)', 'minimal'], ['lykes-2026-09', 'rgb(123, 44, 191)', 'dark'], ['thrishank-2026-09', 'rgb(59, 42, 33)', 'premium']]) {
  await p.goto(`${B}/print/reports/${id}`);
  const info = await p.evaluate(() => { const s = document.querySelector('section.page'); return { brand: getComputedStyle(s).getPropertyValue('--brand').trim(), cls: s.className, logos: [...document.querySelectorAll('img')].map((i) => [i.getAttribute('src'), i.naturalWidth]) }; });
  const brandRgb = await p.evaluate((c) => { const d = document.createElement('div'); d.style.color = c; document.body.append(d); return getComputedStyle(d).color; }, info.brand);
  const client = id.split('-')[0];
  const badImgs = info.logos.filter(([src, w]) => !w || (src.startsWith('/api/files/') && !src.startsWith(`/api/files/${client}/`)));
  check(brandRgb === color && info.cls.includes(`t-${tpl}`), `${client}: report colour ${brandRgb}, template ${tpl}`);
  check(!badImgs.length && (client === 'thrishank' || info.logos.some(([s]) => s.includes(`/${client}/brand/`))), `${client}: every image loads and comes from ${client}'s own folder (${info.logos.length} images)`);
}

// ---- 8. History per client, dashboard
await p.goto(B + '/clients/wudgres');
const wudRows = await p.locator('main table tbody tr').allTextContents();
check(wudRows.length === 1 && wudRows[0].includes('September 2026'), `Wudgres history lists only its own report (${wudRows.length})`);
await p.goto(B + '/clients/thrishank');
const thrRows = await p.locator('main table tbody tr').allTextContents();
check(thrRows.length === 2 && thrRows.every((r) => !/Wudgres|Lykes/.test(r)), `Thrishank history: September and August only (${thrRows.length})`);
await p.goto(B + '/');
await p.waitForTimeout(1500); // the stat numbers count up
const dash = await p.locator('main').textContent();
check(/3\s*Total clients/.test(dash) && dash.includes('Wudgres') && dash.includes('Lykes') && dash.includes('Thrishank Doors'), 'dashboard lists all three clients with counts');

// ---- 9. Duplicate Wudgres September into October
await p.goto(B + '/reports/wudgres-2026-09'); await p.click('a:has-text("Duplicate report")'); await p.waitForURL(/duplicate=wudgres-2026-09/);
check((await p.inputValue('[name="periodStart"]')) === '2026-10-01' && (await p.inputValue('[name="ig.views"]')) === '54210', 'duplicate defaults to October with the figures copied');
await submit(/\/reports\/wudgres-2026-10/);
const dup = await p.locator('main').textContent();
check(dup.includes('Duplicated from wudgres-2026-09'), 'duplicated report is flagged in the review panel');
check(!existsSync(`${F}/wudgres/october-2026`), 'screenshots are not copied into the duplicate');

// ---- 10. Share link: images load without a staff session; other files stay private
await p.goto(B + '/reports/lykes-2026-09');
await p.click("button:has-text(\"Create client link\")"); await p.waitForSelector("#share-url");
const shareHref = await p.inputValue("#share-url");
const visitor = await (await b.newContext()).newPage();
await visitor.goto(shareHref.startsWith('http') ? shareHref : B + shareHref);
const imgs = await visitor.evaluate(async () => { await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))); return [...document.images].map((i) => [i.src, i.naturalWidth]); });
check(imgs.length >= 3 && imgs.every(([, w]) => w > 0), `share link: ${imgs.length} images load for a client without a staff session`);
const signed = imgs.find(([s]) => s.includes('/lykes/september-2026/'))[0];
const tampered = signed.replace(/files\/lykes\/september-2026\/instagram\/[^?]+/, `files/wudgres/brand/${files(`${F}/wudgres/brand`)[0]}`);
const r1 = await visitor.request.get(signed), r2 = await visitor.request.get(tampered), r3 = await visitor.request.get(signed.split('?')[0]);
check(r1.status() === 200 && r2.status() === 401 && r3.status() === 401, `signed link works (${r1.status()}); reusing its signature for another client's file is refused (${r2.status()}); unsigned is refused (${r3.status()})`);

console.log('JS errors:', errors.length ? errors : 'none');
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
writeFileSync(`${DIR}/results.json`, JSON.stringify(results, null, 1));
await b.close();
process.exit(failed ? 1 : 0);
