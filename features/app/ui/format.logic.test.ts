import { expect, test } from "vitest";
import { unifiedDiff } from "../../git-core/history.ts";
import { firstLine, formatBytes, imageType, messageBody, parsePatch, sortEntries } from "./format.logic.ts";

test("parsePatch numbers each line from the hunk headers", () => {
	const { patch } = unifiedDiff("a\nb\nc\nd\n", "a\nB\nc\nd\ne");
	expect(parsePatch(patch).map((l) => [l.kind, l.old, l.new, l.text])).toEqual([
		["hunk", null, null, "@@ -1,4 +1,5 @@"],
		["context", 1, 1, "a"],
		["del", 2, null, "b"],
		["add", null, 2, "B"],
		["context", 3, 3, "c"],
		["context", 4, 4, "d"],
		["add", null, 5, "e"],
		["note", null, null, "No newline at end of file"],
	]);
});

test("parsePatch on an added file starts the new side at 1", () => {
	expect(parsePatch(unifiedDiff("", "x\n").patch).map((l) => [l.kind, l.old, l.new])).toEqual([
		["hunk", null, null],
		["add", null, 1],
	]);
});

test("messages, sizes, images and entry order", () => {
	expect(firstLine("Fix total\n\nBecause")).toBe("Fix total");
	expect(messageBody("Fix total\n\nBecause\n")).toBe("Because");
	expect(messageBody("One line\n")).toBe("");
	expect([formatBytes(12), formatBytes(2048), formatBytes(3 * 1024 * 1024)]).toEqual(["12 B", "2.0 KB", "3.0 MB"]);
	expect([imageType("media/Logo.PNG"), imageType("a.ts")]).toEqual(["image/png", null]);
	const sorted = sortEntries([
		{ name: "b10.ts", type: "file" },
		{ name: "src", type: "dir" },
		{ name: "b2.ts", type: "file" },
		{ name: "Assets", type: "dir" },
	]);
	expect(sorted.map((e) => e.name)).toEqual(["Assets", "src", "b2.ts", "b10.ts"]);
});
