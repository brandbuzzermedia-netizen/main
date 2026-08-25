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
| `styles.css` | Theme tokens, layout, animations, responsive rules |
| `script.js` | Loading screen, nav, scroll reveal, counters, FAQ, form |

## Design

Bold and loud: honey yellow ground, ink-black type, hard offset shadows,
3px borders, and accent pops (coral, mint, lilac, sky). Display type is
Archivo Black in all caps; body is Space Grotesk. Sections alternate between
yellow, cream, ink and mint so the page changes gear as you scroll.

## The loading screen

A full black curtain with the wordmark stacking in line by line, a bee looping
across the screen, and a progress bar pinned to the bottom. Progress creeps to
90% while assets download, then completes on `window.load` and the curtain
wipes upward off the page. Two safety timers (4s and 7s) guarantee it always
clears, even if an asset stalls — a visitor is never trapped behind it.

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

- Fonts load from Google Fonts with system fallbacks.
- Respects `prefers-reduced-motion`: animations and the reveal effects are
  disabled, and the loader advances immediately.
- Layout is responsive at 980px and 640px breakpoints.
