// Rebuilds the raster brand files from their sources, so a change to the logo is one command:
//
//   node scripts/brand-assets.mjs
//
// Sources: public/brand/taru-icon.svg (rounded tile), public/brand/taru-icon-maskable.svg (full bleed) and the
// social card drawn below with the site's own fonts. Writes the PNG icons, favicon.ico and og.png into public/.
// Uses Playwright's Chromium, which the verify skill already installs.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const pub = join(root, "public");
const svg = (name) => readFileSync(join(pub, "brand", name), "utf8");
// Inlined: a page made with setContent is about:blank, which can't load file:// URLs.
const font = (file) => `data:font/woff2;base64,${readFileSync(join(pub, "fonts", file)).toString("base64")}`;

// [output file, source svg, size]
const icons = [
	["favicon-16.png", "taru-icon.svg", 16],
	["favicon-32.png", "taru-icon.svg", 32],
	["favicon-48.png", "taru-icon.svg", 48],
	["icon-192.png", "taru-icon.svg", 192],
	["icon-512.png", "taru-icon.svg", 512],
	["icon-maskable-512.png", "taru-icon-maskable.svg", 512],
	["apple-touch-icon.png", "taru-icon-maskable.svg", 180],
];

const browser = await chromium.launch();
try {
	// Each icon renders in its own page, at exactly its size.
	const rendered = new Map(
		await Promise.all(
			icons.map(async ([file, source, size]) => {
				const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
				await page.setContent(
					`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(source)}`,
				);
				return [file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })];
			}),
		),
	);
	// The 16 to 48px renders only go into favicon.ico.
	for (const [file, png] of rendered) if (!file.startsWith("favicon-")) writeFileSync(join(pub, file), png);
	writeFileSync(join(pub, "favicon.ico"), ico([16, 32, 48].map((s) => [s, rendered.get(`favicon-${s}.png`)])));

	// Social card, 1200x630: the headline and the same commit in three places, as on the landing page, with the
	// status line a link preview needs because it has no caption.
	const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
	await page.setContent(ogCard(), { waitUntil: "load" });
	await page.evaluate(() => document.fonts.ready);
	writeFileSync(join(pub, "og.png"), await page.screenshot({ type: "png" }));
} finally {
	await browser.close();
}
console.warn("wrote public/favicon.ico, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, og.png");

// An .ico file with PNG images inside, which every browser since IE 11 reads.
function ico(images) {
	const header = Buffer.alloc(6 + 16 * images.length);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(([size, png], i) => {
		const entry = 6 + 16 * i;
		header.writeUInt8(size, entry);
		header.writeUInt8(size, entry + 1);
		header.writeUInt8(0, entry + 2);
		header.writeUInt8(0, entry + 3);
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(png.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += png.length;
	});
	return Buffer.concat([header, ...images.map(([, png]) => png)]);
}

function ogCard() {
	const logo = svg("taru-logo-dark.svg").replace(/<svg /, '<svg class="logo" ');
	return `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "Instrument Sans"; src: url("${font("instrument-sans-latin-wght.woff2")}") format("woff2"); font-weight: 400 700; }
@font-face { font-family: "JetBrains Mono"; src: url("${font("jetbrains-mono-latin-wght.woff2")}") format("woff2"); font-weight: 100 800; }
html, body { margin: 0; width: 1200px; height: 630px; background: #0d0e0b; color: #edefea; }
body { box-sizing: border-box; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; font-family: "Instrument Sans"; }
.logo { width: auto; height: 44px; }
h1 { margin: 0; font-size: 84px; font-weight: 600; line-height: 0.98; letter-spacing: -0.03em; max-width: 13ch; }
.places { display: flex; gap: 16px; font-family: "JetBrains Mono"; font-size: 22px; color: #a3a69e; }
.place { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border: 1px solid #292b26; border-radius: 12px; background: #141512; }
.sha { color: #131809; background: #c4f252; border-radius: 4px; padding: 1px 6px; font-weight: 600; }
.status { margin: 20px 0 0; font-size: 24px; color: #a3a69e; }
</style>
<div>${logo}</div>
<h1>Source control built for coding agents</h1>
<div>
	<div class="places">
		<div class="place">agent API <span class="sha">7f3c2a1</span></div>
		<div class="place">git pull <span class="sha">7f3c2a1</span></div>
		<div class="place">GitHub <span class="sha">7f3c2a1</span></div>
	</div>
	<p class="status">Plain git works today. The GitHub copy and the agent API are being built.</p>
</div>`;
}
