// One Durable Object per repository ("<owner>/<repo>"). Holds refs and objects in SQLite,
// with large objects in R2. Implements git-core's Repo contract and runs the Git protocol next to its storage.

import { DurableObject } from "cloudflare:workers";
import type { RemoteError } from "../../git-core/client.ts";
import { readCommitChanges, readLog, type ReadCommitOk, type ReadLogInput, type ReadLogOk } from "../../git-core/history.ts";
import {
	commitChanges,
	mergeBranches,
	readFileAt,
	readTreeAt,
	type CommitChangesInput,
	type CommitChangesOk,
	type MergeInput,
	type MergeOk,
	type OperationError,
	type ReadFileOk,
	type ReadTreeInput,
	type ReadTreeOk,
} from "../../git-core/operations.ts";
import { advertiseRefs, type GitService, receivePack, uploadPack } from "../../git-core/protocol.ts";
import type { GitObject, ObjectType, Oid, RefUpdate, RefUpdateResult, Repo, StoredObject } from "../../git-core/repo.ts";
import { fetchFromRemote, pushToRemote } from "../../git-core/sync.ts";
import { readAll, streamOf } from "./body.ts";
import { authHeadersFor, freshMirrorStatus, MAX_SYNC_OBJECT_BYTES, MAX_SYNC_PACK_BYTES, MIRROR_RETRY_DELAYS_MS, type MirrorState, type MirrorStatus } from "./mirror.logic.ts";

// Objects larger than this are stored in R2 under objects/<oid> instead of inline in SQLite.
// A SQLite row in a Durable Object may be at most 2 MB, so the threshold has to sit below that.
// 512 KiB keeps nearly every source file, tree and commit in SQLite (one synchronous read during a clone,
// no per-request R2 charge) while images, archives and generated files go to R2, which is cheaper per GB.
export const R2_OBJECT_THRESHOLD = 512 * 1024;

export const DEFAULT_HEAD = "refs/heads/main";

/** The documented maximum number of bound parameters per Durable Object SQLite query. */
const SQL_MAX_PARAMS = 100;

/** How long after a ref change the copy is pushed, so the batches of one push become one mirror push. */
const MIRROR_DEBOUNCE_MS = 1000;

