// JSON API for repositories: /api/repos...

export async function handleReposApi(_request: Request, _env: Env): Promise<Response> {
	return Response.json({ error: "not implemented" }, { status: 501 });
}
