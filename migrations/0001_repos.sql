-- Repository index. Contents live in the repo's RepoObject (Durable Object), keyed "<owner>/<name>"
-- in the spelling stored here. owner and name compare case-insensitively, like GitHub URLs.
CREATE TABLE repos (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	owner TEXT NOT NULL COLLATE NOCASE,
	name TEXT NOT NULL COLLATE NOCASE,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE (owner, name)
);
