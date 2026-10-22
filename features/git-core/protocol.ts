// Git smart HTTP protocol, server side (gitprotocol-pack(5), gitprotocol-http(5)), protocol v0/v1 only.
// The three entry points the HTTP layer calls. Bodies are buffered Uint8Arrays for now; requests are capped
// by the caller. Each POST is one stateless round: the client resends its state, so nothing is kept between calls.
// Malformed requests throw; refusals git understands come back as "ERR" packets or "ng" report lines.
// Awaits in loops are deliberate: ACKs must come out in request order, and the store is single-threaded.
/* oxlint-disable no-await-in-loop */

import { decodeText, isHexOid } from "./bytes.ts";
import { parseCommit, parseTag, parseTree, ZERO_OID } from "./objects.ts";
import { readPack } from "./packReader.ts";
import { writePack } from "./packWriter.ts";
import { PktReader, PktWriter } from "./pktline.ts";
import { allWantsReachHaves, selectObjects } from "./reachability.ts";
import type { GitObject, Oid, RefUpdate, Repo, StoredObject } from "./repo.ts";

export type GitService = "git-upload-pack" | "git-receive-pack";

const AGENT = "agent=taru/0.1";
const UPLOAD_PACK_CAPABILITIES = ["multi_ack_detailed", "side-band-64k", "ofs-delta", "no-progress", "include-tag"];
const RECEIVE_PACK_CAPABILITIES = ["report-status", "delete-refs", "side-band-64k", "quiet", "atomic", "ofs-delta"];

/** Body for GET /info/refs?service=<service> (content type application/x-<service>-advertisement). */
export async function advertiseRefs(service: GitService, repo: Repo): Promise<Uint8Array> {
	const out = new PktWriter();
	out.line(`# service=${service}\n`);
	out.flush();

	const refs = [...(await repo.listRefs())].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const head = await repo.headTarget();
	const headOid = refs.find(([name]) => name === head)?.[1];

	const capabilities = [...(service === "git-upload-pack" ? UPLOAD_PACK_CAPABILITIES : RECEIVE_PACK_CAPABILITIES)];
	// symref tells a cloning client which branch to check out.
	if (headOid) capabilities.push(`symref=HEAD:${head}`);
	capabilities.push(AGENT);

	const lines: string[] = [];
	if (headOid) lines.push(`${headOid} HEAD`);
	for (const [name, oid] of refs) {
		lines.push(`${oid} ${name}`);
		// upload-pack also shows what an annotated tag points at, so clients can want the peeled commit.
		if (service === "git-upload-pack" && name.startsWith("refs/tags/")) {
			const peeled = await peelToNonTag(repo, oid);
			if (peeled && peeled !== oid) lines.push(`${peeled} ${name}^{}`);
		}
	}

	if (lines.length === 0) {
		out.line(`${ZERO_OID} capabilities^{}\0${capabilities.join(" ")}\n`);
	} else {
		out.line(`${lines[0]}\0${capabilities.join(" ")}\n`);
		for (const line of lines.slice(1)) out.line(`${line}\n`);
	}
	out.flush();
	return out.bytes();
}

