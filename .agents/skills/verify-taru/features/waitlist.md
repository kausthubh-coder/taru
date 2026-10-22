# Waitlist

Visitors leave their email, which is stored in the D1 table `waitlist`. Signing up twice looks identical to signing up once.

## Sub-features

- `waitlist-js`: the form posts JSON and shows the result in the status line under the field.
- `waitlist-nojs`: with JavaScript off, the form posts and the server redirects to `/#joined` or `/#bad-email`.
- `waitlist-validate`: a bad email gets 400 "That email doesn't look right."; GET gets 405.
- `waitlist-dedupe`: the same email twice is one row and the same success message.

## How to get to it (user POV)

- The hero form ("Join the waitlist") or the bottom form on `/`.
- `POST /api/waitlist` with JSON `{ "email": "..." }`.

## Driving it with verify.mjs

Preconditions: baseline; the email isn't on the list yet.

- **Sign up through the form.** Run `node .agents/skills/verify-taru/verify.mjs waitlist someone@example.com`. It prints `form said: You're on the list. We'll email you when there's something to try.` and `D1 rows for someone@example.com: 1`. Evidence: `waitlist.json`, `waitlist-after-submit.png`.
- **Duplicate.** Run the same command again. Still exactly 1 row, same message.
- **Bad input (API).** `curl -s -X POST <url>/api/waitlist -H "content-type: application/json" -d '{"email":"nope"}'` returns 400 `{"error":"That email doesn't look right."}`.
- **No-JS path.** `curl -s -i -X POST <url>/api/waitlist -d "email=a@b.co"` returns `303` with `Location: /#joined`.

## Gotchas

- Emails are trimmed and lowercased before storing. Query D1 with the lowercase form.
- The status line is filled by `features/waitlist/ui/waitlist-form.ts`. If the JS bundle failed to load, the form falls back to the no-JS redirect and `waitlist` times out waiting for status text.
