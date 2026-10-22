// Brand kit page (/brand/). Everything it shows about color and type is read from shared/ui/theme.css, the file
// the site loads, so the kit can't drift from the product. Without this script the text still reads, but the
// swatches, hex values, contrast numbers, type sizes and the fixed light and dark panels all come from it.
import theme from "../../../shared/ui/theme.css?raw";
import { contrast, oklchToRgb, parseColorRoles, sizeRangePx, toHex, type ColorRole, type Scheme } from "./theme.logic.ts";

const roles = new Map(parseColorRoles(theme).map((entry) => [entry.name, entry]));
const schemes: Scheme[] = ["light", "dark"];

function role(name: string): ColorRole {
	const found = roles.get(name);
	if (!found) throw new Error(`--${name} is not a color role in shared/ui/theme.css`);
	return found;
}

// Panels marked data-scheme-panel show their contents in one scheme whatever the system setting, by setting every
// color role on the panel itself. (The build rewrites light-dark() so it resolves on :root, so a nested
// color-scheme alone wouldn't switch the roles.)
for (const panel of document.querySelectorAll<HTMLElement>("[data-scheme-panel]")) {
	const scheme = panel.dataset.schemePanel as Scheme;
	for (const { name, light, dark } of roles.values()) panel.style.setProperty(`--${name}`, scheme === "light" ? light : dark);
	panel.style.colorScheme = scheme;
}

// Color table: each row names a role; the script fills a swatch, the hex value and the contrast that matters for
// that role in each scheme. data-against names the color it's read on (default --page); data-under puts the role
// under that color instead, for fills that carry text.
for (const row of document.querySelectorAll<HTMLElement>("[data-role]")) {
	const name = row.dataset.role!;
	const against = row.dataset.against ?? "page";
	// A bare attribute: its dataset value is "", so test for its presence.
	const under = row.hasAttribute("data-under");
	for (const scheme of schemes) {
		const cell = row.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`);
		if (!cell) continue;
		const value = role(name)[scheme];
		const rgb = oklchToRgb(value);
		const swatch = document.createElement("span");
		swatch.className = "swatch";
		swatch.style.background = value;
		swatch.style.setProperty("--swatch-ground", role("page")[scheme]);
		const hex = document.createElement("code");
		hex.textContent = toHex(rgb);
		cell.replaceChildren(swatch, hex);
		if (rgb.alpha > 0 && name !== against) {
			const other = oklchToRgb(role(against)[scheme]);
			const ratio = under ? contrast(other, rgb) : contrast(rgb, other);
			const note = document.createElement("span");
			note.className = "ratio";
			note.textContent = `${ratio.toFixed(1)}:1`;
			note.title = under ? `--${against} on --${name}` : `--${name} on --${against}`;
			cell.append(note);
		}
	}
}

// "In use": the same sample of shared components in a light panel and a dark one. Each copy gets its own field id.
const sample = document.querySelector<HTMLTemplateElement>("#kit-sample");
for (const panel of document.querySelectorAll<HTMLElement>(".kit-panel")) {
	if (!sample) break;
	const scheme = panel.dataset.schemePanel ?? "light";
	const copy = sample.content.cloneNode(true) as DocumentFragment;
	const title = copy.querySelector(".label");
	if (title) title.textContent = scheme === "dark" ? "Dark" : "Light";
	const input = copy.querySelector("input");
	const label = copy.querySelector("label");
	if (input && label) {
		input.id = `kit-email-${scheme}`;
		label.htmlFor = input.id;
	}
	panel.replaceChildren(copy);
}

// Type table: each size token's range in px, from a phone to a desktop.
for (const row of document.querySelectorAll<HTMLElement>("[data-size]")) {
	const name = row.dataset.size!;
	const range = sizeRangePx(theme, name);
	const rangeCell = row.querySelector<HTMLElement>("[data-size-range]");
	if (range && rangeCell) rangeCell.textContent = range.min === range.max ? `${range.min}px` : `${range.min} to ${range.max}px`;
}
