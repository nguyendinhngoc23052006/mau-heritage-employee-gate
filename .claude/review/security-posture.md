# security / production-posture review — stale-bundle banner + cache-key class
Reviewed: working tree of `claude/heritage-gate-part-2-ia4u9p` at 914f064
Verdict: **PASS — no findings**

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | CSP allows the new fetch | OK | `public/_headers:27` `connect-src 'self' …` covers same-origin `fetch("/version.json")` (`src/hooks/useStaleBundle.ts:30`). The reload button is a React synthetic handler in the already-`script-src 'self'` bundle, not an inline `on*` attribute; Tailwind classes only. No CSP directive changed. |
| 2 | Information disclosure | OK (conditional) | `vite.config.ts:32-39` emits exactly one asset with one key; `buildSha` (`vite.config.ts:13-17`) is a 7-char slice of `CF_PAGES_COMMIT_SHA \|\| GITHUB_SHA \|\| "dev"`. No env spread. A bare short SHA grants no capability against a **private** repo — GitHub 404s commits to unauthenticated callers. Re-check if this repo is ever made public. |
| 3 | Secrets | OK | No key, token, project ref or hostname in any changed file; `.env.example` untouched; the diff references neither `VITE_SUPABASE_URL` nor `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| 4 | RLS / cross-user cache | OK | `src/services/notifications.ts:9-13` scopes every call to `auth.getUser()` + `eq("user_id", user.id)` server-side. The key split is a correctness fix, not a new surface. Cross-user leakage is covered by `clearAllQueries()` (`src/lib/query.ts:17-19`) on sign-out (`Layout.tsx:53-57`). |
| 5 | Request storm / cost | OK | `lastCheckedAt` is module scope (`useStaleBundle.ts:7`) so remounts cannot bypass the 60s gate (`:27`); `visibilitychange` fires on hide too but `check()` exits at `:25` unless visible; after `setStale(true)` the `if (stale) return` guard at `:21` stops checking and the cleanup removes the listener. N tabs → N requests/60s of a ~30-byte file. Nothing fetches on render. |
| 6 | Destructive writes | CONFIRMED none | No migration, no `insert/update/delete/upsert` anywhere in the diff. Client-side plumbing plus two test files. |

**Flag for the human (not a defect):** point 2's verdict assumes the GitHub repo stays private.
