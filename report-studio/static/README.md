# GBS Report Studio: browser-only version

The whole studio as plain files: no server, no database, no monthly hosting
cost. Upload `dist/` to any static host, such as a Hostinger subdomain.

- **Reports are saved in the browser** on the computer you use (IndexedDB).
  Download a backup from **Settings** regularly; restore it to move everything
  to another computer or browser.
- **Download PDF** builds the file in the browser: A4 landscape, one report
  page per sheet, named `<Client>_<Month>_<Year>_Monthly_Performance_Report.pdf`.
  Pages are high-resolution images (about 4–5 MB for a 23-page report).
- **Claude** reads screenshots and writes the report text when an Anthropic API
  key is saved in **Settings**. The key stays in that browser and is sent only
  to Anthropic. Keep the site internal: anyone using the site on a computer
  with a saved key can spend from it.
- Client share links are not part of this version; send the PDF.

## Put it on a Hostinger subdomain

1. hPanel → **Domains → Subdomains**: create one, e.g. `reports.getbeeseen.com`.
   Note its folder (for example `public_html/reports`).
2. hPanel → **Files → File Manager**: open that folder and upload everything
   inside `dist/` (or the ready zip, then **Extract** it there). `index.html`
   must sit directly in the folder.
3. Turn on SSL for the subdomain (hPanel → **Security → SSL**).
4. Open `https://reports.getbeeseen.com`, enter your name, and add your
   Anthropic key under **Settings** if you want Claude.

To update later, upload the new `dist/` files over the old ones. Your reports
are not affected, because they live in your browser, not on the host.

## Rebuild

```bash
cd static
npm install      # esbuild, used only to build
npm run build    # writes dist/
```

The build uses the main app's report engine, components and fonts
(`../src`), so a report looks the same here as in the server version.
