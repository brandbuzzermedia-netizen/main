# Fonts

Static TrueType instances from Google Fonts, self-hosted so the studio and the
PDF renderer never depend on a network fetch, and so the PDF embeds the same
per-weight files as `reference/` (the variable versions render text a few
pixels wider). All are licensed under the SIL Open Font License 1.1.

| Family | Weights | Used for |
| --- | --- | --- |
| Instrument Serif | 400, 400 italic | Report display type |
| Hanken Grotesk | 400, 500, 600, 700 | Report body |
| Baloo 2 | 600, 700, 800 | GBS headings and the GBS lockup on reports |
| Poppins | 400, 500, 600, 700 | Studio body |

Source: `https://fonts.googleapis.com/css2?family=...` fetched without a browser
user agent, which returns the static `.ttf` files.
