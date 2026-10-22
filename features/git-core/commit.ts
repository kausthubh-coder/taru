// Building commits on the server, so an agent can change a branch without a checkout.

import { hashObject, serializeCommit } from "./objects.ts";
import type { Oid, StoredObject } from "./repo.ts";

export interface Ident {
	name: string;
	email: string;
}

export const TARU_IDENT: Ident = { name: "Taru", email: "agent@taru.dev" };

export interface CommitInput {
	tree: Oid;
	parents: Oid[];
	author: Ident;
	committer?: Ident;
	/** Unix seconds. Defaults to now. */
	time?: number;
	message: string;
}

/** Idents are written in UTC: a server has no timezone worth recording. */
export function formatIdent(ident: Ident, time: number): string {
	return `${clean(ident.name)} <${clean(ident.email)}> ${time} +0000`;
}

function clean(value: string): string {
	return value.replaceAll(/[<>\n]/g, "").trim();
}

export async function buildCommit(input: CommitInput): Promise<StoredObject> {
	const time = input.time ?? Math.floor(Date.now() / 1000);
	const message = input.message.endsWith("\n") ? input.message : `${input.message}\n`;
	const data = serializeCommit({
		tree: input.tree,
		parents: input.parents,
		author: formatIdent(input.author, time),
		committer: formatIdent(input.committer ?? input.author, time),
		extraHeaders: [],
		message,
	});
	return { type: "commit", data, oid: await hashObject({ type: "commit", data }) };
}
