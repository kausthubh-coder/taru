# Brand kit

The page at `/brand/`: the name, the logo files with their downloads, the color roles with hex values and
contrast for light and dark, the type scale, space and shape, the shared components in both schemes, the
signature, voice and logo misuse. Static HTML (`brand/index.html`), CSS (`features/brand/ui/brand.css`) and one
script (`features/brand/ui/brand.ts`) that reads `shared/ui/theme.css` to fill in the colors and sizes.

## Sub-features

- `brand-render`: every section renders, with no horizontal scroll at 390px and 1440px.
- `brand-tokens`: each color row shows two swatches with hex values and a contrast ratio, and the type rows show
  their size range. These come from the script; empty cells mean it failed.
- `brand-schemes`: the "In use" section shows a light panel and a dark panel whatever the system setting.
- `brand-files`: every link in the Files table downloads a file that exists (200).

## How to get to it (user POV)

- Open `/brand/`, or follow "Brand kit" in the landing page's footer.

## Driving it with verify.mjs

Preconditions: baseline.

- **Desktop, dark.** Run `node .agents/skills/verify-taru/verify.mjs shot brand-desktop --dark --path brand/`. The PNG shows filled color tables (swatches, `#c4f252` on the accent row), and a light "In use" panel next to a dark one. No overflow warning.
- **Phone, light.** Run `node .agents/skills/verify-taru/verify.mjs shot brand-phone --phone --path brand/`. Tables stack into lists, no overflow warning.
- **Files.** `curl -s -o /dev/null -w "%{http_code}"` each link in the Files table; all answer 200.

## Gotchas

- The page's numbers are computed in the browser from `theme.css` (`?raw` import). If you rename a role or size
  there, update the matching `data-role`, `data-against` or `data-size` in `brand/index.html`;
  `features/brand/ui/theme.logic.test.ts` fails until you do.
- The same test fails when a token change breaks text contrast in either scheme.
- Without JavaScript the page shows text only: the swatches, numbers and fixed light and dark panels come from
  `brand.ts`.
