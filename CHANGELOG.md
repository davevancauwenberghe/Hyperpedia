# Changelog

## 0.6.2 — 2026-10-14

- Shorten the visible privacy page, put technical storage details in a collapsed disclosure, and align its responsive layout with the shared page width.
- Preserve separate one-year privacy choices, withdrawal, browser-specific reading lists and the configured privacy contact.
- Remove the pre-consent bookmark import, obsolete preference cleanup and migration-only browser checks; only the current reading-list format is used.
- Recover the reading list after an unresponsive catalogue request, keeping saved links and removal controls usable.
- Fix structured-data and attribution reply links for archived identifiers containing spaces, percent signs, Unicode or punctuation; preserve existing reply anchors.
- Verify the refinements with unit coverage and browser regressions for stalled requests, actual reply targets and expanded privacy details across nine screen widths.

## 0.6.1 — 2026-10-13

- Remove save controls from story previews, the continue-reading shelf, progress indicators, reading history and automatic position restoration. Preserve existing saved stories while deleting the old history record.
- Consolidate all story options in a quiet Leesvoorkeuren disclosure and remember explicit open/closed choices across refreshes and viewport sizes.
- Clarify that reading lists belong to one browser and browser profile and expire saved entries after one year.
- Add an unobtrusive consent banner and editable privacy/storage settings. Keep durable reading preferences and anonymous story-count requests off until separate consent; remember acceptance or refusal for 365 days, support revocation across tabs and explain storage purposes and lifetimes.
- Make administrator login cookies session-only by default, with an explicit seven-day remember-me choice.
- Retain archive routes, author attribution, social previews and responsive pagination; cover storage migration, consent, expiry, controls and layouts with regressions.

- Configure Dave Van Cauwenberghe and the supplied contact URL for the production privacy notice.
- Review live crawler access; retain public search/AI access, add a bounded live llms.txt context guide, and preserve complete sitemap coverage.
- Use explicit archive-list metadata, reply anchor URLs, versioned social-preview images, secure image URLs and large-preview permission for indexable pages.
- Improve installed-app icons, manifest shortcuts, safe-area spacing and installation guidance inside the existing information dialog. Add an installed-app-only public offline fallback with no visited-page or private-page caching.

## 0.6.0 — 2026-10-12

### Personal reading

- Save stories to a private reading list on the current device and remove them individually or clear the list and reading progress.
- Resume unfinished stories from the homepage or reading list, restoring the paragraph position across screen sizes.
- Add focus mode, section navigation and an optional reading-progress indicator. Focus and progress-display preferences persist locally.
- Add themed reading paths with a clear sequence and ending. Administrators can select and order three to five stories with stale-edit protection.
- Keep bookmarks consistent through responsive pagination and browser tabs, handle deleted stories, and degrade gracefully when local storage or JavaScript is unavailable.
- Add subtle control/card transitions and disable new animation when reduced motion is requested.

### Structured data and maintenance

- Give story and reply authors working, contribution-specific attribution URLs with clear archive context; matching display names are never merged into inferred identities.
- Keep social preview images in sharing metadata and remove the generic preview from forum-post structured data.
- Include public reading paths in the sitemap; private reading-list views and attribution pages remain outside it.
- Export curated path definitions with the archive and preserve corrupt selection files rather than overwriting them. Public theme routes and primary archive exports remain usable when selections are unreadable; exports include an explicit warning for missing route data.
- Add server and browser regressions covering author links, path editing, private storage, resume/focus controls, reduced motion, and mobile/desktop layouts.

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
