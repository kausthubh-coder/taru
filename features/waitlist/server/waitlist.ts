// POST /api/waitlist: store an email from the landing page in D1.
//
// The form script sends JSON { email, role?, note? }. With JavaScript off, the browser posts the form as
// application/x-www-form-urlencoded instead; then we answer with a redirect back to the page, carrying a hash
// that the page's CSS turns into a message (see features/landing/ui/landing.css, `.form-note:target`).
//
// Signing up twice answers exactly like the first time, so the endpoint doesn't reveal who is on the list.

const MAX_BODY_BYTES = 8 * 1024;
const MAX_EMAIL = 254;
const MAX_ROLE = 100;
const MAX_NOTE = 1000;
const MAX_USER_AGENT = 500;

// One @, no spaces, at least one dot in the domain. Strict enough to catch typos, loose enough for real addresses.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const WAITLIST_SUCCESS = "You're on the list. We'll email you when there's something to try.";

type Fields = Record<string, unknown>;
type Signup = { email: string; role: string | null; note: string | null };

export async function handleWaitlist(request: Request, env: Env): Promise<Response> {
	if (request.method !== "POST") {
		return Response.json({ error: "Use POST." }, { status: 405, headers: { Allow: "POST" } });
	}

	const contentType = request.headers.get("content-type") ?? "";
	const isForm = contentType.includes("application/x-www-form-urlencoded");

	const body = await readBody(request, MAX_BODY_BYTES);
	if (body === null) return reply(request, isForm, 413, "That's too long.");

	const fields = isForm ? Object.fromEntries(new URLSearchParams(body)) : parseJson(body);
	if (!fields) return reply(request, isForm, 400, 'Send JSON like {"email": "you@example.com"}.');

	const signup = validate(fields);
	if ("error" in signup) return reply(request, isForm, 400, signup.error);

	const userAgent = request.headers.get("user-agent")?.slice(0, MAX_USER_AGENT) ?? null;
	const country = typeof request.cf?.country === "string" ? request.cf.country : null;

	await env.DB.prepare(
		"INSERT INTO waitlist (email, role, note, user_agent, country) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (email) DO NOTHING",
	)
		.bind(signup.email, signup.role, signup.note, userAgent, country)
		.run();

	if (isForm) return seeOther(request, "#joined");
	return Response.json({ ok: true, message: WAITLIST_SUCCESS });
}

// Reads at most `max` bytes. Returns null when the body is bigger, without buffering the rest.
async function readBody(request: Request, max: number): Promise<string | null> {
	const declared = Number(request.headers.get("content-length"));
	if (declared > max) return null;
	if (!request.body) return "";

	const chunks: Uint8Array[] = [];
	let size = 0;
	// Breaking out of the loop cancels the stream, so the rest of an oversized body is never read.
	for await (const chunk of request.body) {
		size += chunk.byteLength;
		if (size > max) return null;
		chunks.push(chunk);
	}
	const joined = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(joined);
}

function parseJson(text: string): Fields | null {
	try {
		const value: unknown = JSON.parse(text);
		return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : null;
	} catch {
		return null;
	}
}

function validate(fields: Fields): Signup | { error: string } {
	const email = typeof fields.email === "string" ? fields.email.trim().toLowerCase() : "";
	if (!email) return { error: "Enter your email." };
	if (email.length > MAX_EMAIL || !EMAIL.test(email)) return { error: "That email doesn't look right." };

	const role = optionalText(fields.role, MAX_ROLE);
	if (role === false) return { error: `Role can be at most ${MAX_ROLE} characters.` };
	const note = optionalText(fields.note, MAX_NOTE);
	if (note === false) return { error: `Note can be at most ${MAX_NOTE} characters.` };

	return { email, role, note };
}

// Empty or missing becomes null; too long is false; anything that isn't a string is an error too.
function optionalText(value: unknown, max: number): string | null | false {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (trimmed.length > max) return false;
	return trimmed || null;
}

function reply(request: Request, isForm: boolean, status: number, error: string): Response {
	if (isForm) return seeOther(request, "#bad-email");
	return Response.json({ error }, { status });
}

// After a plain form post, send the browser back to the landing page with a hash the CSS reacts to.
function seeOther(request: Request, hash: string): Response {
	const back = request.headers.get("referer");
	const location = back ? new URL(back).pathname + hash : `/${hash}`;
	return new Response(null, { status: 303, headers: { Location: location } });
}
