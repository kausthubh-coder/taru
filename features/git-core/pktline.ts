// pkt-line framing (gitprotocol-common(5)) and side-band-64k multiplexing.

import { concatBytes, decodeText, encodeText } from "./bytes.ts";

/** Largest pkt-line git accepts, including the 4-byte length. */
const MAX_PKT_LENGTH = 65520;
/** Side-band payload per packet: length prefix (4) and band byte (1) come off the max. */
const SIDE_BAND_PAYLOAD = MAX_PKT_LENGTH - 5;

export const FLUSH_PKT = encodeText("0000");
export const DELIM_PKT = encodeText("0001");

export type Pkt = { kind: "data"; data: Uint8Array } | { kind: "flush" } | { kind: "delim" } | { kind: "response-end" };

export function pktLine(payload: Uint8Array | string): Uint8Array {
	const bytes = typeof payload === "string" ? encodeText(payload) : payload;
	const length = bytes.length + 4;
	if (length > MAX_PKT_LENGTH) throw new Error(`pkt-line too long: ${length}`);
	return concatBytes([encodeText(length.toString(16).padStart(4, "0")), bytes]);
}

/** Reads pkt-lines from a buffer. `offset` tells where the next unread byte is, so a caller can find the pack after the last flush. */
export class PktReader {
	offset: number;
	private readonly buffer: Uint8Array;

	constructor(buffer: Uint8Array, offset = 0) {
		this.buffer = buffer;
		this.offset = offset;
	}

	get atEnd(): boolean {
		return this.offset >= this.buffer.length;
	}

	/** Next packet, or null at the end of the buffer. */
	next(): Pkt | null {
		if (this.atEnd) return null;
		if (this.offset + 4 > this.buffer.length) throw new Error("truncated pkt-line length");
		const length = parseInt(decodeText(this.buffer.subarray(this.offset, this.offset + 4)), 16);
		if (Number.isNaN(length)) throw new Error("invalid pkt-line length");
		if (length === 0) {
			this.offset += 4;
			return { kind: "flush" };
		}
		if (length === 1) {
			this.offset += 4;
			return { kind: "delim" };
		}
		if (length === 2) {
			this.offset += 4;
			return { kind: "response-end" };
		}
		if (length < 4 || length > MAX_PKT_LENGTH) throw new Error(`invalid pkt-line length ${length}`);
		if (this.offset + length > this.buffer.length) throw new Error("truncated pkt-line");
		const data = this.buffer.subarray(this.offset + 4, this.offset + length);
		this.offset += length;
		return { kind: "data", data };
	}

	/** Next packet as text with one trailing newline removed, which is how git reads command lines. */
	nextLine(): string | null {
		const pkt = this.next();
		if (!pkt || pkt.kind !== "data") return null;
		const text = decodeText(pkt.data);
		return text.endsWith("\n") ? text.slice(0, -1) : text;
	}
}

/** Collects response packets; `bytes()` joins them once at the end. */
export class PktWriter {
	private readonly chunks: Uint8Array[] = [];

	line(payload: Uint8Array | string): void {
		this.chunks.push(pktLine(payload));
	}

	flush(): void {
		this.chunks.push(FLUSH_PKT);
	}

	delim(): void {
		this.chunks.push(DELIM_PKT);
	}

	raw(bytes: Uint8Array): void {
		this.chunks.push(bytes);
	}

	/** Band 1 is pack data, 2 is progress, 3 is a fatal error. */
	sideBand(band: 1 | 2 | 3, data: Uint8Array): void {
		for (let pos = 0; pos < data.length; pos += SIDE_BAND_PAYLOAD) {
			const payload = data.subarray(pos, Math.min(pos + SIDE_BAND_PAYLOAD, data.length));
			this.chunks.push(pktLine(concatBytes([new Uint8Array([band]), payload])));
		}
	}

	bytes(): Uint8Array {
		return concatBytes(this.chunks);
	}
}
