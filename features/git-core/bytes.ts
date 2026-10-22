// Byte helpers shared by the Git engine. Web-standard APIs only, so this runs in Node and workerd.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeText(text: string): Uint8Array {
	return encoder.encode(text);
}

export function decodeText(bytes: Uint8Array): string {
	return decoder.decode(bytes);
}

/** Joins chunks with a single allocation. Packs are built from thousands of chunks, so no repeated copying. */
export function concatBytes(chunks: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const chunk of chunks) total += chunk.length;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export function bytesToHex(bytes: Uint8Array): string {
	let hex = "";
	for (let i = 0; i < bytes.length; i++) hex += HEX[bytes[i]];
	return hex;
}

export function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

export async function sha1Hex(data: Uint8Array): Promise<string> {
	return bytesToHex(await sha1(data));
}

export async function sha1(data: Uint8Array): Promise<Uint8Array> {
	// crypto.subtle wants a plain ArrayBuffer-backed view; a view over a SharedArrayBuffer is not a BufferSource.
	const view = data as Uint8Array<ArrayBuffer>;
	return new Uint8Array(await crypto.subtle.digest("SHA-1", view));
}

export function isHexOid(value: string): boolean {
	return /^[0-9a-f]{40}$/.test(value);
}
