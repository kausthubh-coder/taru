# Landing page

The public page at `/`: pitch, demo preview, problem list, how it works, self-hosting, build order, waitlist. Static HTML and CSS, light and dark.

## Sub-features

- `landing-render`: every section renders, with no horizontal scroll at 390px and 1440px.
- `landing-schemes`: follows the system light or dark setting.
- `landing-nav`: header links jump to `#fixes`, `#how`, `#self-host`.

## How to get to it (user POV)

- Open `/` in a browser.

## Driving it with verify.mjs

Preconditions: baseline.

- **Desktop, light.** Run `node .agents/skills/verify-taru/verify.mjs shot landing-desktop`. The PNG shows the h1 "Source control built for coding agents" and no overflow warning is printed.
- **Phone, dark.** Run `node .agents/skills/verify-taru/verify.mjs shot landing-phone --phone --dark`. Dark backgrounds, no overflow warning.
- **Structure.** Read `landing-*.aria.txt`. It lists the h2s "What it fixes", "How it works", "Open source. Runs on your own Cloudflare account.", "Where it is" and "Get an email when there's something to try".

## Gotchas

- GitHub links are `#` until the repo exists, and `og:image` is relative until there's a domain (TODOs in `index.html`).
- Fonts are self-hosted in `public/fonts/`. A missing font shows as a fallback in screenshots, not as an error.