/** Body for POST /git-upload-pack (clone and fetch). Content type application/x-git-upload-pack-result. */
export async function uploadPack(requestBody: Uint8Array, repo: Repo): Promise<Uint8Array> {
	const reader = new PktReader(requestBody);
	const wants: Oid[] = [];
	const haves: Oid[] = [];
	let capabilities = new Set<string>();
	let done = false;

	// First section: wants (the first one carries the capabilities) up to a flush.
	for (;;) {
		const pkt = reader.next();
		if (!pkt || pkt.kind === "flush") break;
		if (pkt.kind !== "data") throw new Error("unexpected packet in want list");
		const line = chomp(decodeText(pkt.data));
		if (line.startsWith("want ")) {
			const [oid, ...caps] = line.slice(5).split(" ");
			if (!isHexOid(oid)) throw new Error(`invalid want line: ${line}`);
			if (wants.length === 0) capabilities = new Set(caps.filter((cap) => cap.length > 0));
			wants.push(oid);
		} else if (line.startsWith("shallow ") || line.startsWith("deepen")) {
			return errorPacket("shallow clones are not supported");
		} else if (line.startsWith("filter ")) {
			return errorPacket("object filters are not supported");
		} else if (line === "done") {
			done = true;
			break;
		} else {
			throw new Error(`unexpected line in want list: ${line}`);
		}
	}
	if (wants.length === 0) return new Uint8Array(0);

	// Second section: haves, ended by a flush (more rounds to come) or "done" (send the pack).
	while (!done) {
		const pkt = reader.next();
		if (!pkt || pkt.kind === "flush") break;
		if (pkt.kind !== "data") throw new Error("unexpected packet in have list");
		const line = chomp(decodeText(pkt.data));
		if (line.startsWith("have ")) {
			const oid = line.slice(5);
			if (!isHexOid(oid)) throw new Error(`invalid have line: ${line}`);
			haves.push(oid);
		} else if (line === "done") {
			done = true;
		} else {
			throw new Error(`unexpected line in have list: ${line}`);
		}
	}

	// Only advertised tips (and peeled tags) may be wanted, like git without allow-*-sha1-in-want.
	const advertised = new Set<Oid>();
	for (const oid of (await repo.listRefs()).values()) {
		advertised.add(oid);
		const peeled = await peelToNonTag(repo, oid);
		if (peeled) advertised.add(peeled);
	}
	for (const want of wants) if (!advertised.has(want)) return errorPacket(`upload-pack: not our ref ${want}`);

	const out = new PktWriter();
	const multiAckDetailed = capabilities.has("multi_ack_detailed");
	const multiAck = multiAckDetailed || capabilities.has("multi_ack");
	const sideBand = capabilities.has("side-band-64k");

	// Negotiation, following upload-pack.c get_common_commits(). "common" is every have we also have.
	const common: Oid[] = [];
	const commonSet = new Set<Oid>();
	const existing = await repo.hasObjects(haves);
	let gotCommon = false;
	let gotOther = false;
	let readyChecked = -1;
	let ready = false;
	// ok_to_give_up(): cached per size of the common set, which only grows.
	async function okToGiveUp(): Promise<boolean> {
		if (readyChecked !== common.length) {
			ready = await allWantsReachHaves(repo, wants, commonSet);
			readyChecked = common.length;
		}
		return ready;
	}

	for (const have of haves) {
		if (existing.has(have)) {
			gotCommon = true;
			if (!commonSet.has(have)) {
				commonSet.add(have);
				common.push(have);
			}
			if (multiAckDetailed) out.line(`ACK ${have} common\n`);
			else if (multiAck) out.line(`ACK ${have} continue\n`);
			else if (common.length === 1) out.line(`ACK ${have}\n`);
		} else {
			gotOther = true;
			if (multiAck && (await okToGiveUp())) out.line(multiAckDetailed ? `ACK ${have} ready\n` : `ACK ${have} continue\n`);
		}
	}
	const lastCommon = common[common.length - 1];

	if (!done) {
		if (multiAckDetailed && gotCommon && !gotOther && (await okToGiveUp())) out.line(`ACK ${lastCommon} ready\n`);
		if (common.length === 0 || multiAck) out.line("NAK\n");
		return out.bytes();
	}

	if (common.length > 0) {
		if (multiAck) out.line(`ACK ${lastCommon}\n`);
	} else {
		out.line("NAK\n");
	}

	const oids = await selectObjects(repo, wants, common, capabilities.has("include-tag"));
	const pack = await writePack(loadObjects(repo, oids), oids.length);
	if (sideBand) {
		out.sideBand(1, pack);
		out.flush();
	} else {
		out.raw(pack);
	}
	return out.bytes();
}

async function* loadObjects(repo: Repo, oids: Oid[]): AsyncGenerator<GitObject> {
	for (const oid of oids) {
		const object = await repo.getObject(oid);
		if (!object) throw new Error(`object ${oid} is missing`);
		yield object;
	}
}

interface PushCommand {
	ref: string;
	old: Oid | null;
	new: Oid | null;
	error: string | null;
}

