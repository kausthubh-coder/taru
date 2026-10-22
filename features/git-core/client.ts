// Git smart HTTP protocol, client side (gitprotocol-http(5)), protocol v0 only: the three requests Taru makes to
// another Git server (GitHub, or a local git http-backend). Web-standard fetch only, so it runs in Node tests
// and in a Durable Object. No Git-Protocol header is sent on purpose: GitHub then answers v0, which is what
// this file speaks. Responses are buffered, capped by the caller's byte limit.

import { concatBytes, decodeText, isHexOid } from "./bytes.ts";
import { ZERO_OID } from "./objects.ts";
import { readPack } from "./packReader.ts";
import { PktReader, PktWriter } from "./pktline.ts";
import type { GitService } from "./protocol.ts";
import type { Oid, RefUpdate, RefUpdateResult, Repo, StoredObject } from "./repo.ts";

const AGENT = "agent=taru/0.1";

export interface Advertisement {
	/** Every advertised ref -> oid. HEAD and "^{}" peeled lines are not included. */
	refs: Map<string, Oid>;
	/** For annotated tags: ref -> the oid the tag points at (from "<ref>^{}" lines). */
	peeled: Map<string, Oid>;
	capabilities: Set<string>;
	/** The ref HEAD points at, from the symref capability, or null when the remote is empty or didn't say. */
	head: string | null;
}

export interface RemoteError extends Error {
	status?: number;
}

/** A failure the other server reported (HTTP status, "ERR" packet, or a band-3 message). */
export function remoteError(message: string, status?: number): RemoteError {
	const error: RemoteError = new Error(message);
	error.status = status;
	return error;
}

export interface ClientOptions {
	/** Extra request headers, e.g. Authorization. */
	headers?: Record<string, string>;
	/** Largest response body accepted, in bytes. Over it, the request fails with a clear error. */
	maxResponseBytes: number;
}

/** GET <url>/info/refs?service=<service>, parsed. */
export async function fetchAdvertisement(url: string, service: GitService, options: ClientOptions): Promise<Advertisement> {
	const response = await fetch(`${trimUrl(url)}/info/refs?service=${service}`, { headers: { ...options.headers }, redirect: "follow" });
	if (!response.ok) throw remoteError(`${service} advertisement failed: HTTP ${response.status}`, response.status);
	const body = await readBody(response, options.maxResponseBytes);
	return parseAdvertisement(body, service);
}

export function parseAdvertisement(body: Uint8Array, service: GitService): Advertisement {
	const reader = new PktReader(body);
	const first = reader.nextLine();
	if (first !== `# service=${service}`) throw new Error(`not a ${service} advertisement`);
	const refs = new Map<string, Oid>();
	const peeled = new Map<string, Oid>();
	let capabilities = new Set<string>();
	let head: string | null = null;
	let sawFlush = false;
	let sawFirstRef = false;
	for (let pkt = reader.next(); pkt; pkt = reader.next()) {
		if (pkt.kind === "flush") {
			// One flush ends the service line; the second ends the ref list.
			if (sawFlush) break;
			sawFlush = true;
			continue;
		}
		if (pkt.kind !== "data") continue;
		let line = decodeText(pkt.data);
		if (line.endsWith("\n")) line = line.slice(0, -1);
		if (line.startsWith("ERR ")) throw remoteError(line.slice(4));
		if (!sawFirstRef) {
			sawFirstRef = true;
			const nul = line.indexOf("\0");
			if (nul >= 0) {
				capabilities = new Set(line.slice(nul + 1).split(" ").filter((cap) => cap.length > 0));
				line = line.slice(0, nul);
			}
		}
		const space = line.indexOf(" ");
		const oid = line.slice(0, space);
		const name = line.slice(space + 1);
		if (!isHexOid(oid)) throw new Error(`invalid advertisement line: ${line}`);
		if (name === "capabilities^{}" || name === "HEAD") continue;
		if (name.endsWith("^{}")) peeled.set(name.slice(0, -3), oid);
		else refs.set(name, oid);
	}
	for (const cap of capabilities) {
		if (cap.startsWith("symref=HEAD:")) head = cap.slice("symref=HEAD:".length);
	}
	return { refs, peeled, capabilities, head };
}

/**
 * POST git-upload-pack: asks for `wants` (advertised tips only), tells the server `haves` it may skip, and
 * returns the pack's objects, resolved. Thin-pack bases are looked up in `repo`.
 */
export async function fetchObjects(url: string, wants: Oid[], haves: Oid[], repo: Repo, options: ClientOptions): Promise<StoredObject[]> {
	if (wants.length === 0) return [];
	const request = new PktWriter();
	wants.forEach((want, i) => request.line(i === 0 ? `want ${want} ofs-delta side-band-64k no-progress ${AGENT}\n` : `want ${want}\n`));
	request.flush();
	for (const have of haves) request.line(`have ${have}\n`);
	request.line("done\n");

	const response = await fetch(`${trimUrl(url)}/git-upload-pack`, {
		method: "POST",
		headers: { ...options.headers, "Content-Type": "application/x-git-upload-pack-request", Accept: "application/x-git-upload-pack-result" },
		body: request.bytes() as BodyInit,
		redirect: "follow",
	});
	if (!response.ok) throw remoteError(`git-upload-pack failed: HTTP ${response.status}`, response.status);
	const body = await readBody(response, options.maxResponseBytes);

	// ACK/NAK lines come first as plain packets; after them the pack rides in band 1.
	const reader = new PktReader(body);
	const packChunks: Uint8Array[] = [];
	for (let pkt = reader.next(); pkt; pkt = reader.next()) {
		if (pkt.kind !== "data") continue;
		const band = pkt.data[0];
		if (band === 1) packChunks.push(pkt.data.subarray(1));
		else if (band === 2) continue;
		else if (band === 3) throw remoteError(`remote: ${decodeText(pkt.data.subarray(1)).trim()}`);
		else {
			const line = decodeText(pkt.data).trim();
			if (line.startsWith("ERR ")) throw remoteError(line.slice(4));
			if (!line.startsWith("ACK") && line !== "NAK") throw new Error(`unexpected upload-pack line: ${line}`);
		}
	}
	const pack = concatBytes(packChunks);
	if (pack.length === 0) throw new Error("upload-pack sent no pack");
	return readPack(pack, repo);
}

