# Get Bee Seen

Marketing website for **Get Bee Seen**, a social-first marketing studio. Static
site — no build step, no dependencies. Open `index.html` or serve the folder.

```bash
python3 -m http.server 8000
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All page content and markup |
| `styles.css` | Brand tokens, layout, animations, responsive rules |
| `script.js` | Loading screen, nav, scroll reveal, counters, FAQ, form |
| `assets/` | Logo artwork extracted from the brand kit (SVG) |

## Brand

Everything follows the Get Bee Seen brand kit.

**Colour**

| Token | Hex | Use |
| --- | --- | --- |
| `--cream` | `#fff2dc` | Page background |
| `--cream-lift` | `#fffaf0` | Cards and raised surfaces |
| `--yellow` | `#ffb933` | Accent, highlights, buttons |
| `--yellow-deep` | `#ff9600` | Accent shade |
| `--green` | `#196144` | Headings, borders, dark sections |
| `--green-2` | `#3e5d48` | Secondary green |
| `--ink` | `#191816` | Body text |
| `--grey` | `#999999` | Muted text |

**Type** — Headings are **Bunga**, body is **Neue Leiden**. Neither is on
Google Fonts, so the site ships with the closest free matches (Alfa Slab One
and Archivo) and lists the real names first in the stack. To use the licensed
files: put `Bunga.woff2` and `NeueLeiden.woff2` in `assets/fonts/` and
uncomment the `@font-face` block at the top of `styles.css`.

**Logo** — `assets/` holds vector artwork pulled from the kit:

| File | Where it's used |
| --- | --- |
| `wordmark-green.svg` | Header |
| `wordmark-cream.svg` | Loading screen, footer |
| `bee.svg` | Loading screen, hero |
| `badge.svg` | Favicon, spinning badge above the closing CTA |

## The loading screen

Deep green ground with the brand bee flying inside a cream disc, the wordmark
beneath it, and a yellow progress bar. Progress creeps to 90% while assets
download, then completes on `window.load` and fades out. Two safety timers
(4s and 7s) guarantee it always clears, even if an asset stalls — a visitor is
never trapped behind it.

To change the rotating status lines, edit the `messages` array in `script.js`.

## Before going live

- **The contact form is front-end only.** It validates and shows a success
  message but sends nothing. Point it at Formspree, Netlify Forms, or your own
  endpoint before launch.
- Replace the placeholder contact details (`hello@getbeeseen.com`, the phone
  number) and the `#` social links in the footer.
- Case studies, testimonials and stats are sample content — swap in real figures.
- Add a real Open Graph image (`og:image`) for link previews.

## Notes

- Respects `prefers-reduced-motion`: animations and reveals are disabled, and
  the loader advances immediately.
- Layout is responsive at 1000px and 640px breakpoints.
