// Git smart HTTP protocol, server side. The three entry points the HTTP layer calls.
// Bodies are buffered Uint8Arrays for now; requests are capped by the caller.

import type { Repo } from "./repo.ts";

export type GitService = "git-upload-pack" | "git-receive-pack";

/** Body for GET /info/refs?service=<service> (content type application/x-<service>-advertisement). */
export async function advertiseRefs(_service: GitService, _repo: Repo): Promise<Uint8Array> {
	throw new Error("not implemented");
}

/** Body for POST /git-upload-pack (clone and fetch). Content type application/x-git-upload-pack-result. */
export async function uploadPack(_requestBody: Uint8Array, _repo: Repo): Promise<Uint8Array> {
	throw new Error("not implemented");
}

/** Body for POST /git-receive-pack (push). Content type application/x-git-receive-pack-result. */
export async function receivePack(_requestBody: Uint8Array, _repo: Repo): Promise<Uint8Array> {
	throw new Error("not implemented");
}