export interface PushResult {
	/** "unpack ok" or the unpacker's error. */
	unpack: string;
	results: RefUpdateResult[];
}

/**
 * POST git-receive-pack: sends `commands` (old/new per ref, null meaning absent/delete) and `pack` (the objects
 * the remote lacks; empty when every command is a delete), and returns the remote's report.
 */
export async function pushPack(url: string, commands: RefUpdate[], pack: Uint8Array, remoteCapabilities: Set<string>, options: ClientOptions): Promise<PushResult> {
	if (commands.length === 0) return { unpack: "ok", results: [] };
	const request = new PktWriter();
	// Not atomic on purpose: a mirror should land every ref it can and report the one GitHub refuses.
	const caps = ["report-status", "side-band-64k", "ofs-delta"].filter((cap) => remoteCapabilities.has(cap));
	if (commands.some((command) => command.new === null) && !remoteCapabilities.has("delete-refs")) {
		throw remoteError("remote does not support deleting refs");
	}
	caps.push(AGENT);
	commands.forEach((command, i) => {
		const line = `${command.old ?? ZERO_OID} ${command.new ?? ZERO_OID} ${command.ref}`;
		request.line(i === 0 ? `${line}\0${caps.join(" ")}\n` : `${line}\n`);
	});
	request.flush();
	if (commands.some((command) => command.new !== null)) request.raw(pack);

	const response = await fetch(`${trimUrl(url)}/git-receive-pack`, {
		method: "POST",
		headers: { ...options.headers, "Content-Type": "application/x-git-receive-pack-request", Accept: "application/x-git-receive-pack-result" },
		body: request.bytes() as BodyInit,
		redirect: "follow",
	});
	if (!response.ok) throw remoteError(`git-receive-pack failed: HTTP ${response.status}`, response.status);
	const body = await readBody(response, options.maxResponseBytes);

	// With side-band-64k the report is band-1 payload; without it, the report is the body itself.
	let report = body;
	if (caps.includes("side-band-64k")) {
		const reader = new PktReader(body);
		const chunks: Uint8Array[] = [];
		for (let pkt = reader.next(); pkt; pkt = reader.next()) {
			if (pkt.kind !== "data") continue;
			if (pkt.data[0] === 1) chunks.push(pkt.data.subarray(1));
			else if (pkt.data[0] === 3) throw remoteError(`remote: ${decodeText(pkt.data.subarray(1)).trim()}`);
		}
		report = concatBytes(chunks);
	}
	return parseReport(report, commands);
}

function parseReport(report: Uint8Array, commands: RefUpdate[]): PushResult {
	const reader = new PktReader(report);
	const unpackLine = reader.nextLine();
	if (!unpackLine || !unpackLine.startsWith("unpack ")) throw new Error(`no unpack status in report: ${decodeText(report).slice(0, 200)}`);
	const unpack = unpackLine.slice("unpack ".length);
	const results: RefUpdateResult[] = [];
	for (let line = reader.nextLine(); line !== null; line = reader.nextLine()) {
		if (line.startsWith("ok ")) results.push({ ref: line.slice(3), ok: true });
		else if (line.startsWith("ng ")) {
			const rest = line.slice(3);
			const space = rest.indexOf(" ");
			results.push({ ref: space < 0 ? rest : rest.slice(0, space), ok: false, reason: space < 0 ? "rejected" : rest.slice(space + 1) });
		}
	}
	for (const command of commands) {
		if (!results.some((result) => result.ref === command.ref)) results.push({ ref: command.ref, ok: false, reason: `no status from remote (unpack ${unpack})` });
	}
	return { unpack, results };
}

/** Reads a response body up to `maxBytes`; past that the request is abandoned with a clear error. */
async function readBody(response: Response, maxBytes: number): Promise<Uint8Array> {
	const declared = Number(response.headers.get("Content-Length"));
	if (declared > maxBytes) throw remoteError(`response is ${declared} bytes, over the ${maxBytes} byte limit`, 413);
	const chunks: Uint8Array[] = [];
	let total = 0;
	if (!response.body) return new Uint8Array(0);
	const reader = response.body.getReader();
	for (;;) {
		// Reading one chunk at a time is the point: stop before the body is bigger than we may hold.
		// oxlint-disable-next-line no-await-in-loop
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			void reader.cancel();
			throw remoteError(`response exceeds the ${maxBytes} byte limit`, 413);
		}
		chunks.push(value);
	}
	return concatBytes(chunks);
}

function trimUrl(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}
