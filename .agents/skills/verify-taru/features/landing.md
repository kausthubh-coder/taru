# Landing page

The public page at `/`: the pitch and the waitlist form, a drawn mock-up of one commit in three places (the agent
API, plain git, the GitHub copy) with a note under each, why agent-heavy teams need it (three numbers and a quote),
a board of what works today, what's next and what comes later, Git and GitHub compatibility, pricing, questions, and
the waitlist again. Static HTML (`index.html`) and CSS
(`features/landing/ui/landing.css` on top of `shared/ui/`), light and dark.

## Sub-features

- `landing-render`: every section renders, with no horizontal scroll at 390px and 1440px.
- `landing-schemes`: follows the system light or dark setting.
- `landing-nav`: header links jump to `#why`, `#status`, `#pricing`; the GitHub link points at the repo.
- `landing-signature`: the commit id `7f3c2a1` is highlighted in lime in all three hero panes. With motion allowed, the
  highlights light up in turn on load (API, laptop, GitHub) and end lime; `shot` uses reduced motion, so it shows the end state.

## How to get to it (user POV)

- Open `/` in a browser.

## Driving it with verify.mjs

Preconditions: baseline.

- **Desktop, light.** Run `node .agents/skills/verify-taru/verify.mjs shot landing-desktop`. The PNG shows the h1 "Source control built for coding agents", the waitlist form and the three panes, and no overflow warning is printed.
- **Phone, dark.** Run `node .agents/skills/verify-taru/verify.mjs shot landing-phone --phone --dark`. Dark backgrounds, the panes stacked, no overflow warning.
- **Structure.** Read `landing-*.aria.txt`. It lists the h2s "Built for teams that run more agents than people", "What works today, and what's next", "Git and GitHub keep working", "Free to self-host. About $5 a month in real use.", "Questions" and "Get an email when there's something to try", and the board's h3s "Works today", "Next" and "Later".

## Gotchas

- The GitHub links point at `kausthubh-coder/taru`, which is private until launch, so they 404 for visitors. `og:image` is relative until there's a domain (TODO in `index.html`).
- Fonts are self-hosted in `public/fonts/`. A missing font shows as a fallback in screenshots, not as an error.
- Colors are `light-dark()` pairs in `shared/ui/theme.css`. The production build rewrites them so they resolve on `:root`; check a build (`bun run preview`) as well as dev when you change the theme.
