// Git delta application (gitformat-pack(5), "Deltified representation").
// A delta is: base size, result size (both as 7-bit varints), then copy and insert instructions.

export function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
	let pos = 0;

	function readSize(): number {
		let size = 0;
		let shift = 0;
		let byte: number;
		do {
			if (pos >= delta.length) throw new Error("truncated delta header");
			byte = delta[pos++];
			size += (byte & 0x7f) * 2 ** shift;
			shift += 7;
		} while (byte & 0x80);
		return size;
	}

	const baseSize = readSize();
	if (baseSize !== base.length) throw new Error(`delta base size mismatch: expected ${baseSize}, have ${base.length}`);
	const resultSize = readSize();
	const result = new Uint8Array(resultSize);
	let out = 0;

	while (pos < delta.length) {
		const op = delta[pos++];
		if (op & 0x80) {
			// Copy from base. Each set bit in the low 7 bits says which offset/size byte follows.
			let offset = 0;
			let size = 0;
			if (op & 0x01) offset |= delta[pos++];
			if (op & 0x02) offset |= delta[pos++] << 8;
			if (op & 0x04) offset |= delta[pos++] << 16;
			if (op & 0x08) offset += delta[pos++] * 0x1000000;
			if (op & 0x10) size |= delta[pos++];
			if (op & 0x20) size |= delta[pos++] << 8;
			if (op & 0x40) size |= delta[pos++] << 16;
			if (size === 0) size = 0x10000;
			if (offset + size > base.length || out + size > resultSize) throw new Error("delta copy out of range");
			result.set(base.subarray(offset, offset + size), out);
			out += size;
		} else if (op > 0) {
			// Insert the next `op` literal bytes.
			if (pos + op > delta.length || out + op > resultSize) throw new Error("delta insert out of range");
			result.set(delta.subarray(pos, pos + op), out);
			pos += op;
			out += op;
		} else {
			throw new Error("invalid delta opcode 0");
		}
	}
	if (out !== resultSize) throw new Error(`delta result size mismatch: expected ${resultSize}, produced ${out}`);
	return result;
}