/** Body for POST /git-receive-pack (push). Content type application/x-git-receive-pack-result. */
export async function receivePack(requestBody: Uint8Array, repo: Repo): Promise<Uint8Array> {
	const reader = new PktReader(requestBody);
	const commands: PushCommand[] = [];
	let capabilities = new Set<string>();

	for (;;) {
		const pkt = reader.next();
		if (!pkt || pkt.kind === "flush") break;
		if (pkt.kind !== "data") throw new Error("unexpected packet in command list");
		let line = chomp(decodeText(pkt.data));
		if (commands.length === 0) {
			const nul = line.indexOf("\0");
			if (nul >= 0) {
				capabilities = new Set(line.slice(nul + 1).split(" ").filter((cap) => cap.length > 0));
				line = line.slice(0, nul);
			}
		}
		if (line.startsWith("shallow ")) throw new Error("pushes from shallow clones are not supported");
		const [oldOid, newOid, ...refParts] = line.split(" ");
		const ref = refParts.join(" ");
		if (!isHexOid(oldOid) || !isHexOid(newOid) || !ref) throw new Error(`invalid command line: ${line}`);
		commands.push({ ref, old: oldOid === ZERO_OID ? null : oldOid, new: newOid === ZERO_OID ? null : newOid, error: null });
	}
	if (commands.length === 0) return reportStatus(commands, null, capabilities);

	// The pack follows the flush. There is none when every command is a delete.
	const packBytes = requestBody.subarray(reader.offset);
	let packed: StoredObject[] = [];
	let unpackError: string | null = null;
	if (packBytes.length > 0) {
		try {
			packed = await readPack(packBytes, repo);
		} catch (error) {
			unpackError = error instanceof Error ? error.message : String(error);
		}
	}

	if (unpackError) {
		for (const command of commands) command.error = "n/a (unpacker error)";
		return reportStatus(commands, unpackError, capabilities);
	}

	const packedOids = new Set(packed.map((object) => object.oid));
	const currentRefs = await repo.listRefs();
	const head = await repo.headTarget();
	const newTargets = commands.map((command) => command.new).filter((oid): oid is Oid => oid !== null && !packedOids.has(oid));
	const knownTargets = await repo.hasObjects(newTargets);

	for (const command of commands) {
		if (!isValidRefName(command.ref)) command.error = "funny refname";
		else if (command.old === null && command.new === null) command.error = "invalid command";
		else if (command.new === null && command.ref === head) command.error = "deletion of the current branch prohibited";
		else if (command.new !== null && !packedOids.has(command.new) && !knownTargets.has(command.new)) command.error = "missing necessary objects";
		else if ((currentRefs.get(command.ref) ?? null) !== command.old) command.error = "failed to update ref";
	}

	// Every object the pack refers to must exist afterwards, or the repo would have dangling links.
	if (packed.length > 0 && (await hasMissingReferences(repo, packed, packedOids))) {
		for (const command of commands) if (!command.error) command.error = "missing necessary objects";
	}

	const atomic = capabilities.has("atomic");
	if (atomic && commands.some((command) => command.error)) {
		for (const command of commands) if (!command.error) command.error = "atomic push failed";
	}

	const valid = commands.filter((command) => !command.error);
	if (valid.length > 0) {
		if (packed.length > 0) await repo.putObjects(packed);
		const toUpdate = (list: PushCommand[]): RefUpdate[] => list.map(({ ref, old, new: newOid }) => ({ ref, old, new: newOid }));
		// Without "atomic" each ref stands alone, as in git: one bad ref must not block the others.
		const batches = atomic ? [valid] : valid.map((command) => [command]);
		for (const batch of batches) {
			const results = await repo.updateRefs(toUpdate(batch));
			for (const result of results) {
				if (!result.ok) batch.find((command) => command.ref === result.ref)!.error = result.reason;
			}
		}
	}
	return reportStatus(commands, null, capabilities);
}

function reportStatus(commands: PushCommand[], unpackError: string | null, capabilities: Set<string>): Uint8Array {
	const out = new PktWriter();
	const sideBand = capabilities.has("side-band-64k");
	if (capabilities.has("report-status")) {
		const report = new PktWriter();
		report.line(`unpack ${unpackError ?? "ok"}\n`);
		for (const command of commands) {
			report.line(command.error ? `ng ${command.ref} ${command.error}\n` : `ok ${command.ref}\n`);
		}
		report.flush();
		if (sideBand) out.sideBand(1, report.bytes());
		else out.raw(report.bytes());
	}
	if (sideBand) out.flush();
	return out.bytes();
}

async function hasMissingReferences(repo: Repo, packed: StoredObject[], packedOids: Set<Oid>): Promise<boolean> {
	const referenced = new Set<Oid>();
	const note = (oid: Oid): void => {
		if (!packedOids.has(oid)) referenced.add(oid);
	};
	for (const object of packed) {
		if (object.type === "commit") {
			const commit = parseCommit(object.data);
			note(commit.tree);
			for (const parent of commit.parents) note(parent);
		} else if (object.type === "tree") {
			// 160000 entries point into another repo (submodules); they are never expected here.
			for (const entry of parseTree(object.data)) if (entry.mode !== "160000") note(entry.oid);
		} else if (object.type === "tag") {
			note(parseTag(object.data).object);
		}
	}
	if (referenced.size === 0) return false;
	const present = await repo.hasObjects([...referenced]);
	return present.size !== referenced.size;
}

/** git's check_refname_format(name, 0) plus receive-pack's "must start with refs/". */
export function isValidRefName(name: string): boolean {
	if (!name.startsWith("refs/") || name.endsWith("/") || name.endsWith(".") || name.includes("@{")) return false;
	for (let i = 0; i < name.length; i++) {
		const code = name.charCodeAt(i);
		if (code <= 0x20 || code === 0x7f || "~^:?*[\\".includes(name[i])) return false;
	}
	for (const component of name.split("/")) {
		if (component.length === 0 || component.startsWith(".") || component.endsWith(".lock") || component.includes("..")) return false;
	}
	return true;
}

/** Follows a tag (or chain of tags) to the id of the commit, tree or blob it names. */
async function peelToNonTag(repo: Repo, oid: Oid): Promise<Oid | undefined> {
	let current = oid;
	for (;;) {
		const object = await repo.getObject(current);
		if (!object) return undefined;
		if (object.type !== "tag") return current;
		current = parseTag(object.data).object;
	}
}

function errorPacket(message: string): Uint8Array {
	const out = new PktWriter();
	out.line(`ERR ${message}\n`);
	return out.bytes();
}

function chomp(line: string): string {
	return line.endsWith("\n") ? line.slice(0, -1) : line;
}
