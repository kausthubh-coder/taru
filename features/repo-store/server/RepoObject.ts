// One Durable Object per repository ("<owner>/<repo>"). Holds refs and objects in SQLite,
// with large objects in R2. Implements git-core's Repo contract and runs the Git protocol next to its storage.

import { DurableObject } from "cloudflare:workers";
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
import { readAll, streamOf } from "./body.ts";

// Objects larger than this are stored in R2 under objects/<oid> instead of inline in SQLite.
// A SQLite row in a Durable Object may be at most 2 MB, so the threshold has to sit below that.
// 512 KiB keeps nearly every source file, tree and commit in SQLite (one synchronous read during a clone,
// no per-request R2 charge) while images, archives and generated files go to R2, which is cheaper per GB.
export const R2_OBJECT_THRESHOLD = 512 * 1024;

export const DEFAULT_HEAD = "refs/heads/main";

/** The documented maximum number of bound parameters per Durable Object SQLite query. */
const SQL_MAX_PARAMS = 100;

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
		return this.ctx.storage.transactionSync(() => {
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
	}

	private currentRef(name: string): Oid | null {
		const rows = this.ctx.storage.sql.exec<{ oid: string }>("SELECT oid FROM refs WHERE name = ?", name).toArray();
		return rows[0]?.oid ?? null;
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
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
