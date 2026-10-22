#!/usr/bin/env node
// A stand-in for GitHub: real `git http-backend` served over node:http, with bare repos under a root folder.
// Tests and the verify skill use it to prove Taru's import (fetch) and mirror (push) clients against real git.
//
// Usage: node scripts/fake-github.mjs <root> [--port <n>] [--token <t>]
//   <root>   folder holding bare repos, e.g. <root>/octo/demo.git (create them with `git init --bare`)
//   --port   listen port (default: a free one)
//   --token  when set, every request needs HTTP Basic auth with this password, like GitHub with a PAT
// Prints `listening <port>` on stdout when ready. Stop it with SIGTERM.
//
// Pushes are allowed because REMOTE_USER is set (http-backend's rule); the Git-Protocol header is dropped on
// purpose so git answers protocol v0, which is what GitHub does for the requests Taru sends.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
if (!root) {
	console.error("usage: node scripts/fake-github.mjs <root> [--port <n>] [--token <t>]");
	process.exit(2);
}
const option = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(option("--port") ?? 0);
const token = option("--token");

function authorized(request) {
	if (!token) return true;
	const header = request.headers.authorization ?? "";
	if (!header.startsWith("Basic ")) return false;
	const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
	return decoded.slice(decoded.indexOf(":") + 1) === token;
}

const server = createServer((request, response) => {
	if (!authorized(request)) {
		response.writeHead(401, { "WWW-Authenticate": 'Basic realm="fake-github"', "Content-Type": "text/plain" });
		response.end("authentication required\n");
		return;
	}
	const url = new URL(request.url, "http://localhost");
	const env = {
		...process.env,
		GIT_PROJECT_ROOT: root,
		GIT_HTTP_EXPORT_ALL: "1",
		REQUEST_METHOD: request.method,
		PATH_INFO: decodeURIComponent(url.pathname),
		QUERY_STRING: url.searchParams.toString(),
		REMOTE_USER: "fake-github",
		REMOTE_ADDR: request.socket.remoteAddress ?? "127.0.0.1",
		SERVER_PROTOCOL: "HTTP/1.1",
		CONTENT_TYPE: request.headers["content-type"] ?? "",
	};
	if (request.headers["content-length"]) env.CONTENT_LENGTH = request.headers["content-length"];
	if (request.headers["content-encoding"]) env.HTTP_CONTENT_ENCODING = request.headers["content-encoding"];

	const cgi = spawn("git", ["http-backend"], { env, stdio: ["pipe", "pipe", "inherit"] });
	request.pipe(cgi.stdin);

	// CGI output: header lines, a blank line, then the body. Parse the headers, then stream the rest through.
	let head = Buffer.alloc(0);
	let headersDone = false;
	cgi.stdout.on("data", (chunk) => {
		if (headersDone) {
			response.write(chunk);
			return;
		}
		head = Buffer.concat([head, chunk]);
		const end = head.indexOf("\r\n\r\n");
		if (end < 0) return;
		headersDone = true;
		let status = 200;
		const headers = {};
		for (const line of head.subarray(0, end).toString("utf8").split("\r\n")) {
			const colon = line.indexOf(":");
			if (colon < 0) continue;
			const name = line.slice(0, colon).trim();
			const value = line.slice(colon + 1).trim();
			if (name.toLowerCase() === "status") status = Number(value.split(" ")[0]);
			else headers[name] = value;
		}
		response.writeHead(status, headers);
		response.write(head.subarray(end + 4));
	});
	cgi.on("close", () => {
		if (!headersDone) response.writeHead(500);
		response.end();
	});
});

server.listen(port, "127.0.0.1", () => {
	// Stdout is the readiness signal the launcher reads; keep it to this one line.
	// oxlint-disable-next-line no-console
	console.log(`listening ${server.address().port}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
