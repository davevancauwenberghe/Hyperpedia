# Changelog

## 0.5.1 — 2026-10-12

- Read the bounded login request body before acquiring a password-verification slot, preventing unfinished uploads from blocking administrator login.
- Limit login uploads to 8 KiB, one per address and 16 overall, with a five-second absolute deadline and connection closure on rejection or expiration.
- Preserve the original replier, administrator name and draft text on reply edit conflicts, with a link back to the specific reply editor.
- Add regressions for four simultaneous unfinished Fly login uploads and complete reply conflict recovery.

## 0.5.0 — 2026-10-12

### Interface and reading

- Establish one version source for package metadata, visible footer, startup log, response header, exports and browser assets.
- Replace emoji/text symbols in interface controls with decorative inline SVG icons.
- Remove the public admin navigation button; management remains available at `/login`.
- Adapt stories per page to six full rows of the current card columns, with up to 36 stories on wide screens.
- Preserve the visible story during resizing and keep the current archive readable on loading errors.
- Fill the available story width by default, with saved text-size and narrower-width preferences.
- Add native sharing when available, canonical link copying with a fallback, and a light print layout.
- Preserve search/topic/page context when opening and returning from stories.
- Support accent-insensitive, case-insensitive searches with multiple words across stories and replies.
- Export all archived stories and replies as JSON from the admin dashboard.

### Reliability and maintenance

- Extract authentication, archive selection/search and icons from the HTTP server into focused modules.
- Run password verification asynchronously with bounded concurrency and guarded login attempts.
- Revoke replaced sessions, validate password records, and reject spoofed local forwarding headers.
- Match admin paths exactly and guard story/reply edits against conflicting changes from another tab.
- Validate archive shapes before writing, use isolated file caches, and flush temporary files before atomic replacement.
- Exclude authenticated admin reading from public read metrics.
- Use Brussels dates for daily picks and stop automatic midnight reloads that interrupted visitors.
- Restrict static assets to GET/HEAD and fix clicks inside dialog padding incorrectly dismissing the dialog.
- Keep sitemap/default archive URLs stable while marking adaptive page-size variants as nonindexable.
- Add browser regressions in the Node 24 CI job for adaptive pagination, resizing and reading tools.
- Align the Docker runtime with Node 24, install from the lockfile, and correct the documented Fly app/volume names.

Earlier work was not tracked under a consistent semantic version.
