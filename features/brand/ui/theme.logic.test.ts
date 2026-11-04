import { describe, expect, test } from "vitest";
import appCss from "../../app/ui/app.css?raw";
import docsCss from "../../docs/ui/docs.css?raw";
import proseCss from "../../../shared/ui/prose.css?raw";
import page from "../../../brand/index.html?raw";
import theme from "../../../shared/ui/theme.css?raw";
import { contrast, oklchToRgb, parseColorRoles, sizeRangePx, toHex, type Scheme } from "./theme.logic.ts";

const roles = new Map(parseColorRoles(theme).map((role) => [role.name, role]));
const color = (name: string, scheme: Scheme) => {
	const role = roles.get(name);
	if (!role) throw new Error(`--${name} is not a color role in theme.css`);
	return oklchToRgb(role[scheme]);
};
// The values of one data attribute across brand/index.html.
const named = (attribute: string) => [...page.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map((match) => match[1]);

describe("parseColorRoles", () => {
	test("reads both schemes of a light-dark() role", () => {
		expect(roles.get("page")).toEqual({
			name: "page",
			light: "oklch(0.985 0.004 110)",
			dark: "oklch(0.16 0.006 125)",
		});
	});

	test("a single value serves both schemes", () => {
		expect(roles.get("accent")).toEqual({ name: "accent", light: "oklch(0.9 0.19 124)", dark: "oklch(0.9 0.19 124)" });
	});

	test("follows var() to the role it points at", () => {
		expect(roles.get("focus")).toEqual({ name: "focus", light: roles.get("text")!.light, dark: roles.get("text")!.dark });
	});

	test("keeps transparent and skips values that aren't colors", () => {
		expect(roles.get("mark-ring")?.dark).toBe("transparent");
		expect(roles.has("radius-card")).toBe(false);
		expect(roles.has("font-mono")).toBe(false);
	});

	test("reads a light-dark() written on one line in plain CSS", () => {
		expect(parseColorRoles(":root { --x: light-dark(oklch(1 0 0), oklch(0 0 0)); --y: 8px; }")).toEqual([
			{ name: "x", light: "oklch(1 0 0)", dark: "oklch(0 0 0)" },
		]);
	});
});

describe("color math", () => {
	test("converts the brand colors to the hex values the brand kit lists", () => {
		expect(toHex(color("accent", "light"))).toBe("#c4f252");
		expect(toHex(color("page", "light"))).toBe("#fafaf7");
		expect(toHex(color("page", "dark"))).toBe("#0d0e0b");
		expect(toHex(oklchToRgb("transparent"))).toBe("transparent");
	});

	test("contrast runs from 1 (same color) to 21 (black on white)", () => {
		expect(contrast(oklchToRgb("oklch(1 0 0)"), oklchToRgb("oklch(0 0 0)"))).toBeCloseTo(21, 1);
		expect(contrast(oklchToRgb("oklch(0.5 0.1 200)"), oklchToRgb("oklch(0.5 0.1 200)"))).toBe(1);
	});

	test("matches the ratios WCAG tools give for known pairs", () => {
		const white = { r: 1, g: 1, b: 1, alpha: 1 };
		const gray = 0x76 / 255;
		expect(contrast({ r: gray, g: gray, b: gray, alpha: 1 }, white)).toBeCloseTo(4.54, 2);
		expect(contrast({ r: 1, g: 0, b: 0, alpha: 1 }, white)).toBeCloseTo(4, 2);
	});
});

// brand/index.html names roles and sizes in data attributes, and brand.ts throws, or leaves a cell blank, for a name
// theme.css doesn't have. A renamed token fails here instead of on the page.
describe("brand/index.html", () => {
	test("every color role it names is in theme.css", () => {
		const names = [...named("data-role"), ...named("data-against")];
		expect(names.length).toBeGreaterThan(20);
		expect(names.filter((name) => !roles.has(name))).toEqual([]);
	});

	test("every size it names is in theme.css", () => {
		const names = named("data-size");
		expect(names.length).toBeGreaterThan(5);
		expect(names.filter((name) => sizeRangePx(theme, name) === null)).toEqual([]);
	});
});

describe("sizeRangePx", () => {
	test("reads a fixed rem size and a fluid clamp() size as px", () => {
		expect(sizeRangePx(theme, "text-label")).toEqual({ min: 12, max: 12 });
		expect(sizeRangePx(theme, "text-display")).toEqual({ min: 44, max: 92 });
	});

	test("is null for a token that isn't a size", () => {
		expect(sizeRangePx(theme, "page")).toBeNull();
		expect(sizeRangePx(theme, "no-such-token")).toBeNull();
	});
});

// The theme's promise: every text and control color stays readable in both schemes. A token change that breaks
// one of these fails here, before anyone sees it.
describe.each<Scheme>(["light", "dark"])("theme contrast, %s", (scheme) => {
	test.each([
		["text", "page", 4.5],
		["text", "surface", 4.5],
		["text-muted", "page", 4.5],
		["text-muted", "surface", 4.5],
		["text-muted", "surface-sunken", 4.5],
		["text-muted", "fill", 4.5],
		["accent-text", "page", 4.5],
		["on-accent", "accent", 4.5],
		["on-accent", "accent-hover", 4.5],
		["success", "page", 4.5],
		["danger", "page", 4.5],
		["diff-add", "surface", 4.5],
		["diff-del", "surface", 4.5],
		["text-faint", "page", 4.5],
		["text-faint", "surface", 4.5],
		["text-faint", "surface-sunken", 4.5],
		["line-input", "page", 3],
		["line-input", "surface", 3],
	])("--%s on --%s is at least %s:1", (foreground, background, minimum) => {
		expect(contrast(color(foreground, scheme), color(background, scheme))).toBeGreaterThanOrEqual(minimum);
	});
});

// AGENTS.md: components use only the role tokens in theme.css, never raw colors or sizes. These style sheets
// keep to it. Media queries are the exception: CSS can't read a custom property there.
describe.each([
	["app.css", appCss],
	["docs.css", docsCss],
	["prose.css", proseCss],
])("%s", (_file, source) => {
	const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
	const declarations = css.split("\n").filter((line) => !line.trimStart().startsWith("@media"));

	test("has no raw sizes or colors", () => {
		const raw = /(?<![\w-])\d*\.?\d+(px|rem|em|ch|vw|vh)\b|#[0-9a-f]{3,8}\b|\b(rgb|hsl|oklch|lab)a?\(/i;
		expect(declarations.filter((line) => raw.test(line.replace(/color-mix\(in oklch/g, "")))).toEqual([]);
	});

	test("names only tokens theme.css defines", () => {
		const defined = new Set([...theme.matchAll(/^\s*--([\w-]+):/gm)].map((match) => match[1]));
		const used = [...css.matchAll(/var\(--([\w-]+)\)/g)].map((match) => match[1]);
		// An empty string here would mean Vitest wasn't told to load this file (vitest.config.ts css.include).
		expect(used.length).toBeGreaterThan(10);
		expect(used.filter((name) => !defined.has(name))).toEqual([]);
	});
});
