// Draws the test clients' logos and "platform screenshots" as PNGs.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const p = await b.newPage({ deviceScaleFactor: 1 });
const OUT = process.argv[2] || '.';
import { mkdirSync } from 'node:fs'; mkdirSync(OUT, { recursive: true });
async function shot(file, w, h, html) {
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<body style="margin:0;font-family:sans-serif">${html}</body>`);
  await p.screenshot({ path: `${OUT}/${file}`, omitBackground: file.includes('logo') });
}
await shot('wudgres-logo.png', 360, 120, `<div style="font:800 54px/120px Georgia;color:#0F4C5C;text-align:center">WUD<span style="color:#E36414">GRES</span></div>`);
await shot('lykes-logo.png', 300, 120, `<div style="font:700 60px/120px 'Trebuchet MS';color:#7B2CBF;text-align:center">lykes<span style="color:#FF8FA3">.</span></div>`);
const panel = (acct, title, rows, color) => `<div style="width:900px;height:620px;background:#fff;padding:28px;box-sizing:border-box;border-top:10px solid ${color}">
  <div style="font-size:15px;color:#777">@${acct} · 1 Sep 2026 – 30 Sep 2026</div><h2 style="margin:8px 0 18px">${title}</h2>
  ${rows.map(([l, v]) => `<div style="display:flex;justify-content:space-between;font-size:24px;padding:10px 0;border-bottom:1px solid #eee"><span>${l}</span><b>${v}</b></div>`).join('')}</div>`;
await shot('wudgres-ig.png', 900, 620, panel('wudgres', 'Instagram Insights · Overview', [['Views', '54,210'], ['Accounts reached', '21,904'], ['Accounts engaged', '1,876'], ['Followers', '3,412']], '#0F4C5C'));
await shot('wudgres-meta.png', 900, 620, panel('Wudgres Interiors ad account', 'Ads Manager · Wudgres – Lead form', [['Amount spent', '₹18,500.00'], ['Leads', '74'], ['Impressions', '142,330'], ['Reach', '61,207'], ['Link clicks', '1,904']], '#E36414'));
await shot('lykes-ig.png', 900, 620, panel('lykes.store', 'Instagram Insights · Overview', [['Views', '128,900'], ['Accounts reached', '47,320'], ['Accounts engaged', '6,145'], ['Stories', '31']], '#7B2CBF'));
await shot('lykes-ig2.png', 900, 620, panel('lykes.store', 'Instagram Insights · Interactions', [['Likes', '9,820'], ['Comments', '644'], ['Shares', '1,210'], ['Saves', '1,893']], '#FF8FA3'));
await shot('thrishank-ig.png', 900, 620, panel('thrishankdoors', 'Instagram Insights · Overview', [['Views', '90,114'], ['Accounts reached', '38,002'], ['Followers', '781']], '#3B2A21'));
await b.close();
console.log('fixtures written');
