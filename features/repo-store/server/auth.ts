// Temporary auth until accounts exist: HTTP Basic with any username and the password TARU_ADMIN_TOKEN.
// Used for creating repos and for pushing. Clone and fetch are public.

const encoder = new TextEncoder();

export async function isAdmin(request: Request, env: Env): Promise<boolean> {
	const expected = env.TARU_ADMIN_TOKEN;
	if (!expected) return false;
	const password = basicPassword(request.headers.get("Authorization"));
	if (password === null) return false;
	// Hash both sides to the same length first, so the comparison never short-circuits on length.
	const [given, wanted] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(password)),
		crypto.subtle.digest("SHA-256", encoder.encode(expected)),
	]);
	return crypto.subtle.timingSafeEqual(given, wanted);
}

/** The password from a "Basic <base64 user:password>" header, or null if the header isn't usable. */
function basicPassword(header: string | null): string | null {
	if (!header || !header.startsWith("Basic ")) return null;
	let decoded: string;
	try {
		const bytes = Uint8Array.from(atob(header.slice("Basic ".length).trim()), (c) => c.charCodeAt(0));
		decoded = new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
	const colon = decoded.indexOf(":");
	return colon < 0 ? null : decoded.slice(colon + 1);
}

/** 401 with the challenge that makes git ask for credentials. */
export function unauthorized(): Response {
	return new Response("authentication required\n", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="taru"', "Content-Type": "text/plain" },
	});
}

/** GET /api/session: whether the request's Authorization header holds the admin token. The web app asks before it
 *  saves a pasted token, so a typo shows up at once instead of at the first commit. */
export async function handleSession(request: Request, env: Env): Promise<Response> {
	if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
	return Response.json({ admin: await isAdmin(request, env) }, { headers: { "Cache-Control": "no-store" } });
}
