// A Repo that lives in a Map. Used by tests; it is also the reference for what repo-store has to implement.

import { ZERO_OID } from "./objects.ts";
import type { GitObject, Oid, RefUpdate, RefUpdateResult, Repo, StoredObject } from "./repo.ts";

export class MemoryRepo implements Repo {
	readonly objects = new Map<Oid, GitObject>();
	readonly refs = new Map<string, Oid>();
	head = "refs/heads/main";

	async hasObjects(oids: Oid[]): Promise<Set<Oid>> {
		return new Set(oids.filter((oid) => this.objects.has(oid)));
	}

	async getObject(oid: Oid): Promise<GitObject | undefined> {
		return this.objects.get(oid);
	}

	async putObjects(objects: StoredObject[]): Promise<void> {
		for (const object of objects) this.objects.set(object.oid, { type: object.type, data: object.data });
	}

	async listRefs(): Promise<Map<string, Oid>> {
		return new Map(this.refs);
	}

	async headTarget(): Promise<string> {
		return this.head;
	}

	async updateRefs(updates: RefUpdate[]): Promise<RefUpdateResult[]> {
		const results: RefUpdateResult[] = updates.map((update) => {
			const current = this.refs.get(update.ref) ?? null;
			if (current === update.old) return { ref: update.ref, ok: true };
			return { ref: update.ref, ok: false, reason: `failed to update ref: expected ${update.old ?? ZERO_OID}, is ${current ?? ZERO_OID}` };
		});
		if (results.some((result) => !result.ok)) {
			return results.map((result) => (result.ok ? { ref: result.ref, ok: false, reason: "atomic update failed" } : result));
		}
		for (const update of updates) {
			if (update.new === null) this.refs.delete(update.ref);
			else this.refs.set(update.ref, update.new);
		}
		return results;
	}
}
