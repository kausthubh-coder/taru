-- Waitlist signups from the landing page (POST /api/waitlist, features/waitlist/server/waitlist.ts).
-- email is stored lowercased and trimmed; the UNIQUE index is what makes a second signup a no-op.
CREATE TABLE IF NOT EXISTS waitlist (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE,
	role TEXT,
	note TEXT,
	user_agent TEXT,
	country TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
