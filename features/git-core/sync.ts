// Syncing a Repo with another Git server, in both directions, over the client in client.ts:
//   fetchFromRemote: make this repo's branches and tags equal the remote's (import from GitHub).
//   pushToRemote:    make the remote's branches and tags equal this repo's (the GitHub copy).
// Both only touch refs/heads/* and refs/tags/*; other refs (GitHub's refs/pull/*) are left alone.
// Awaits in loops are deliberate: objects are stored in bounded chunks, one after the other.
/* oxlint-disable no-await-in-loop */

import { type ClientOptions, fetchAdvertisement, fetchObjects, pushPack, remoteError } from "./client.ts";
import { writePack } from "./packWriter.ts";
import { hasMissingReferences, loadObjects } from "./protocol.ts";
import { selectObjects } from "./reachability.ts";
import type { GitObject, Oid, RefUpdate, RefUpdateResult, Repo } from "./repo.ts";

/** Objects per putObjects call: bounds R2 writes in flight and the size of one SQLite transaction. */
const PUT_CHUNK = 500;
/** Haves sent in one fetch; more only makes the request bigger with little to gain. */
const MAX_HAVES = 256;

export interface SyncOptions {
	/** Extra request headers, e.g. Authorization. */
	headers?: Record<string, string>;
	/** Largest pack accepted or sent, in bytes. */
	maxPackBytes: number;
	/**
	 * Largest total size of the objects held in memory at once: the objects a fetched pack unpacks to, or the
	 * objects a pushed pack is built from. This, not the pack size, is what has to fit in a Durable Object.
	 */
	maxObjectBytes: number;
}

export function isSyncedRef(name: string): boolean {
	return name.startsWith("refs/heads/") || name.startsWith("refs/tags/");
}

export interface FetchResult {
	/** The remote's branches and tags, which the repo now has. */
	refs: Map<string, Oid>;
	/** The ref the remote's HEAD points at, or null if it didn't say. */
	head: string | null;
	/** Objects received. */
	objects: number;
	updates: RefUpdate[];
}

export async function fetchFromRemote(repo: Repo, url: string, options: SyncOptions): Promise<FetchResult> {
	const client: ClientOptions = { headers: options.headers, maxResponseBytes: options.maxPackBytes, maxObjectBytes: options.maxObjectBytes };
	const advertisement = await fetchAdvertisement(url, "git-upload-pack", client);
	const refs = new Map([...advertisement.refs].filter(([name]) => isSyncedRef(name)));
	const local = await repo.listRefs();

	const targets = [...new Set(refs.values())];
	const known = await repo.hasObjects(targets);
	const wants = targets.filter((oid) => !known.has(oid));
	const haves = [...new Set(local.values())].slice(0, MAX_HAVES);

	let objects = 0;
	if (wants.length > 0) {
		const packed = await fetchObjects(url, wants, haves, repo, client);
		objects = packed.length;
		const packedOids = new Set(packed.map((object) => object.oid));
		for (const want of wants) if (!packedOids.has(want)) throw remoteError(`remote did not send ${want}`);
		if (await hasMissingReferences(repo, packed, packedOids)) throw remoteError("remote sent a pack with missing objects");
		for (let i = 0; i < packed.length; i += PUT_CHUNK) await repo.putObjects(packed.slice(i, i + PUT_CHUNK));
	}

	const updates: RefUpdate[] = [];
	for (const [name, oid] of refs) {
		if (local.get(name) !== oid) updates.push({ ref: name, old: local.get(name) ?? null, new: oid });
	}
	for (const [name, oid] of local) {
		if (isSyncedRef(name) && !refs.has(name)) updates.push({ ref: name, old: oid, new: null });
	}
	if (updates.length > 0) failIfRejected(await repo.updateRefs(updates), "refs changed while fetching");
	return { refs, head: advertisement.head, objects, updates };
}

export interface PushResult {
	/** What was sent, empty when the remote already matched. */
	commands: RefUpdate[];
	results: RefUpdateResult[];
	objects: number;
}

export async function pushToRemote(repo: Repo, url: string, options: SyncOptions): Promise<PushResult> {
	const client: ClientOptions = { headers: options.headers, maxResponseBytes: options.maxPackBytes, maxObjectBytes: options.maxObjectBytes };
	const advertisement = await fetchAdvertisement(url, "git-receive-pack", client);
	const local = new Map([...(await repo.listRefs())].filter(([name]) => isSyncedRef(name)));
	const remote = new Map([...advertisement.refs].filter(([name]) => isSyncedRef(name)));

	const commands: RefUpdate[] = [];
	for (const [name, oid] of local) {
		if (remote.get(name) !== oid) commands.push({ ref: name, old: remote.get(name) ?? null, new: oid });
	}
	for (const [name, oid] of remote) {
		if (!local.has(name)) commands.push({ ref: name, old: oid, new: null });
	}
	if (commands.length === 0) return { commands, results: [], objects: 0 };

	const wants = [...new Set(commands.map((command) => command.new).filter((oid): oid is Oid => oid !== null))];
	let pack: Uint8Array = new Uint8Array(0);
	let objects = 0;
	if (wants.length > 0) {
		// Whatever the remote already has (any ref, peeled tags included) that we also have is a have.
		const remoteOids = [...new Set([...advertisement.refs.values(), ...advertisement.peeled.values()])];
		const haves = [...(await repo.hasObjects(remoteOids))];
		const oids = await selectObjects(repo, wants, haves, false);
		objects = oids.length;
		pack = await writePack(limitObjectBytes(loadObjects(repo, oids), options.maxObjectBytes), oids.length);
		if (pack.length > options.maxPackBytes) throw remoteError(`pack is ${pack.length} bytes, over the ${options.maxPackBytes} byte limit`, 413);
	}

	const report = await pushPack(url, commands, pack, advertisement.capabilities, client);
	if (report.unpack !== "ok") throw remoteError(`remote could not unpack: ${report.unpack}`);
	return { commands, results: report.results, objects };
}

/** Passes objects through, failing with 413 once their total size passes `maxBytes`, before more are loaded. */
async function* limitObjectBytes(objects: AsyncIterable<GitObject>, maxBytes: number): AsyncGenerator<GitObject> {
	let total = 0;
	for await (const object of objects) {
		total += object.data.length;
		if (total > maxBytes) throw remoteError(`the objects to push are over the ${maxBytes} byte limit`, 413);
		yield object;
	}
}

function failIfRejected(results: RefUpdateResult[], what: string): void {
	const rejected = results.filter((result) => !result.ok);
	if (rejected.length > 0) throw new Error(`${what}: ${rejected.map((result) => `${result.ref} ${result.ok ? "" : result.reason}`).join(", ")}`);
}
