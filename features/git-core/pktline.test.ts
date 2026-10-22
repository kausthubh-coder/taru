import { describe, expect, test } from "vitest";
import { decodeText, encodeText } from "./bytes.ts";
import { DELIM_PKT, FLUSH_PKT, PktReader, PktWriter, pktLine } from "./pktline.ts";

describe("pkt-line", () => {
	test("encodes the length prefix in hex", () => {
		expect(decodeText(pktLine("hello\n"))).toBe("000ahello\n");
		expect(decodeText(pktLine(""))).toBe("0004");
		expect(decodeText(FLUSH_PKT)).toBe("0000");
		expect(decodeText(DELIM_PKT)).toBe("0001");
	});

	test("rejects payloads over the 65520-byte limit", () => {
		expect(() => pktLine(new Uint8Array(65516))).not.toThrow();
		expect(() => pktLine(new Uint8Array(65517))).toThrow(/too long/);
	});

	test("reads data, flush and delim packets and reports the offset after them", () => {
		const writer = new PktWriter();
		writer.line("want abc\n");
		writer.flush();
		writer.line("done\n");
		writer.delim();
		const bytes = writer.bytes();
		const tail = encodeText("PACKtrailing");
		const buffer = new Uint8Array([...bytes, ...tail]);

		const reader = new PktReader(buffer);
		expect(reader.nextLine()).toBe("want abc");
		expect(reader.next()).toEqual({ kind: "flush" });
		expect(reader.nextLine()).toBe("done");
		expect(reader.next()).toEqual({ kind: "delim" });
		expect(reader.offset).toBe(bytes.length);
		expect(decodeText(buffer.subarray(reader.offset))).toBe("PACKtrailing");
	});

	test("returns null at the end and throws on truncated input", () => {
		expect(new PktReader(new Uint8Array(0)).next()).toBeNull();
		expect(() => new PktReader(encodeText("000ahel")).next()).toThrow(/truncated/);
		expect(() => new PktReader(encodeText("zzzz")).next()).toThrow(/invalid/);
	});

	test("side-band splits data into band-prefixed packets of at most 65520 bytes", () => {
		const data = new Uint8Array(65515 * 2 + 10).fill(7);
		const writer = new PktWriter();
		writer.sideBand(1, data);
		const reader = new PktReader(writer.bytes());
		const packets = [];
		for (let pkt = reader.next(); pkt; pkt = reader.next()) packets.push(pkt);
		expect(packets.map((pkt) => (pkt.kind === "data" ? pkt.data.length : -1))).toEqual([65516, 65516, 11]);
		const joined = packets.flatMap((pkt) => (pkt.kind === "data" ? [...pkt.data.subarray(1)] : []));
		expect(packets.every((pkt) => pkt.kind === "data" && pkt.data[0] === 1)).toBe(true);
		expect(joined.length).toBe(data.length);
	});
});