export type ImportOutcome =
	| { ok: true; refs: Record<string, Oid>; objects: number; head: string }
	| { ok: false; status: number; error: string };

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS objects (
		oid TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		size INTEGER NOT NULL,
		data BLOB,
		in_r2 INTEGER NOT NULL DEFAULT 0
	);
	CREATE TABLE IF NOT EXISTS refs (
		name TEXT PRIMARY KEY,
		oid TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS meta (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
`;

interface ObjectRow extends Record<string, SqlStorageValue> {
	type: string;
	size: number;
	data: ArrayBuffer | null;
	in_r2: number;
}

export function r2KeyFor(oid: Oid): string {
	return `objects/${oid}`;
}

export class RepoObject extends DurableObject<Env> implements Repo {
	/** Ref changes this instance has queued for the GitHub copy. alarm() compares it before and after a push. */
	private mirrorChanges = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// sql.exec is synchronous, so the schema exists before the first request runs; no blockConcurrencyWhile needed.
		ctx.storage.sql.exec(SCHEMA);
	}

	// --- Lifecycle -------------------------------------------------------------------------------------------

	/** Marks the repo as created and points HEAD at the default branch. Safe to call again. */
	async init(): Promise<void> {
		this.ctx.storage.sql.exec(
			"INSERT OR IGNORE INTO meta (key, value) VALUES ('HEAD', ?), ('created_at', ?)",
			DEFAULT_HEAD,
			new Date().toISOString(),
		);
	}

	// --- Repo contract ---------------------------------------------------------------------------------------

	async hasObjects(oids: Oid[]): Promise<Set<Oid>> {
		const found = new Set<Oid>();
		const unique = [...new Set(oids)];
		for (let i = 0; i < unique.length; i += SQL_MAX_PARAMS) {
			const chunk = unique.slice(i, i + SQL_MAX_PARAMS);
			const placeholders = chunk.map(() => "?").join(",");
			const rows = this.ctx.storage.sql.exec<{ oid: string }>(
				`SELECT oid FROM objects WHERE oid IN (${placeholders})`,
				...chunk,
			);
			for (const row of rows) found.add(row.oid);
		}
		return found;
	}

	async getObject(oid: Oid): Promise<GitObject | undefined> {
		const rows = this.ctx.storage.sql
			.exec<ObjectRow>("SELECT type, size, data, in_r2 FROM objects WHERE oid = ?", oid)
			.toArray();
		if (rows.length === 0) return undefined;
		const row = rows[0];
		const type = row.type as ObjectType;
		if (row.in_r2) {
			const object = await this.env.BLOBS.get(r2KeyFor(oid));
			if (!object) throw new Error(`object ${oid} is recorded in R2 but missing from the bucket`);
			return { type, data: new Uint8Array(await object.arrayBuffer()) };
		}
		if (!row.data) throw new Error(`object ${oid} has no inline data`);
		return { type, data: new Uint8Array(row.data) };
	}

	async putObjects(objects: StoredObject[]): Promise<void> {
		const existing = await this.hasObjects(objects.map((o) => o.oid));
		const fresh = objects.filter((o) => !existing.has(o.oid));
		if (fresh.length === 0) return;

		// R2 writes first (they're the slow, awaited part), then every row in one synchronous transaction.
		// A row that says in_r2 = 1 is only written after its bytes are in the bucket.
		const large = fresh.filter((o) => o.data.byteLength > R2_OBJECT_THRESHOLD);
		await Promise.all(large.map((o) => this.env.BLOBS.put(r2KeyFor(o.oid), o.data)));

		this.ctx.storage.transactionSync(() => {
			for (const o of fresh) {
				if (o.data.byteLength > R2_OBJECT_THRESHOLD) {
					this.ctx.storage.sql.exec(
						"INSERT OR IGNORE INTO objects (oid, type, size, data, in_r2) VALUES (?, ?, ?, NULL, 1)",
						o.oid,
						o.type,
						o.data.byteLength,
					);
				} else {
					this.ctx.storage.sql.exec(
						"INSERT OR IGNORE INTO objects (oid, type, size, data, in_r2) VALUES (?, ?, ?, ?, 0)",
						o.oid,
						o.type,
						o.data.byteLength,
						toArrayBuffer(o.data),
					);
				}
			}
		});
	}

	async listRefs(): Promise<Map<string, Oid>> {
		const refs = new Map<string, Oid>();
		for (const row of this.ctx.storage.sql.exec<{ name: string; oid: string }>("SELECT name, oid FROM refs ORDER BY name")) {
			refs.set(row.name, row.oid);
		}
		return refs;
	}

	async headTarget(): Promise<string> {
		const rows = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'HEAD'").toArray();
		return rows[0]?.value ?? DEFAULT_HEAD;
	}

	async updateRefs(updates: RefUpdate[]): Promise<RefUpdateResult[]> {
		// Compare-and-swap over the whole batch: check every `old` against the current value, and only if all
		// match, write them all. Everything is synchronous SQLite, so nothing can interleave.
		const results = this.ctx.storage.transactionSync(() => {
			const mismatches = new Map<string, string>();
			for (const u of updates) {
				const current = this.currentRef(u.ref);
				if (current !== u.old) {
					mismatches.set(u.ref, `expected ${u.old ?? "no ref"} but found ${current ?? "no ref"}`);
				}
			}
			if (mismatches.size > 0) {
				return updates.map((u) => ({
					ref: u.ref,
					ok: false as const,
					reason: mismatches.get(u.ref) ?? "not applied: another ref in the same update failed",
				}));
			}
			for (const u of updates) {
				if (u.new === null) {
					this.ctx.storage.sql.exec("DELETE FROM refs WHERE name = ?", u.ref);
				} else {
					this.ctx.storage.sql.exec("INSERT OR REPLACE INTO refs (name, oid) VALUES (?, ?)", u.ref, u.new);
				}
			}
			return updates.map((u) => ({ ref: u.ref, ok: true as const }));
		});
		// Every successful ref change, whoever made it (push, import, the agent API), reaches the GitHub copy.
		if (results.every((r) => r.ok) && updates.length > 0 && this.mirrorUrl()) await this.scheduleMirrorPush(MIRROR_DEBOUNCE_MS);
		return results;
	}

	/** Points HEAD at `ref` (e.g. "refs/heads/main"). The ref need not exist yet. */
	async setHead(ref: string): Promise<void> {
		this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('HEAD', ?)", ref);
	}

	private currentRef(name: string): Oid | null {
		const rows = this.ctx.storage.sql.exec<{ oid: string }>("SELECT oid FROM refs WHERE name = ?", name).toArray();
		return rows[0]?.oid ?? null;
	}

	// --- Import from another Git server -----------------------------------------------------------------------

	/** Fills an empty repo from `url` (every branch and tag, HEAD from the remote's symref). The caller validates the URL. */
	async importFrom(url: string): Promise<ImportOutcome> {
		if ((await this.listRefs()).size > 0) return { ok: false, status: 409, error: "repo is not empty; import only fills an empty repo" };
		try {
			const result = await fetchFromRemote(this, url, { headers: authHeadersFor(url, mirrorToken(this.env)), maxPackBytes: MAX_SYNC_PACK_BYTES, maxObjectBytes: MAX_SYNC_OBJECT_BYTES });
			const head = result.head && result.refs.has(result.head) ? result.head : defaultHeadFor(result.refs);
			if (head) await this.setHead(head);
			return { ok: true, refs: Object.fromEntries(result.refs), objects: result.objects, head: head ?? (await this.headTarget()) };
		} catch (error) {
			const status = (error as RemoteError).status;
			return { ok: false, status: status === 413 ? 413 : 502, error: `import from ${url} failed: ${errorMessage(error)}` };
		}
	}

	// --- The GitHub copy: pushed from an alarm after every ref change, with retries -----------------------------

	/** Turns the copy on (pushing right away) or off with null. */
	async setMirror(url: string | null): Promise<MirrorState | null> {
		if (url === null) {
			this.ctx.storage.sql.exec("DELETE FROM meta WHERE key IN ('mirror_url', 'mirror_status')");
			await this.ctx.storage.deleteAlarm();
			return null;
		}
		this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('mirror_url', ?)", url);
		this.writeMirrorStatus(freshMirrorStatus());
		await this.scheduleMirrorPush(0);
		return this.mirrorState();
	}

	async mirrorState(): Promise<MirrorState | null> {
		const url = this.mirrorUrl();
		if (!url) return null;
		return { url, status: this.readMirrorStatus() };
	}

	async alarm(): Promise<void> {
		const url = this.mirrorUrl();
		if (!url) return;
		const status = this.readMirrorStatus();
		status.last_attempt_at = new Date().toISOString();
		status.next_attempt_at = null;
		const changesBefore = this.mirrorChanges;
		let failure: string | null = null;
		// Too big (413) stays too big until the repo shrinks: retrying only burns the next six attempts.
		let tooBig = false;
		try {
			const result = await pushToRemote(this, url, { headers: authHeadersFor(url, mirrorToken(this.env)), maxPackBytes: MAX_SYNC_PACK_BYTES, maxObjectBytes: MAX_SYNC_OBJECT_BYTES });
			const refused = result.results.filter((r) => !r.ok);
			if (refused.length > 0) {
				throw new Error(`remote refused ${refused.map((r) => `${r.ref} (${r.ok ? "" : r.reason})`).join(", ")}`);
			}
			if (result.commands.length > 0) status.last_pushed_refs = Object.fromEntries(result.commands.map((c) => [c.ref, c.new]));
		} catch (error) {
			failure = errorMessage(error);
			tooBig = (error as RemoteError).status === 413;
		}
		if (failure === null) {
			status.state = "ok";
			status.attempts = 0;
			status.last_error = null;
			status.last_success_at = status.last_attempt_at;
		} else {
			status.attempts += 1;
			status.last_error = failure;
		}

		// A ref change during the push already queued the next one (scheduleMirrorPush), which sends everything.
		// Keep that alarm and say so, instead of reporting "ok" or pushing a retry later than it. getAlarm() can't
		// tell us: inside alarm() it still returns this alarm's own time.
		if (this.mirrorChanges !== changesBefore) {
			status.state = "pending";
			status.attempts = 0;
			status.next_attempt_at = new Date((await this.ctx.storage.getAlarm()) ?? Date.now()).toISOString();
			this.writeMirrorStatus(status);
			return;
		}
		if (failure === null) {
			this.writeMirrorStatus(status);
			return;
		}
		const delay = MIRROR_RETRY_DELAYS_MS[status.attempts - 1];
		if (delay === undefined || tooBig) {
			status.state = "failed";
			this.writeMirrorStatus(status);
			console.error(JSON.stringify({ message: "mirror push gave up", url, error: failure }));
			return;
		}
		status.state = "pending";
		status.next_attempt_at = new Date(Date.now() + delay).toISOString();
		this.writeMirrorStatus(status);
		await this.ctx.storage.setAlarm(Date.now() + delay);
	}

	private mirrorUrl(): string | null {
		const rows = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'mirror_url'").toArray();
		return rows[0]?.value ?? null;
	}

	private readMirrorStatus(): MirrorStatus {
		const rows = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'mirror_status'").toArray();
		return rows[0] ? (JSON.parse(rows[0].value) as MirrorStatus) : freshMirrorStatus();
	}

	private writeMirrorStatus(status: MirrorStatus): void {
		this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('mirror_status', ?)", JSON.stringify(status));
	}

	/** A change happened: push after `delayMs`, sooner if a push is already due. Each change starts the retry count over. */
	private async scheduleMirrorPush(delayMs: number): Promise<void> {
		this.mirrorChanges++;
		const status = this.readMirrorStatus();
		status.state = "pending";
		status.attempts = 0;
		const due = Date.now() + delayMs;
		const existing = await this.ctx.storage.getAlarm();
		const at = existing !== null && existing < due ? existing : due;
		status.next_attempt_at = new Date(at).toISOString();
		this.writeMirrorStatus(status);
		await this.ctx.storage.setAlarm(at);
	}

	// --- Git smart HTTP, run here so the protocol's storage calls stay local --------------------------------
	// Bodies and results are streams because RPC messages are capped at 32 MiB and streams are not.

	async gitInfoRefs(service: GitService): Promise<Uint8Array> {
		return advertiseRefs(service, this);
	}

	async gitUploadPack(body: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
		return streamOf(await uploadPack(await readAll(body), this));
	}

	async gitReceivePack(body: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
		return streamOf(await receivePack(await readAll(body), this));
	}

	// --- Agent API: the same operations, over this object's storage. Ref writes go through updateRefs -----

	async agentReadTree(input: ReadTreeInput): Promise<ReadTreeOk | OperationError> {
		return readTreeAt(this, input);
	}

	async agentReadFile(input: ReadTreeInput): Promise<ReadFileOk | OperationError> {
		return readFileAt(this, input);
	}

	async agentCommit(input: CommitChangesInput): Promise<CommitChangesOk | OperationError> {
		return commitChanges(this, input);
	}

	async agentMerge(input: MergeInput): Promise<MergeOk | OperationError> {
		return mergeBranches(this, input);
	}

	async agentReadLog(input: ReadLogInput): Promise<ReadLogOk | OperationError> {
		return readLog(this, input);
	}

	async agentReadCommit(rev: string): Promise<ReadCommitOk | OperationError> {
		return readCommitChanges(this, rev);
	}
}

/**
 * GITHUB_MIRROR_TOKEN is an optional secret (unset in local dev, where the copy goes to a fake GitHub), so it's
 * not in the generated Env type unless .dev.vars has it. Read it by name here, once.
 */
function mirrorToken(env: Env): string | undefined {
	const value: unknown = (env as unknown as Record<string, unknown>).GITHUB_MIRROR_TOKEN;
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** When the remote didn't name a HEAD: main, then master, then the first branch. */
function defaultHeadFor(refs: Map<string, Oid>): string | null {
	for (const candidate of ["refs/heads/main", "refs/heads/master"]) if (refs.has(candidate)) return candidate;
	return [...refs.keys()].find((name) => name.startsWith("refs/heads/")) ?? null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
