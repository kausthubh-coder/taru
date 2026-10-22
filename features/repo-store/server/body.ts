// Request bodies cross two boundaries: Worker -> RepoObject (over RPC, where anything but a stream is capped at
// 32 MiB) and stream -> bytes (git-core takes buffered Uint8Arrays for now). These helpers keep both bounded.

/** Records whether a byteLimit stream was cut off, so the HTTP layer can answer 413 instead of 500. */
export interface ByteLimit {
	exceeded: boolean;
}

/** Passes bytes through until `maxBytes`, then errors the stream and flips `limit.exceeded`. */
export function byteLimit(maxBytes: number, limit: ByteLimit): TransformStream<Uint8Array, Uint8Array> {
	let seen = 0;
	return new TransformStream({
		transform(chunk, controller) {
			seen += chunk.byteLength;
			if (seen > maxBytes) {
				limit.exceeded = true;
				controller.error(new Error(`body exceeds ${maxBytes} bytes`));
				return;
			}
			controller.enqueue(chunk);
		},
	});
}

export async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let total = 0;
	for await (const chunk of stream) {
		chunks.push(chunk);
		total += chunk.byteLength;
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

/** Wraps buffered bytes as a stream, so results larger than the RPC message limit can cross it. */
export function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
	return new Blob([bytes]).stream();
}
