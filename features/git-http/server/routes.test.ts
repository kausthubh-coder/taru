import { describe, expect, it } from "vitest";
import { matchGitPath } from "./routes.ts";

describe("matchGitPath", () => {
	it("splits owner, repo and the endpoint after .git", () => {
		expect(matchGitPath("/kaust/taru.git/info/refs")).toEqual({ owner: "kaust", repo: "taru", rest: "/info/refs" });
		expect(matchGitPath("/kaust/taru.git")).toEqual({ owner: "kaust", repo: "taru", rest: "" });
	});

	it("ignores paths that are not git URLs", () => {
		expect(matchGitPath("/api/repos")).toBeNull();
		expect(matchGitPath("/kaust/taru")).toBeNull();
		expect(matchGitPath("/a/b/c.git/info/refs")).toBeNull();
	});
});
