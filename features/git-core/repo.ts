// The contract between the Git engine (this folder) and whatever stores a repository.
// git-core never imports Cloudflare APIs: repo-store implements this over Durable Object SQLite and R2,
// and tests implement it in memory. Keep this file small; every storage backend has to implement all of it.

/** A 40-character lowercase hex SHA-1 object id. */
export type Oid = string;

export type ObjectType = "commit" | "tree" | "blob" | "tag";

export interface GitObject {
	type: ObjectType;
	/** The object body, without the "<type> <size>\0" header. */
	data: Uint8Array;
}

export interface StoredObject extends GitObject {
	oid: Oid;
}

/** One ref change from a push. `old`/`new` null mean "did not exist" / "delete". */
export interface RefUpdate {
	ref: string;
	old: Oid | null;
	new: Oid | null;
}

export type RefUpdateResult = { ref: string; ok: true } | { ref: string; ok: false; reason: string };

export interface Repo {
	/** Returns the subset of `oids` this repo already has. */
	hasObjects(oids: Oid[]): Promise<Set<Oid>>;
	getObject(oid: Oid): Promise<GitObject | undefined>;
	/** Stores objects. Ids are trusted: callers compute them from the content. Must be idempotent. */
	putObjects(objects: StoredObject[]): Promise<void>;

	/** Every ref, e.g. "refs/heads/main" -> oid. HEAD is not included. */
	listRefs(): Promise<Map<string, Oid>>;
	/** The ref HEAD points at, e.g. "refs/heads/main". It may not exist yet in an empty repo. */
	headTarget(): Promise<string>;
	/**
	 * Applies updates atomically: either every update's `old` matches the current value and all apply,
	 * or none apply and each result says why.
	 */
	updateRefs(updates: RefUpdate[]): Promise<RefUpdateResult[]>;
}
