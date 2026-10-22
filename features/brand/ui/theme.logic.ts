// Reads tokens out of shared/ui/theme.css for the brand kit: the color roles with their light and dark values, the
// color math it shows (OKLCH to sRGB hex, WCAG contrast) and the type sizes. The brand page and the theme's
// contrast test both use it, so the numbers on /brand/ are computed from the file the site actually loads.

export type Scheme = "light" | "dark";
export type ColorRole = { name: string; light: string; dark: string };

// Every custom property in the theme whose value is a color: light-dark(a, b), oklch(...), transparent, or a
// var() pointing at another color role.
export function parseColorRoles(css: string): ColorRole[] {
	const raw = new Map<string, string>();
	for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) raw.set(match[1], match[2].trim());

	const roles: ColorRole[] = [];
	const resolve = (value: string, scheme: Scheme, depth = 0): string | null => {
		if (depth > 8) return null;
		const reference = value.match(/^var\(--([a-z0-9-]+)\)$/);
		if (reference) {
			const target = raw.get(reference[1]);
			return target === undefined ? null : resolve(target, scheme, depth + 1);
		}
		if (value.startsWith("light-dark(") && value.endsWith(")")) {
			const [light, dark] = splitTopLevel(value.slice("light-dark(".length, -1));
			if (light === undefined || dark === undefined) return null;
			return resolve(scheme === "light" ? light : dark, scheme, depth + 1);
		}
		if (value.startsWith("oklch(") || value === "transparent") return value;
		return null;
	};

	for (const [name, value] of raw) {
		const light = resolve(value, "light");
		const dark = resolve(value, "dark");
		if (light && dark) roles.push({ name, light, dark });
	}
	return roles;
}

// Splits "a, b(c, d), e" on the commas that aren't inside parentheses.
function splitTopLevel(list: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < list.length; i++) {
		const ch = list[i];
		if (ch === "(") depth++;
		else if (ch === ")") depth--;
		else if (ch === "," && depth === 0) {
			parts.push(list.slice(start, i).trim());
			start = i + 1;
		}
	}
	parts.push(list.slice(start).trim());
	return parts;
}

export type Rgb = { r: number; g: number; b: number; alpha: number };

// oklch(L C H) with L as 0-1 or a percentage, to sRGB channels 0-1 (clamped to the sRGB gamut).
export function oklchToRgb(value: string): Rgb {
	if (value === "transparent") return { r: 0, g: 0, b: 0, alpha: 0 };
	const match = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
	if (!match) throw new Error(`not an oklch() color: ${value}`);
	const lightness = Number(match[1]) / (match[2] ? 100 : 1);
	const chroma = Number(match[3]);
	const hue = (Number(match[4]) * Math.PI) / 180;
	const a = chroma * Math.cos(hue);
	const b = chroma * Math.sin(hue);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	const [r, g, bl] = linear.map((c) => {
		const x = Math.min(Math.max(c, 0), 1);
		return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
	});
	return { r, g, b: bl, alpha: 1 };
}

export function toHex({ r, g, b, alpha }: Rgb): string {
	if (alpha === 0) return "transparent";
	return `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}

// WCAG 2 contrast ratio between two opaque colors, 1 to 21.
export function contrast(foreground: Rgb, background: Rgb): number {
	const a = luminance(foreground);
	const b = luminance(background);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance({ r, g, b }: Rgb): number {
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// An sRGB channel, 0 to 1, as linear light.
function toLinear(channel: number): number {
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

// A size token as px at its smallest and largest: "0.75rem" is 12 to 12, "clamp(2.75rem, 1.5rem + 4.9vw, 5.75rem)"
// is 44 to 92. Anything else is null. Assumes the browser default of 16px to the rem.
export function sizeRangePx(css: string, name: string): { min: number; max: number } | null {
	const value = css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
	if (!value) return null;
	const clamp = value.match(/^clamp\(([^,]+),[^,]+,([^,]+)\)$/);
	const min = lengthPx(clamp ? clamp[1] : value);
	const max = lengthPx(clamp ? clamp[2] : value);
	return min === null || max === null ? null : { min, max };
}

function lengthPx(length: string): number | null {
	const match = length.trim().match(/^([\d.]+)(rem|px)$/);
	if (!match) return null;
	return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}
