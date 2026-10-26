# Changelog

Log of changes made to this project during Claude Code sessions. Newest date last; append new entries below after each completed task.

**How this was verified:** the project folder is **not a Git repository**, so there is no Git history. Entries come from the session transcript and file modification times. Anything uncertain is marked **(unverified)**.

---

## 2026-10-16

### Setup / configuration
- **Created `server/.env`** with `MONGODB_URI`, `SESSION_SECRET` and `PORT=5000`, using values supplied by the user. Reason: the server will not start without `MONGODB_URI`.
- **Created `../.claude/launch.json`** (in `compiler project/`, one level above this project) with a `server` entry. Reason: lets the Claude desktop app start and stop the API with `npm run dev`.

### Dependencies
- **Ran `npm install` in `server/`** (197 packages). Touched `server/package-lock.json` (modified 2026-10-16). `server/package.json` unchanged. `npm audit` reported 6 vulnerabilities (1 critical in `proxy-addr`, 4 high, 1 moderate); none fixed.

### Validation
- Server started on port 5000. `GET /` returned 200, `GET /api/sprites` returned 401 without a token, an unknown path returned 404.
- MongoDB Atlas rejected the login ("bad auth") for every URI tried, so the server ran without a database connection. Cause: the password in `.env` did not match Atlas. Resolved on 2026-10-19 (see below).

---

## 2026-10-19

### Configuration
- **`server/.env`**: joined a `MONGODB_URI` that had been split across two lines; later replaced the URI with the correct user (`svg-compiler`, no `@admin` suffix) plus a placeholder password, which the user then replaced and corrected themselves in Atlas. Added `GOOGLE_CLIENT_ID`. Reason: the previous credentials were rejected and Google sign-in was not configured.
- **Created `client/.env`** with `VITE_API_URL=http://localhost:5000` and `VITE_GOOGLE_CLIENT_ID`. Reason: the client reads the Google client id at build/dev start.
- **`../.claude/launch.json`**: added a `client` entry (`npm run dev`, port 5173, `--strictPort`).
- **Google Cloud (outside the repo, user's account, approved in chat):** created project "SVG Sprite Compiler" (`svg-sprite-compiler-512106`); configured the Google Auth Platform (External audience, support/contact email and test user `ganeshwarigk@gmail.com`, accepted the API Services User Data Policy); created Web OAuth client "SVG Sprite Compiler Web" with authorized JavaScript origins `http://localhost:5173` and `http://localhost`. The client secret was not saved (the sign-in flow does not use it).
- **MongoDB Atlas (outside the repo):** inspected database users and the connection string. The `svg-compiler` user's password was reset by the user, not by Claude.

### New features / UI
- **`client/src/components/LoginModal.tsx`**: re-enabled the "Sign in with Google" button and the `GoogleLogo` component, which were commented out (the dialog previously offered Microsoft only). Reason: needed for Google sign-in to the library. Original file kept in the session scratchpad only (not in the project).

### Dependencies
- **Ran `npm install` in `client/`** (312 packages). `client/package-lock.json` was touched (modified 2026-10-19); `client/package.json` unchanged. `npm audit` reported 10 vulnerabilities (9 high, 1 moderate); none fixed.

### Validation
- Direct Mongoose connect + ping succeeded after the password was fixed. Server logged `[db] Connected to MongoDB Atlas` and created the `users`, `sprites` and `sprite_versions` collections.
- `POST /api/auth/google` with a bad token returned 401 "Invalid Compact JWS" (server has the client id). Before this it returned 500 "missing GOOGLE_CLIENT_ID".
- `npx tsc -b` in `client/` passed after the LoginModal change.
- Client loaded at `http://localhost:5173` with no console errors.
- Google sign-in could not be completed inside the app's browser pane (the pane blocks the Google popup). The user signed in in their own browser; afterwards MongoDB showed 1 user, 2 bundles and 2 sprite versions, which indicates sign-in and saving to the library worked. Sprite contents were not inspected by Claude **(unverified)**.

---

---

## 2026-10-19: Phase 0, baseline and safety (Icon Vault integration)

Logged separately from the earlier setup entries. First phase of the Icon Vault integration; no feature work yet. Git history now exists, so everything below is verified against commits. Each item is its own commit on `main` (local only, nothing pushed).

### Decisions recorded for the integration (from the user, in chat)
- **Hosting:** a normal always-on Node server (not Vercel). `server/vercel.json` becomes obsolete later; the host is still to be chosen.
- **Layout:** "Projects" workspace only. No separate Quick Compile page, so **signing in is required to use the app** (guest compiling goes away).
- **Admins:** listed in `ADMIN_EMAILS` in `server/.env` (checked per request, not stored in the database). User management = list users, delete a user (their projects are moved or removed), transfer projects. No passwords.
- **Public projects:** read-only for other users; they may copy icons into their own projects.
- **Themes:** light, dark and system, with a three-way toggle.
- **Scope:** include font builder, font import, project export/import; the CLI is rewritten and signs in with a revocable API token created in the web app.
- **Cutover:** the old UI is replaced directly (no switch). Git initialized.
- **Test data:** back up, then start clean (the two test bundles are not copied into projects).

### Changes
| Commit | Change | Files | Reason |
|---|---|---|---|
| `4f6622e` | Initialized Git on `main` and committed the project exactly as it was (69 files). `.gitignore` gained `backups/`. `.env` files, `node_modules` and `dist` are ignored. | `.gitignore` | Gives a rollback point before any integration work |
| `63eb4c8` | Applied the fixes from `SVG-sprite-react-db-fixed.zip` (taken from `astro tool/`, where the user moved it): corrected npm script names; `MONGODB_URI` read lazily so a missing value no longer crashes at import and a failed connection can be retried; sessions accept every provider the User model allows; version allocation retries up to 5 times, returns 409 when exhausted, and updates `currentVersion` atomically with `$max`; corrected README (removed `README.suggested.md`); added `.env.example` files. | `server/package.json`, `server/src/config/db.ts`, `server/src/lib/session.ts`, `server/src/routes/spriteRoutes.ts`, `README.md`, `client/.env.example`, `server/.env.example` | The folder lacked fixes that the zip already had |
| | **Not** taken from the zip: its `server/.env` (old credentials) and its `LoginModal.tsx` (our copy has the Google button re-enabled). | | Avoid old secrets; keep the 2026-10-19 UI change |
| `aec37e1` | Added `npm run backup:db`, which dumps every collection to `backups/<timestamp>/` (MongoDB Extended JSON; types restore exactly). | `server/src/scripts/backup-db.ts`, `server/package.json` | Safe copy of the test data before the data model changes |
| `d55e0d2` | Added `typecheck` scripts (server and client) and `npm test` in `server/` (Node's built-in runner via tsx, no new dependencies): 8 API smoke tests plus 5 session-token tests. Added `"include": ["src"]` to the server tsconfig so `tests/` does not break `npm run build`. README documents the commands. | `server/tests/smoke.test.ts`, `server/tests/session.test.ts`, `server/package.json`, `client/package.json`, `server/tsconfig.json`, `README.md` | A regression net before the large UI and data changes |

### Backup taken
- `backups/2026-10-19T11-28-33-474Z/` (project root, git-ignored, contains a user email and sprite XML): `users` 1, `sprites` 2 (`gg-new` public, `gg-2` private), `sprite_versions` 2 (11 and 12 symbols).
- Not yet discarded: the test data stays in the database until the new data model replaces it (Phase 1).

### Validation (verified)
- `server`: `npm run typecheck` passes; `npm run build` passes; `npm test` passes 13 of 13.
- Server starts with an empty `MONGODB_URI`, logs "Starting without DB connection" and still answers (`/` 200, `/api/sprites` 401). Before the fix it crashed at import.
- Regression run against the real database through a throwaway server instance (valid session token for the existing user): `/api/auth/me` 200; library list returned the 2 existing versions; saving a temporary bundle gave v1 then v2; two simultaneous saves got distinct v3 and v4 (the race fix); latest-by-name returned v4; deleting the bundle removed all 4 versions; the database ended at its original size (2 bundles, 2 versions).
- Backup restore format: re-parsing the backup files returned `ObjectId` and `Date` types for 2 + 2 + 1 documents.
- `client`: `tsc -b` passes; `vite build` succeeds (JS 463.6 kB, 135.5 kB gzipped; CSS 59.1 kB).
- `git check-ignore` confirms `server/.env`, `client/.env` and `node_modules` are ignored; no `.env` file is tracked; no secrets found in tracked files by a pattern scan.

### Baseline recorded, not fixed
- `client`: `npm run lint` fails with **31 problems (25 errors, 6 warnings) in 15 files that were there before this phase**: 15 `react-hooks/set-state-in-effect`, 4 `react-hooks/refs`, 4 `react-hooks/exhaustive-deps` (warnings), 2 `react-refresh/only-export-components`, 2 unnamed warnings, and 1 each of `no-unused-vars`, `preserve-manual-memoization`, `immutability` and `no-empty`. Later phases compare against these numbers.

### Not tested in this phase
- Google sign-in in the browser and compiling in the browser were **not re-run**. No client source file was changed in this phase (only a `package.json` script), so the client behaves as before, but that is an inference.
- The auth smoke tests do not cover a successful Microsoft sign-in or a real Google credential.
- The server's earlier dev instance was already running during these changes; behavior was verified on separate instances on ports 5055 and 5056.

### Next
- Phase 1 (backend foundation): admin allowlist, new Project, Folder, Icon and IconVersion models, permissions, validation.

---

## 2026-10-19: Phase 1, backend foundation (Icon Vault integration)

Logged separately from Phase 0. Server only: no route, client or old-data change yet, so users see no difference. Five commits on `main` (`b6b1bfb`, `d414115`, `6435de3`, `fb08bb7`, plus this entry), local only.

### Changes
| Commit | Change | Files | Reason |
|---|---|---|---|
| `b6b1bfb` | **Admin allowlist.** `ADMIN_EMAILS` (comma-separated, case-insensitive) is read on every call and never stored. An email counts only if the provider verified it (always true for Google), or for a Microsoft sign-in when `MS_TENANT_ID` is a specific tenant id (not `common`, `organizations` or `consumers`). `requireUser` now sets `req.isAdmin`; new `requireAdmin` middleware; `/api/auth/*` and `/api/auth/me` responses gain `role` (`admin` or `user`). A startup warning is logged when the list is empty. | `server/src/lib/admins.ts`, `server/src/middleware/requireAdmin.ts`, `server/src/middleware/requireUser.ts`, `server/src/routes/authRoutes.ts`, `server/src/routes/sessionUserRoutes.ts`, `server/src/index.ts`, `server/.env.example` | Admins come from `.env` (decision), and Microsoft work-account emails are not verified by Microsoft |
| `b6b1bfb` | **Shared error handling.** `AppError` family plus an Express error handler registered after all routes: validation errors become 400 with details, bad ids 400, duplicate keys 409, malformed or oversized JSON 400 or 413, unknown errors a generic 500 that never leaks the message. Response shape stays `{ error: string }`. Added the `zod` dependency (v4). | `server/src/lib/errors.ts`, `server/src/index.ts`, `server/package.json`, `server/package-lock.json` | The old pattern repeated try/catch in every route; Icon Vault returned 500 for validation errors |
| `d414115` | **New models:** `Project` (owner, name, description, prefix, colour, purpose fixed at creation, visibility default private, archive flag), `Folder` (nests via `parentId`), `Icon` (SVG markup stored in the document, soft delete via `deletedAt`), `IconVersion` (each version keeps its own markup). Partial unique indexes: icon slug unique per project among active icons; icon codepoint unique per project among active icons that have one. Indexes are synced at boot. | `server/src/models/Project.ts`, `Folder.ts`, `Icon.ts`, `IconVersion.ts`, `server/src/config/db.ts` | Replace the bundle-only model with projects, folders and per-icon records. Fixes two Icon Vault defects at the root: versions that could not restore old content, and slug clashes when restoring from the trash |
| `6435de3` | **Permissions:** admin and owner can do everything; another user on a public project can view it and copy icons out of it; on a private project nothing; not signed in nothing. **Validation schemas** for projects, folders, icons and batch actions; unknown keys are rejected; purpose cannot change after creation; tags lower-cased and codepoints upper-cased everywhere. | `server/src/lib/permissions.ts`, `server/src/lib/validation.ts` | Decision: public stays read-only for others; Icon Vault accepted unvalidated or inconsistent input in several places |
| `6435de3` and `d414115` | **Tests:** 41 new unit tests (admins, errors, permissions matrix of 4 actors by 2 project kinds, schemas) and 9 database model tests. New script `npm run test:db`; the database tests use a throwaway database that is dropped afterwards. | `server/tests/*.test.ts`, `server/tests/db/models.db.test.ts`, `server/package.json` | Safety net for the later phases |
| `fb08bb7` | README documents `ADMIN_EMAILS`, the new collections and `test:db`. | `README.md` | Keep docs current |

### Database effect
- Starting the server now creates four empty collections in the real database: `projects`, `folders`, `icons`, `icon_versions` (with their indexes). The old `users`, `sprites` and `sprite_versions` are untouched. No existing document was changed.
- The client does not read `role` yet.

### Validation (verified)
- `npm run typecheck` and `npm run build` in `server/`: pass.
- `npm test`: 54 of 54 pass (13 from Phase 0 plus 41 new). `npm run test:db`: 9 of 9 pass; the partial unique indexes work on this Atlas cluster; no test database was left behind.
- Real server and real database, two scenarios (test servers on ports 5057 to 5059, stopped afterwards):
  - `ADMIN_EMAILS` empty: `/api/auth/me` role `user`, startup warning logged.
  - `ADMIN_EMAILS` set to the signed-in user (set only for that test server, not in `.env`): role `admin`.
  - Malformed JSON returns a JSON 400 from the new handler; the library still returns 401 without a token; the four new collections and the icon indexes exist after boot.
  - Re-ran the Phase 0 library regression: list, save v1 and v2, concurrent saves v3 and v4, lookup by name, delete; the database ended at its original size (2 bundles, 2 versions).
- No client file changed in this phase (0 files), so the client checks from Phase 0 still apply.

### Not tested, or open
- `ADMIN_EMAILS` is **not yet set in `server/.env`**, so right now nobody is an admin. The role was verified only through a temporary environment variable.
- The Microsoft single-tenant branch of the admin rule is covered by unit tests only; no Microsoft sign-in was run.
- `requireAdmin` has no route using it yet, so it is unit-level only (it is exercised through no HTTP test).
- The new models are not used by any route yet. Project, folder and icon routes begin in Phase 2. Cascade rules (deleting a project removes its folders, icons and versions; folder cycle checks; same-project checks for folder and icon moves) are service-layer work and are **not** enforced by the database.
- A database named `test` exists on the cluster; it was not created by this work and was left alone.
- Clearing the two old test bundles (decision: start clean, backup already taken in Phase 0) is **not done yet**. The old library still runs on them, so I will clear them when the old library routes are retired at cutover, not now. This corrects the Phase 0 note that mentioned Phase 1.

### Next
- Phase 2 (icon pipeline): project and folder routes, then icon upload, paste, ZIP, sanitizing and optimizing, trash, versions, project-scoped batch actions and search.

---

## 2026-10-19: Phase 2, icon pipeline and project, folder and icon API (Icon Vault integration)

Logged separately from Phases 0 and 1. Server only: no client file changed, and the old library routes (`/api/sprites`) are untouched and still work. Six commits on `main` (`b88b95f`, `9d24318`, `656317c`, `bad6a3e`, `e460ca3`, plus this entry), local only.

### Changes
| Commit | Change | Files | Reason |
|---|---|---|---|
| `b88b95f` | Added `jsdom`, `dompurify`, `svgo` 4, `multer` 2 and `fflate` (ZIP read/write); `@types` for multer and jsdom. Split `src/app.ts` (builds the Express app) from `src/index.ts` (connects and listens). No behaviour change. | `server/package.json`, `server/package-lock.json`, `server/src/app.ts`, `server/src/index.ts` | Tests can start the app without spawning a process |
| `9d24318` | **SVG pipeline:** sanitizer, optimizer, a combined `prepareSvg`, and slug helpers. Removes scripts, event handlers, `foreignObject`, images, filters, `<style>` blocks (their rules are inlined first so colours survive), external links and external `url()` references (attributes and styles), and rejects XML entities. Size comes from width/height or the viewBox; a viewBox is added when missing. After optimizing, size and flags are re-read from the final markup. | `server/src/services/svgSanitizer.ts`, `svgOptimizer.ts`, `svgPipeline.ts`, `server/src/lib/slug.ts` | Icons are shown to other users, so everything stored must be clean |
| `656317c` | **Project and folder routes and services.** Projects: list (scope, status, purpose, search, sort, paging, icon counts and five sample icons from one aggregation), create, detail, update, delete with cascade, duplicate. Folders: list with counts, create, rename, move, delete. Private projects of others answer 404, visible-but-read-only answer 403. `requireDb` middleware (503 when the database is down). | `server/src/routes/projectRoutes.ts`, `folderRoutes.ts`, `server/src/services/projectService.ts`, `folderService.ts`, `cascade.ts`, `server/src/lib/http.ts`, `server/src/middleware/requireDb.ts`, `server/src/lib/validation.ts` | Needed before icons can live in projects |
| `bad6a3e` | **Icon routes and services:** paste, upload (SVG files and ZIPs), copy between projects, list, global search, download (one SVG or a ZIP), edit, optimize (one or many), versions (list, restore), trash (soft delete, restore, permanent delete, empty), batch move/tag/delete/restore/optimize. Also: private-use-only codepoints (`lib/codepoint.ts`), ZIP reading with limits (`zipService.ts`), multer error mapping. | `server/src/routes/iconRoutes.ts`, `server/src/services/iconService.ts`, `zipService.ts`, `server/src/lib/codepoint.ts`, `server/src/lib/validation.ts`, `server/src/lib/errors.ts`, `server/src/app.ts` | The core of the Icon Vault feature set, on MongoDB and the existing sign-in |
| `e460ca3` | README documents the new API, limits and data model. | `README.md` | Keep docs current |

### Icon Vault defects found and not carried over
Confirmed by reading the Icon Vault code and, where noted, by a test here.
- **Optimizing silently did nothing.** Its SVGO configuration (`overrides.removeViewBox`) throws under SVGO 4, and its `try/catch` fell back to the original file. Confirmed by running SVGO 4; a test now proves optimizing shrinks files.
- **Version restore could not restore.** Every version pointed at the same file. Versions now store their own markup; a test restores real old content and undoes the restore.
- **Batch actions reached other projects.** Ids were not checked against the project in the URL, so an editor of one project could move, tag, delete or optimize another project's icons. All batch queries now filter by project; tests assert other projects are untouched.
- **ZIP uploads created duplicate folders** and did not skip `__MACOSX`. Existing folders are reused; metadata and hidden entries are skipped.
- **Restoring from the trash could create a duplicate id.** The unique index now covers active icons only; a restore into a taken id gets a numbered one and the response says so.
- **Size, viewBox and flags went stale after optimizing**, and percentage sizes were read as pixels. Both fixed.
- **Colours from `<style>` blocks were lost** (the sanitizer removed the blocks). Rules are inlined first.
- **A rename could pick a random suffix.** A clash is now refused with 409.
- **Any codepoint was accepted** (even one that would replace a letter). Only Unicode private-use ranges are accepted.
- **Folder ids from other projects were accepted**, and a folder could be moved into its own subfolder. Both refused.
- **Validation errors returned 500**; they return 400 with details.

### Changes in behaviour you may notice
- **Codepoints are not assigned on upload.** They stay empty until set by hand (or by the first font build, which arrives with the font phase). Reason: avoids races and keeps codepoints stable.
- **`removeDimensions` is on by default** when optimizing, so icons scale to their container; the viewBox is kept and size is read from it.
- **Malformed SVG is rejected** (must be well-formed XML) instead of being repaired into an empty icon. Files with undefined entities such as `&nbsp;` are therefore refused.
- **`<title>` is removed** by the sanitizer allowlist (SVGO 4 would keep it).
- Sibling folder names are unique (case-insensitive); deleting a folder moves its icons to the project root.
- Permanent deletion of a single icon requires it to be in the trash first.

### Validation (verified)
- `npm run typecheck`, `npm run build`: pass.
- `npm test`: **91 of 91** pass (no database): sanitizer attacks and survivals, optimizer shrinks files, slug helpers, ZIP limits, codepoint rule, plus the earlier admin, permission, validation, error and session tests.
- `npm run test:db`: **100 of 100** pass against a throwaway database that is dropped afterwards (9 model tests, 41 project and folder tests, 50 icon tests). They cover every kind of user (guest, owner, other, admin) over HTTP, the cross-project batch cases, ZIP uploads with folders, duplicate strategies, versions, trash, copy, search and downloads. No test database was left behind.
- Real server and real database (test server on port 5070, stopped afterwards): created a project, a folder, pasted an icon (156 to 89 bytes), uploaded a ZIP (2 icons, 2 folders), edited and restored a version, trashed and restored, copied to another project, searched, downloaded 3 icons as a ZIP, duplicated and deleted a project (3 icons and 3 folders cascaded); the database ended at its original size (2 bundles, 2 versions, 1 user, no projects). The Phase 1 and Phase 0 checks were re-run and pass, so the old library is unchanged.
- One of my check scripts first failed because Node's `fetch` refuses port 5060; it was rerun on 5070. Another read a ZIP as text; the script was fixed and the affected steps rerun. Neither was a server problem.

### Not tested, or open
- **Nothing was run in a browser**; the client does not use these routes yet (Phase 3 onward).
- Large uploads are processed one file at a time on the server: 1000 icons per request is allowed but **not benchmarked**, and a proxy timeout is possible. The client should send big sets in chunks.
- ZIP size limits trust the sizes in the ZIP header first and re-check after unpacking, so a hostile ZIP can still use memory briefly before it is rejected.
- No rate limiting on any route.
- `jsdom` is pinned to 26: version 30 needs Node 22.15 or newer and failed on Node 22.14.
- Sprite import, font import, project export and import, the sprite and font builders, admin routes (user and project management), API tokens and the CLI are **not done**; they belong to later phases.
- `ADMIN_EMAILS` is still not set in `server/.env`; admin behaviour was verified through test users only.
- Deleting a user (and what happens to their projects) is not implemented yet.
- The old test bundles are still in the database; clearing them waits for the cutover.

### Next
- Phase 3 (frontend platform): Tailwind 4 theme with light, dark and system modes, new dependencies, API client, signed-out landing page and app shell.

---

## 2026-10-19: Phase 3, frontend platform (Icon Vault integration)

Logged separately from Phases 0 to 2. Client only; the server is untouched in this phase. The signed-in workspace is still the pre-redesign compiler screen (it is replaced in Phases 4 and 5). Six commits on `main` (`d2f8797`, `5a79813`, `76cd607`, `541aa4d`, `3e618f3`, plus this entry), local only.

### Changes
| Commit | Change | Files | Reason |
|---|---|---|---|
| `d2f8797` | Added `lucide-react`, `clsx`, `tailwind-merge`; test tooling `vitest` 5, `@testing-library/react`, `user-event`, `jest-dom`, `jsdom` (pinned to 26: version 30 needs Node 22.15+). `npm test` and `npm run test:watch` in `client/`. | `client/package.json`, `client/package-lock.json`, `client/vite.config.ts`, `client/src/test/setup.ts` | The client had no tests and the new interface needs icons and class helpers |
| `5a79813` | **Colour theme system (light, dark, system).** HSL colour tokens for both themes, a class-based dark variant and Tailwind 4 utilities (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, ...). A script in `index.html` applies the saved theme before first paint. `ThemeProvider`, `useTheme` and a three-button `ThemeToggle`; the choice is saved, follows the operating system while on System, syncs across tabs and survives blocked storage. The old light-only screens are wrapped in `.legacy-light` so they stay light. | `client/src/index.css`, `client/index.html`, `client/src/lib/theme.ts`, `client/src/lib/cn.ts`, `client/src/context/ThemeProvider.tsx`, `themeContext.ts`, `client/src/hooks/useTheme.ts`, `client/src/components/ui/ThemeToggle.tsx` | Decision: light, dark and system themes |
| `76cd607` | **Typed API client** for the Phase 1 and 2 routes: a shared axios instance that sends the signed-in user's token and turns every failure into an `ApiError` with the server's message, status and validation details (also from inside downloaded Blobs; unreachable server gets a plain message); types mirroring the server; one function per route in `projects.ts`, `folders.ts`, `icons.ts`. | `client/src/api/http.ts`, `types.ts`, `projects.ts`, `folders.ts`, `icons.ts` | The new screens need a single, tested way to talk to the server |
| `541aa4d` | **App shell and landing page.** `AppHeader` (replaces the old `Navbar`, which is deleted) with brand, theme switch, Sign in or the user menu; `UserMenu` (avatar or initials, name, email, provider, Admin badge, Sign out; Escape, outside click and Tab-away close it); `LandingPage` for signed-out visitors; `App` with loading state, skip link and landmarks; `LoginModal` restyled with tokens and reworded; `AuthContext` and `ServerUser` carry the server's `role`; `ThemeProvider` added in `main.tsx`; small `lib/navigation.ts` so tests can replace the page reload. | `client/src/App.tsx`, `main.tsx`, `client/src/components/shell/AppHeader.tsx`, `UserMenu.tsx`, `client/src/pages/LandingPage.tsx`, `client/src/components/LoginModal.tsx`, `client/src/context/AuthContext.tsx`, `client/src/api/auth.ts`, `client/src/lib/navigation.ts`, removed `client/src/components/Navbar.tsx` | Decisions: sign-in is required (no guest compile), Door 2 layout, replace the old UI |
| `3e618f3` | Ring on the selected theme button; README updated (sign-in required, theme, client tests). | `client/src/components/ui/ThemeToggle.tsx`, `README.md` | The selected state should not rely on a subtle shade alone |

### Changes in behaviour you will notice
- **Signing in is now required.** A signed-out visitor sees the landing page; **compiling without an account no longer works** (decided earlier).
- The login dialog says "Sign in" with a Cancel button (the "Continue as Guest" wording is gone).
- The header is new: theme switch, and for signed-in users an account menu with Sign out. It is exactly 57px tall because the legacy compiler positions itself below a header of that height.
- Dark mode applies to the header, landing page, sign-in dialog and menu. **The legacy compiler and library panel stay light in dark mode** until they are replaced.
- Admins get an "Admin" badge in the account menu once `ADMIN_EMAILS` is set on the server.
- Bundle size: JavaScript 463.6 kB to 506.8 kB (+43 kB), CSS 59.1 kB to 65.2 kB, because of the new libraries.

### Found along the way
- A contrast test that reads the real tokens caught two weak colour choices of my own: input borders at 1.65:1 (needs 3:1 for control edges) and the dark-mode red at 4.2:1 as text (needs 4.5:1). Both were fixed; the test now guards every text, border and focus-ring pair in both themes (WCAG AA 4.5:1 for text, 3:1 for control borders and the focus ring).
- Vitest returns an empty string for `?raw` CSS imports, so the contrast test reads the stylesheet from disk (with Node types for that one file only).
- Node's `fetch` refuses some ports (5060 earlier); not relevant to the client but noted for scripts.

### Validation (verified)
- `npm test` in `client/`: **93 of 93** pass (7 files): theme logic, provider and toggle (including keyboard and cross-tab), contrast of both themes, class helper, the API client (method, URL, query, body, headers and errors for every function), and the app shell (loading, landing, landmarks, skip link, sign-in dialog and its error and success messages, signed-in view, account menu keyboard behaviour, sign out, welcome message).
- `npx tsc -b`: passes. `npm run build`: succeeds.
- `npm run lint`: **31 problems, the same count as the Phase 0 baseline**; none are in code added since (the new files were linted separately and are clean).
- Server unit tests still pass 91 of 91 (the server was not changed).
- In the browser pane (client on 5173, server on 5000): landing page in light and dark; the sign-in dialog in dark; phone width 375px with no sideways scroll; the theme switch applies, saves and the selected button is marked (`aria-pressed`); the signed-in header, account menu and the legacy compiler with its library panel under the new header (layout intact; the library loaded through the existing `/api/sprites`); Sign out returns to the landing page, clears the session, keeps the theme and shows "Logged out successfully"; no console errors. The signed-in checks used a **throwaway test user** created in the development database for this purpose and deleted afterwards (the database is back to 1 real user and the 2 test bundles).

### Not tested, or open
- **A real Google or Microsoft sign-in was not re-run after the shell change.** The sign-in popup is blocked in the browser pane, and the signed-in checks above used a test session instead. The sign-in code path itself was not modified except for reading `role`, but please sign in once in your own browser to confirm.
- System mode was verified by unit tests and by the default (operating system light); switching the operating system to dark while the page is open was not tried in a real browser.
- Only the automated roles, labels and keyboard checks were done for accessibility; **no screen reader and no Firefox or Safari testing**. Theme buttons are 28px, which meets WCAG 2.2's 24px minimum but is smaller than the 44px often recommended on phones.
- Tablet widths were not checked.
- The API client is not used by any screen yet; the old `api/sprites.ts` is untouched and still drives the library.
- The landing page describes sprites, projects, clean uploads and sharing; fonts are not mentioned because the font builder does not exist yet.

### Next
- Phase 4 (dashboard and workspace): project dashboard, folder tree, icon grid and list, icon drawer, bulk actions, trash, upload and paste dialogs.

---

## 2026-10-20: Phase 4, dashboard and project workspace (Icon Vault integration)

Logged separately from Phases 0 to 3. Client only; the server is untouched. Signed-in users now land on a projects dashboard and open project workspaces; the pre-redesign compiler is kept at `/classic` (a "Classic compiler" link in the header, hidden on phone widths) until Phase 5 rebuilds it inside projects. Seven commits on `main` (`d638596`, `b6ed613`, `3523632`, `91084ee`, `49ca45b`, `2e3d216`, `e0ea761`, plus this entry), local only.

### Changes
| Commit | Change |
|---|---|
| `d638596` | Shared building blocks: dialog (centred or side drawer), confirm dialog, buttons, form fields, tabs, action menu, badges, toasts with Undo, safe inline SVG preview, `useResource`, debounce, selection and persistent-choice hooks |
| `b6ed613` | **Projects dashboard** (`/`): cards with icon previews, filters (mine / public, purpose, active / archived, sort; kept in the address), search that also finds icons across projects and copies them into one of your projects, create, edit, duplicate, archive, delete |
| `3523632` | **Project workspace** (`/projects/:id/*`): header with Icons, Trash and Settings sections, read-only note for projects you can only view, folder tree (nested, create, rename, delete, drag icons onto folders, collapsible on phones; selected folder kept in the address) |
| `91084ee` | Building blocks for browsing and adding icons: icon card and table rows, toolbar, bulk bar, upload (files, ZIP, paste; duplicate handling; batches of 100), copy-from-project |
| `49ca45b` | **Icons section** (search, sort, grid or table, "Show more" up to 1000, select, move, tag, optimize, download, move to trash with Undo) and the **icon drawer** (sizes and backgrounds, copy SVG / React / Vue, download, optimize, edit name, folder, tags and codepoint, edit code, version history and restore, font-conversion warnings) |
| `2e3d216` | **Trash** (list, restore one or all with a note when an id or codepoint was taken meanwhile, delete for good, empty trash, each with confirmation) and **Settings** (details, edit, archive or unarchive, delete project) |
| `e0ea761` | Routing: `BrowserRouter`; `/` dashboard, `/projects/:id/*` workspace, `/classic` legacy compiler, anything else redirects to `/`; brand link is a router link |

### Changes in behaviour you will notice
- After signing in you see **Projects**, not the old compiler. The old compiler and its library panel are at **/classic** and still work (verified loading), but they are separate from the new projects until Phase 5.
- Public projects owned by others are read-only for you: you can view, download and copy icons, not change them. Trash and Settings changes are for the owner (and admins).
- Preferences remembered in the browser: grid or table, sort order, preview background, theme.
- Bundle size: JavaScript 506.8 kB to 661.0 kB (192 kB gzip), CSS 65.2 kB to 73.9 kB.

### Validation (verified)
- `npm test` in `client/`: **367 of 367** pass (25 files), including new tests for every screen above (loading, empty, error and retry states, permissions, bulk actions and Undo, drawer edits, trash, settings, routing).
- `npx tsc -b`: passes. `npm run build`: succeeds. `npm run lint`: **31 problems, the same as the baseline**; all new files lint clean.
- In the browser pane with a throwaway test user (deleted afterwards; database back to 1 real user): dashboard; opening a project; icon grid in light and dark and at phone width (375px, no sideways scroll); opening the drawer and renaming an icon (confirmed on the server, list refreshed, focus returned); selecting icons and the bulk bar; move to trash with confirmation, counts updating and the Undo toast; Trash listing and restoring one icon; Settings with the danger zone; `/classic` loading the old compiler.

### Not tested, or open
- **Real Google or Microsoft sign-in** was not re-run (the test session was injected). Please sign in once in your own browser, as agreed.
- Not exercised in the browser: upload and paste dialogs, copy-from-project, folder create, rename and drag-and-drop, tag and move dialogs, optimize, drawer code editing and version restore, empty trash, edit project, archive and delete project. They are covered by component tests only.
- Drag and drop and the 1000-icon limit were tested with simulated events, not real ones; large projects (hundreds of icons) were not tried for speed.
- No screen reader, Firefox or Safari testing; tablet widths not checked.
- Small known rough edges: the search placeholder is cut off on phone widths; on phones the "Classic compiler" link is hidden; the legacy compiler stays light in dark mode.
- Test runs were slow and timed out while the computer was heavily loaded (load average above 200 from system processes); they pass on a quiet machine.

### Next
- Phase 5: bring the compiler into projects (Sprite tab using the existing in-browser engine), import a sprite with a conflict dialog, retire the old library routes and clear the old test bundles.

## 2026-10-20: Phase 5, compiler inside projects and retirement of the old library (Icon Vault integration)

Logged separately from Phases 0 to 4. Client and server. Commits on `main`: `c0d3a20` (Sprite section and sprite import), `02d9f52` (retirement of the old library), plus this entry; local only.

### Changes
| Commit | Change |
|---|---|
| `c0d3a20` | **Sprite section** in every project (`/projects/:id/sprite`, new "Sprite" link in the project header). It builds a sprite **in the browser** from the project's icons (all, or one folder with its subfolders; paged fetch past 1000 icons) using the existing compiler engine (`utils/buildDemo.ts`: sprite document, grid sprite, demo page; `previewPng.ts`; `zipBundle.ts`). Symbol ids are `<project prefix>-<icon id>`, the same id the icon drawer shows. Shows symbol count and size, a sandboxed live preview (the demo page), Copy sprite, Download sprite.svg, Download bundle (ZIP with the sprite, `<prefix>-grid.svg`, `demo.html`, `preview.png`), and the symbol ids with a copy-`<use>` button each (filter for long lists). Anyone who can see a project can build and download; icons whose SVG cannot be read are listed, not silently dropped. |
| `c0d3a20` | **Import a sprite** (editors): pick a sprite `.svg`; each `<symbol>` becomes a standalone SVG file and goes through the normal upload (cleaned, optimized, folder choice, Keep both / Replace / Skip when a name is taken, batches of 100, partial results kept on failure). The project's own prefix is dropped from names so a sprite exported from a project does not double it. The old per-icon conflict dialogs were replaced by the strategy choice. |
| `02d9f52` | **Old library retired.** Client: the old compiler screen (`Compiler.tsx`), all `components/helpers/*`, `useLibrary`, `useSpriteCompiler`, `useFileDropzone`, `api/sprites.ts`, `/classic` and its header link, and the light-only legacy styles are removed. Server: `/api/sprites` routes, the `Sprite` and `SpriteVersion` models, their index sync, and the two sprite maintenance scripts and npm scripts are removed. New one-off `npm run cutover:drop-legacy` (dry run by default, `-- --confirm` to act). README rewritten for the new product and API. |

### Data change (done, as decided in Phase 0)
- After checking that the Phase 0 backup (`backups/2026-10-19T11-28-33-474Z/`: `sprites` 2, `sprite_versions` 2, `users` 1) is intact, the cutover script **dropped the old `sprites` (2 documents: `gg-new`, `gg-2`) and `sprite_versions` (2) collections**. To get them back, restore from that backup folder. The `users` collection was not touched.
- Your own account's projects created since Phase 4 (`gg-pub`, `gg-private`) were not touched.

### Changes in behaviour you will notice
- **There is no stand-alone compiler any more.** To compile, add icons to a project (upload, paste, copy, or import an existing sprite) and open its Sprite section. Loose SVGs can no longer be compiled without putting them in a project first (the "Door 2 only" decision).
- Saved library bundles and their versions no longer exist as such; the two old test bundles are gone (backup kept). Icon version history is per icon now (Phase 2 and 4).
- `/api/sprites*` now answers 404. `/classic` redirects to the dashboard.
- Bundle size: JavaScript 661.0 kB to 503.2 kB (156 kB gzip), CSS 73.9 kB to 47.9 kB, from removing the old screens.
- **ESLint now reports 5 problems instead of 31**, because the files that carried the old baseline were deleted (the remaining ones are in `AuthContext.tsx`, `ToastContext.tsx`, `previewPng.ts`).

### Not carried over from the old compiler (intentional gaps)
- The old **live demo's colour and gradient controls** with copy-paste snippets for HTML, React, Vue, Angular, Svelte and Next.js. The Sprite section's preview is the generated `demo.html` (colour swatches included) and the `<use>` code per symbol. Framework snippets for sprites are not rebuilt; say if you want them.
- The old **"update an existing sprite" conflict-comparison screens** and the old **public/private library tree**. Public and private now live on projects.

### Validation (verified)
- Client `npm test`: **398 tests** in 27 files (new: sprite building and splitting, Sprite section, import dialog; App tests updated). Two timing-sensitive tests timed out in one full run while the machine was overloaded and passed when re-run on their own; earlier full runs passed completely. `npx tsc -b` and `npm run build` pass.
- Server `npm test`: **92 of 92**; `npm run test:db` against a throwaway database: **100 of 100**. Smoke tests updated (project routes answer 503 with no database; `/api/sprites` is 404).
- Browser pane with a throwaway test user (deleted afterwards): Sprite section built a 4-symbol sprite (883 B) with correct ids and a working preview; imported a 2-symbol sprite file (one new symbol, one clashing with an existing name): 2 icons added, the list refreshed to 6 symbols including the numbered duplicate (`spr-home-1`); no new console errors after reload.

### Not tested, or open
- **The downloaded ZIP and sprite file were not opened.** The download button ran without an error and the pieces are unit-tested, but the produced files were not inspected, and the preview image (`preview.png`) is rendered by existing browser code that is not covered by tests.
- Real Google or Microsoft sign-in (please confirm once in your browser, as agreed), copying a sprite to the clipboard in a real browser, import with Replace or Skip in the browser, importing into a folder, very large sprites (hundreds of symbols) and sprites with gradients or shared ids were not tried.
- Imported symbols that use `<use>` references to other symbols are not resolved. External references are removed by the sanitizer.
- Fonts: the Sprite link is shown for font projects too; a Font section arrives in Phase 7.
- Visual: in the import dialog the native control says "No file chosen" after a file was read (the name is shown underneath).

### Next
- Phase 6: admin area (users list, delete, transfer), project export and import, API token and the new CLI.

## 2026-10-20: Phase 6, admin area, project export and import, API tokens and the command line (Icon Vault integration)

Logged separately from Phases 0 to 5. Server, client and a new `cli/` folder. Commits on `main`: `6.1` admin API and token model, `6.2` export, import and server-built sprite, `6.3` API tokens, `6.4` interface, `6.5` command line, plus the final commit with the dialog focus fix and docs. Local only. **You still set `ADMIN_EMAILS` yourself in `server/.env`; it was not touched.**

### Changes
| Part | Change |
|---|---|
| **Admin API** | `GET /api/admin/users` (counts of projects, active icons and active tokens, search, paging, admin flag, "you"); `DELETE /api/admin/users/:id` (you cannot delete yourself; their projects are deleted with icons and versions, or handed to another user with `transferTo`; their tokens are removed; their old session stops working at once); `POST /api/admin/projects/:id/transfer`. Admin session required. No passwords exist, as decided. |
| **Export and import** | `GET /api/projects/:id/export` writes one ZIP: `project.json` (settings, folders including empty ones, each icon's name, folder, tags, codepoint) and the SVGs in folders. Not included: trash and saved versions. `POST /api/projects/import` creates a **new private project owned by the importer** (named "(Imported)" if the name is taken). The manifest is validated (format, version, limits: 5000 icons, 100 MB unpacked, 1 MB per SVG), every SVG goes through the normal cleaning pipeline again (scripts and handlers removed whatever the archive claims), folder names like `..` are neutralised, a missing or broken icon is listed as a problem and the rest still import, a taken codepoint is dropped with a note, and nothing is left behind if no icon can be imported. |
| **Sprite on the server** | `GET /api/projects/:id/sprite` (optionally one folder or `root`) builds the same symbol sprite the web app builds, for scripts and the command line. |
| **API tokens** | New `api_tokens` collection. Tokens look like `isv_` plus 43 random characters, are shown **once**, only their SHA-256 hash is stored, up to 10 active per user, revocable (immediate, permanent, kept in the list as revoked), last-used time recorded (at most once a minute). A token works as the user for projects, folders and icons, but **never has admin rights, and cannot create, list or revoke tokens** (so a leaked token cannot make more). `/api/auth/me` shows `authMethod`. |
| **Interface** | Account menu gains **API tokens** (everyone) and **Administration** (admins). Administration: user table with search and paging, delete dialog (move their projects to another user, or delete them). API tokens page: list, create (secret shown once with a copy button, gone from the page afterwards), revoke with confirmation. Project **Settings**: **Export project** (anyone who can see the project) and, for admins, **Transfer ownership**. Dashboard: **Import project**. |
| **Command line** | New `cli/` (`svgsprite`, Node 18+, no dependencies): `login`, `logout`, `whoami`, `projects`, `icons`, `upload` (files and folders, batches of 100, replace/skip/rename, `--no-optimize`), `sprite`, `export`, `import`. Projects are found by id, exact name or prefix, and an ambiguous name is an error, never a guess. The token is stored in a file readable only by you (mode 600) and never printed. Settings come from flags, then `SVGSPRITE_URL` / `SVGSPRITE_TOKEN`, then the saved file. Exit code 0 ok, 1 error, 2 some files not added. |
| **Dialogs** | Fixed along the way: a dialog now puts the cursor in its first text field when it opens. Before, React's `autoFocus` ran while the dialog was still closed, so the browser focused the Close button; typing a name and pressing Enter closed the dialog. This also affected the folder, tag and project dialogs. |

### Changes in behaviour you may notice
- Typing straight into a dialog that has a text field now works (see above).
- `/api/auth/me` has a new `authMethod` field; for a token it always reports role `user`.
- The server no longer lets the old `sprites` routes exist (Phase 5); nothing else removed.

### Validation (verified)
- Server `npm test`: **101 of 101** (new: archive reading and sprite symbols, token format and hashing). `npm run test:db` against a throwaway database: **132 of 132** (new: admin routes, export/import/sprite, tokens). `tsc` passes.
- Client `npm test`: **432 of 432** (new: admin screen and its dialogs, API tokens screen, dashboard import, Settings export and transfer, account menu links and routes, dialog focus). Lint unchanged at 5 problems; `tsc` passes.
- CLI `npm test`: **29 of 29** against a mock API (arguments, saved settings and file mode, every command, batching, error messages, exit codes, the token never printed).
- **Real end-to-end run** of the command line against the running dev server with a real token and a throwaway user: `whoami`, create a project, `upload` by project name (folder of SVGs; an SVG with a `<script>` and `onload` came back cleaned), `icons`, `sprite`, `export`, `import` (new project with 3 icons), then the token was revoked and the next command was refused with a clear message. A token could not create tokens (403) or call an admin route (403).
- **Browser pane** (second server and client on other ports with the admin email passed as an environment variable, so your `.env` was untouched): the Administration page listed every user including yours; deleting a throwaway user moved their project to the throwaway admin ("1 project moved", counts updated); the API tokens page showed tokens with only prefixes, creating one showed the secret once and it was gone from the page after closing; project Settings showed Export project and Transfer ownership for the admin. All throwaway data (users, projects, tokens) was removed; the database is back to your 1 user and 2 projects.

### Not tested, or open
- **Real Google or Microsoft sign-in** and your real `ADMIN_EMAILS` were not exercised (please sign in once and open Administration as yourself). Be careful on that page: it lists your real account too.
- Not tried in a browser: the Transfer ownership dialog itself (only its button; the dialog is unit-tested and the API is database-tested), revoking from the page (unit and API tested), importing a project from the dashboard, downloading an export from Settings.
- `npm link` / installing the CLI globally, Windows paths, and very large uploads from the CLI were not tried. The CLI does not recreate local folders as project folders (use a ZIP for that).
- Importing a ZIP that was **not** made by this app is refused unless it has a valid `project.json`; plain ZIPs of SVGs go through Add icons or `svgsprite upload`.
- Token management needs a browser session by design; there is no CLI command to create tokens.
- Tokens do not expire on their own (revoke them). Deleting a user removes their tokens.
- Admin can move or delete users but cannot edit them (users come from Google or Microsoft).

### Next
- Phase 7: icon fonts (font builder and font import).
- Phase 8: hardening (accessibility, responsive checks, security review).

## 2026-10-20: Phase 7, icon fonts: build and import (Icon Vault integration)

Logged separately from Phases 0 to 6. Server and client; the command line is unchanged. Commits on `main`: `f57a4a7` (server: build, download, import), `e55ebff` (interface), plus this entry. Local only. **You still set `ADMIN_EMAILS` yourself; your `.env` was not touched.**

### Changes
| Part | Change |
|---|---|
| **Dependencies** | Server: `fantasticon` (the same font engine Icon Vault used; builds TTF, WOFF, WOFF2, EOT, SVG font, CSS, SCSS, JSON and a specimen page), `opentype.js` and `wawoff2` (reading fonts), `@types/opentype.js`. Nothing added to the client. |
| **Font section** | Font projects (chosen when the project is created, as before) get a **Font** section; sprite projects keep **Sprite**, and each project type no longer shows or opens the other's section (a wrong address redirects to the icons). Options: icons to include (all or a folder with subfolders), font name, class prefix, first character, formats, and under Advanced: font height, descent and scaling. **Build font** shows the icon count, each format's size, conversion warnings, and a grid of every glyph drawn with the font that was just built, with its class name and character (click to copy the class). **Copy CSS** and **Download ZIP** (fonts, `.css`, `.scss`, `.json` glyph map, `.html` specimen, README). |
| **Stable characters** | An icon that already has a codepoint keeps it. New icons get the next free character from the chosen start in the Private Use Area (E000 to F8FF, wrapping around), skipping characters used by icons outside the build. For editors the new characters are saved on the icons (so rebuilding later, or building a different folder, never moves a glyph); a viewer of a public project can build and download but nothing is saved. |
| **Import a font** | TTF, OTF, WOFF, WOFF2 and SVG fonts, recognised by their content, not their name (max 8 MB, 2000 glyphs). An optional CSS (`.icon-home:before`) or JSON file gives glyphs real names. The dialog first asks the server what the font holds (nothing is added yet), then imports through the same cleaning pipeline as any upload, with folder, name-clash handling and optimize. By default only icon characters (Private Use Area) are imported, so a text font does not add hundreds of letters; turn that off to import everything. A glyph keeps its character when it is free in the project; otherwise the result says how many were not kept. |

### Behaviour you may notice
- Sprite projects no longer have a Font section and font projects no longer have a Sprite section. If you want both from one set of icons, copy the icons into a project of the other type (Copy from project).
- A font build writes codepoints onto your icons (editors only). They show in the icon drawer under "Font codepoint" and can be changed there.
- Bundle size: client JavaScript 503.2 kB to 539.8 kB. Server install is larger (font tooling); `npm audit` reports high and critical issues in the server's dependency tree (see below).

### Validation (verified)
- Server `npm test`: **122 of 122** (new: codepoint planning including wraparound and a full area, conversion warnings, mapping parser, and reading **real TTF, WOFF, WOFF2 and SVG fonts** built by the same engine, plus damaged, empty, oversized and unrelated files). `npm run test:db`: **152 of 152** (new: building with stable and saved codepoints, scopes, options, shapes other than paths, warnings, viewer rules; the ZIP's contents; importing with names, codepoints, clashes, folders, permissions and bad files; and a **round trip** where a font built from one project imports into another and rebuilds with the same icons and characters).
- Client `npm test`: **461 of 461** (new: preview helper, Font section, import dialog, section redirects). `tsc` and `npm run build` pass; lint unchanged at 5 problems.
- Browser pane with a throwaway user (deleted afterwards): a font project built a 4-icon font (TTF 1.7 KB, WOFF 1.1 KB, WOFF2 744 B) and the glyphs on the page were drawn from the built font (square, circle, house, star on E001 to E004, marked new); a TTF made by the server was imported into a second project through the dialog (dry run said 4 glyphs and the real names; import kept all 4 characters); building there gave the same four glyphs on E001 to E004 with none new; phone width has no sideways scroll. The database is back to your 1 user and 2 projects.

### Not tested, or open
- **Real Google or Microsoft sign-in** and your real `ADMIN_EMAILS`, as before.
- **Fonts from outside this tool** were not tried beyond a hand-made SVG font in tests: real-world icon fonts (Font Awesome, Material Icons, IcoMoon files) have ligatures, composite glyphs and unusual metrics that may need adjustments. WOFF (version 1) and OTF with CFF outlines are read by the same library but were only covered by the tests for WOFF.
- Not checked in a browser: the Download ZIP button in the Font section, copying CSS or a class, filtering a long list, EOT and SVG-font output opened in an old browser, folder scope, and import with a names file. Not checked at all: how a built font looks in a real page outside the preview (open the specimen `.html` from the ZIP to see).
- **Stroke-based icons come out thin or empty** (as in Icon Vault): the font engine needs filled shapes. The warning says so, but there is no "convert strokes to outlines" step yet.
- No build history and no stored builds (Icon Vault kept ZIPs on disk): every build is made on request. Choosing exactly which icons to include by selecting them in the grid is supported by the API (`scope: selected`) but not in the interface yet; use a folder.
- The command line has no font commands yet.
- Up to 1000 icons per font. Characters outside the basic Private Use Area (E000 to F8FF) are not handed out; icons that already have such a character keep it.
- **`npm audit` on the server now lists high and critical issues** in the dependency tree that came with the font tooling; they have not been reviewed or fixed yet (Phase 8).

### Next
- Phase 8: hardening: accessibility pass, responsive check across the screens, security review (including the new dependencies), and the cleanups listed in the open items above.

## 2026-10-20: Phase 8, hardening: dependencies, security, accessibility, responsive (Icon Vault integration)

Logged separately from Phases 0 to 7. Server and client. Commits on `main`: `8.1` (audit fixes and server hardening), `8.2` (lint and automated accessibility tests), plus the final commit with the fixes found by the browser checks and this entry. Local only. **You still set `ADMIN_EMAILS` yourself; your `.env` was not touched.**

### Correction to Phase 7
The Phase 7 entry said the `npm audit` findings on the server "came with the font tooling". That was wrong. They were in Express's own dependencies (`proxy-addr`, `qs`), and the client's in `axios`, `react-router-dom`, an unused `svgo` and a build tool. The font libraries were not involved.

### Changes
| Part | Change |
|---|---|
| **Dependencies** | `npm audit fix` (no forced upgrades) on both packages; removed unused client packages `svgo`, `svgson`, `svgstore`, `zustand`, `react-dropzone` and the unused dev tool `ts-node-dev` (its dependency tree held the last remaining findings). **`npm audit`: 0 vulnerabilities in `server/` and `client/`** (was 2 and 5 in production dependencies, plus 3 in dev tooling). `axe-core` added as a dev dependency for the accessibility tests. |
| **Server headers and CORS** | Every response gets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy` and `Cross-Origin-Opener-Policy`; `/api` answers are `Cache-Control: no-store`; the `X-Powered-By` header is gone. New optional `CORS_ORIGINS` (comma-separated exact origins); when it is not set every origin is allowed as before. |
| **Rate limits** | In-memory, no dependency: sign-in attempts (30 per 15 minutes per address, on the Google and Microsoft sign-in calls only), all API requests (1200 per minute per address), and expensive operations (40 per minute per credential: font build and download, project export, import and sprite, uploads, font import, copy, batch download and optimize). A refused request gets `429`, a clear message and `Retry-After`. New `TRUST_PROXY` (for use behind a reverse proxy) and `RATE_LIMIT_DISABLED=1`. |
| **WOFF2 guard** | A WOFF2 file declares its unpacked size in its header; it is now checked before unpacking, so a tiny file cannot make the server allocate gigabytes. An SVG font with a "billion laughs" entity payload is tested to be harmless. |
| **Lint** | **Zero problems** (was 31 at the Phase 0 baseline, 5 after Phase 5). The two context hooks keep a documented exception for the fast-refresh rule. |
| **Accessibility, found by running axe in the real browser** | (1) Voice-control naming: the icon card, the font glyph button, the Trash "Delete forever" button and the account menu had accessible names that did not contain their visible text. The extra visible text (size, badges, character code) moved outside the button or is drawn by CSS, and the Trash label is now "Delete forever: <name>". (2) **Horizontal scrolling on phones**: the admin table and the icon table view scrolled the whole page sideways, because the tables' screen-reader-only text escaped their scroll box. The scroll boxes are now positioned containers. |
| **Switching projects** | Found by the browser run: going straight from one project to another showed the previous project's data for a moment, and the new sprite/font section guard could redirect using it. The page now trusts only data that belongs to the address (project and folders). |

### Tests added
- Server `tests/hardening.test.ts` (headers, CORS allow-list, limiter windows and keys, sign-in and general limits on the real app, off switch), WOFF2 and entity tests in `tests/fonts.test.ts`.
- Client `src/pages/a11y.test.tsx`: axe over the landing page, header and account menu, dashboard and its dialog, the icons grid, table, selection, drawer, add-icons dialogs, read-only project, Trash, Settings, Sprite, Font (before and after a build) and their dialogs, Administration with the delete dialog, API tokens with its dialogs. It includes a self-check that axe really reports a missing button name, image alt and input label, and a check that the custom labels contain their visible text. Regression tests for the project switch and the scroll boxes.

### Validation (verified)
- Server `npm test`: **135 of 135**; `npm run test:db`: **152 of 152**; CLI: **29 of 29**; client: **481 of 481**; `tsc` and both builds pass; lint clean; `npm audit` 0 and 0.
- **Real browser, axe 4.14 including colour contrast**, eight screens (dashboard, project icons, Sprite, Trash, Settings, Font, API tokens, Administration) in **light and dark**: no violations. Open states in light and dark (account menu, new project, icon drawer, add icons, import sprite, built font, import font, delete user, new token, empty-trash confirm): no violations. One contrast report on the inactive section tabs right after switching to dark did not repeat; it was a colour transition caught mid-way.
- **Responsive** at 375 px (phone) and 768 px (tablet) on all eight screens plus the icon table view: no horizontal scrolling after the fix (the admin and icon tables scrolled sideways before it).
- **Keyboard**: opening the icon drawer moves focus into it, Escape closes it and focus returns to the card that opened it.
- All throwaway users, tokens and projects were removed; the database holds your 1 user and 2 projects.

### Not tested, or open
- **Real Google or Microsoft sign-in** and your real `ADMIN_EMAILS`, as in every phase.
- **No screen reader, no Firefox or Safari testing.** axe finds a large share of problems but not whether the experience makes sense when spoken. Worth one pass with VoiceOver on the main flow (sign in, open a project, upload, open an icon, build a sprite).
- Keyboard use was checked for the drawer only; other flows rely on native controls and the automated checks. Drag and drop of icons onto folders has no keyboard equivalent (use Move in the bulk bar instead).
- Rate limits are per process and in memory. Behind several servers, or after a restart, counters are not shared. Choose real limits for your traffic before going live.
- `CORS_ORIGINS` is not set in development, so every origin is allowed; set it in production. Sessions are kept in local storage (see the README's security notes); moving them to secure cookies would be a larger change.
- Dependency audits are a snapshot: `npm audit` was clean on 2026-10-20 and needs repeating.
- Items still open from earlier phases: stroke-to-outline conversion for fonts, selecting icons for a font in the grid (API supports it), font commands in the CLI, build history, a fixed `Compiler` feature gap (framework snippets for sprites), and importing fonts from other tools beyond the tested formats.

### Next
- A real sign-in and `ADMIN_EMAILS` check in your own browser, then a manual VoiceOver pass.
- Decide what to do with the open items above; none blocks use.

## 2026-10-20: Follow-up, Generate a sprite or font from the selected icons (change request)

Requested after Phase 8: when icons are selected there was only a Download button. Client only. Logged separately from the phases; one commit on `main`, local only.

### Changes
| Part | Change |
|---|---|
| **Generate button** | The bar that appears when icons are selected has a new primary button before Download: **Generate sprite** in a sprite project, **Generate font** in a font project. Everyone who can see the project gets it (building was already open to viewers). |
| **Checklist popup** | The button opens "Choose icons for the sprite / font", with the selected icons already ticked (all of them if none were selected). It has a search by name or tag, a folder filter (a folder includes its subfolders, plus Uncategorized), Group by folder on or off, **All (n)** and **Selected (n)** views, Select all and Deselect all (they act on what is shown), Select folder and Deselect folder with a partial-state checkbox, collapsing folders, a live count, and a primary **Generate sprite (n icons)** button that is disabled with nothing ticked (and for a font above 1000 icons). Cancel leaves the Icons screen and its selection as they were. |
| **After confirming** | You go to the project's **Sprite** or **Font** section with exactly the chosen icons: "Chosen icons (n)" appears in the icon menu. The sprite is built at once; the font **builds by itself** (once, not on every redraw). Both sections also have a **Choose icons** button to reopen the checklist later; choosing again rebuilds with the new choice, and picking "All icons" or a folder goes back to the old behaviour. The choice travels in the address (router state), so it is gone after a new visit from the dashboard, and a damaged value is ignored. |
| **Preview colours (fix found while checking)** | Plain shapes that set no fill (SVG paints them black) were nearly invisible on the dark icon cards. Icon previews now follow the text colour, so they show in both themes; icons with their own fill or stroke are unchanged. |

### Validation (verified)
- Client `npm test`: **517 of 517** (new: the checklist dialog; the bulk bar button and its position before Download; the Icons screen opening the checklist and navigating with the chosen ids for sprite and font projects, cancelling, and read-only viewers; Sprite and Font sections with handed-over, absent and damaged choices, auto-build only once, and Choose icons; the axe checks for the Generate button and the checklist in both views; the preview colour). Types and lint clean.
- Real browser (dark theme, throwaway user): select all, Generate sprite, the checklist matches the reference layout, untick a folder (count 5, button reads "Generate sprite (5 icons)"), confirm: Sprite section shows "Chosen icons (5)", 5 symbols, 800 B. Same for a font project: "Chosen icons (6)" and the font was built on arrival (TTF 1.9 KB, WOFF 1.2 KB, WOFF2 860 B). Test data removed; the database holds your 1 user and 2 projects.

### Not tested, or open
- The checklist was not run through a screen reader, and its axe check in the real browser (light and dark, contrast included) was not repeated for it; the automated axe tests in jsdom pass.
- A project with hundreds of icons in the checklist (rendering speed) was not tried; the font limit message at 1000 icons is covered by a test with simulated data only.
- Reloading the Sprite or Font page keeps the choice (the browser keeps the address state), opening the section from the project tabs does not.
- The CLI has no equivalent (it already builds a whole project or folder with `sprite`).

## 2026-10-20: Follow-up, editable codepoint mapping and a fix for codepoints that did not reach the font (change request)

Requested after reviewing the Icon Vault screen "Stable Unicode Codepoints Mapping": that table was not in this project's Font section (codepoints could only be changed one icon at a time in the icon drawer), and in Icon Vault an edited hex value did not show up in the output. Server and client. One commit on `main`, local only.

### What was wrong
Checked against the real font engine: an edited value from E000 to F8FF **does** reach the CSS, the glyph map and the font file. A value above FFFF (the two supplementary Private Use planes, which the old rule accepted) does not: the CSS said `\f0001` while the font file put the glyph on the wrong character. That is the same symptom you saw (the value looks saved but the output disagrees), so the rule was wrong rather than the saving.

### Changes
| Part | Change |
|---|---|
| **One rule for a font character** | Exactly **four hex digits from E000 to F8FF**, everywhere: the icon edit API, the icon drawer (field limited to 4 characters, new hint), the table below, the archive import and the font import (a glyph on another character simply loses its character and is counted). The old messages said "E000-F8FF" while the checks allowed more. |
| **Build guard** | If an icon still has an old value outside the range (it could only have been set before this rule), the build stops with a message that names the icons ("star (F0001) ... change or clear it in the icon's details") instead of producing CSS and a font that disagree. |
| **Mapping table** | New "Stable Unicode codepoints mapping" table under the built font, like the Icon Vault screen: **Preview, Icon name, Slug, Assigned hex codepoint (U+ box), CSS entity** (`\e701`). Editors type a new value (hex only, capitals, 4 characters) and press Enter or leave the box: it is saved on the icon, then **the font is rebuilt with the same options**, so the preview glyph, the character grid, the copied CSS and the downloaded ZIP all use it. Empty box = clear (the icon gets the next free character on the next build). Escape puts the saved value back. A value outside the range is refused in the box without asking the server; a clash with another icon shows the server's reason beside the box ("Codepoint E701 is already used by ...") and changes nothing. Viewers see the table as plain text. Swapping two characters takes three edits (clear one first), because every character is unique. |

### Validation (verified)
- Server `npm test`: **136 of 136** (new: the font-character rule). `npm run test:db`: **160 of 160** (new, reading the font file back with a font parser): an edited character appears in the build, the CSS, the glyph map **and the font file itself**, and the glyph is no longer on its old character; a clash is refused and the output stays as it was; a swap in steps works; clearing gives the next free character; values outside E000 to F8FF are refused (400) and an old out-of-range value stops the build with a clear message naming the icon; only editors can change a character.
- Client `npm test`: **539 of 539** (new: the table, and the full edit-then-rebuild flow in the Font section including download and copy using the rebuilt output, clash message, invalid input, clearing, Escape, read-only and busy states). Types and lint clean.
- Real browser (dark theme, throwaway user): built a 3-icon font (E001 to E003); typed `e701` for add-square and pressed Enter: the grid card, the table and the CSS entity (`\e701`) updated, the WOFF2 size changed (it was rebuilt) and the glyph still drew from the rebuilt font; typing E701 for another icon showed "Codepoint E701 is already used by "add-square"." beside a red box and changed nothing else. axe on this page, error state included, light and dark: no violations. Test data removed; the database holds your 1 user and 2 projects.

### Not tested, or open
- The table has no per-row "reset to automatic" button other than clearing the box.
- Editing is one icon at a time with a rebuild each time; a project with hundreds of icons rebuilds a bit slower after each edit.
- The Icon Vault project itself was not changed (it is a separate project); the same rule and the same read-back test would apply there.
- Not tried: a screen reader on the table, and editing when the project has icons filtered out of the build (the table shows only the icons in the current build).

## 2026-10-20: Follow-up, checklist on the destination page and a grouped Font page (change request)

Requested after trying the Generate flow: the checklist should appear on the Font page (not before leaving the Icons screen), the Font page repeated the same icons twice and needed grouping like Icon Vault, and the main actions belong at the top with Copy CSS beside them. Client only. One commit on `main`, local only.

### Changes
| Part | Change |
|---|---|
| **Flow** | **Generate font / Generate sprite** on the bulk bar now goes straight to the project's Font or Sprite page with the selected icons. That page opens "Choose icons for the font / sprite" over itself, with the selection ticked. Confirming builds (font) or shows (sprite) exactly those icons. **Cancel** keeps the chosen icons on the page without building. The "open the checklist" flag is removed from the address once read, so reloading or coming back does not pop the popup up again. Both pages call the reopen button **Review / edit checklist**. (Before, the popup opened on the Icons screen and the pages then built automatically; that auto-build is gone.) |
| **Font page layout** | Top row: **Build font** (primary), **Copy CSS** (right beside it, disabled until there is a build), **Download ZIP**, and **Import a font** for editors. Below, titled groups like Icon Vault: **Icons** (says how many icons will be compiled, the "Icons to include" menu, and **Review / edit checklist**), **Font settings** (name, class prefix, **Starting codepoint (hex)** with the "Default E001" hint, Advanced) and **Target formats** as toggle pills (WOFF2, WOFF, TTF, EOT, SVG). |
| **No repeated section** | The grid of character tiles and the mapping table listed the same icons twice. They are now one section, **Stable Unicode codepoints mapping**: Preview, Icon name, Slug, editable hex codepoint (with a "new" tag for characters just assigned), CSS entity, and a new **CSS class** column with a copy button. The filter above it still searches name, class and character. |
| **Download ZIP** | Now always available (it builds on the server from the current settings), not only after a build. |

### Validation (verified)
- Client `npm test`: **548 of 548** (updated and new: the actions group and its order, Copy CSS off until a build, the "how many icons" sentence, format pills, the checklist opening on arrival and cancelling or confirming, the flag not reopening the popup, Generate on the Icons screen going straight to the page for sprite and font projects, the class column and its copy button, one table instead of two). Types and lint clean.
- Real browser (throwaway user, font project with 7 icons): select all, Generate font: the URL became the Font page and the checklist opened over it with 7 ticked; confirming built the font (TTF 2.0 KB, WOFF 1.3 KB, WOFF2 924 B); the page shows the grouped sections and a single mapping table with seven rows; reloading did not reopen the popup; axe: no violations in light, and none in dark when the page is loaded in dark mode; at 375 px the page does not scroll sideways, the actions wrap, and only the table scrolls inside its box. Test data removed; the database holds your 1 user and 2 projects.

### Note on how dark mode was checked
Toggling the theme on an already open page in the hidden browser pane froze colour transitions halfway and made axe report false contrast failures; loading the page in dark mode from the start gave a clean result. Real dark-mode checks should load the page in dark mode.

### Not tested, or open
- I read "grouping" as grouping the page into titled sections and merging the duplicate list. If you meant grouping the mapping table's rows by folder (as the checklist can), that is not done; the table is one flat list.
- The Sprite page keeps its own layout (selector row, then actions) and only got the new flow and the "Review / edit checklist" label; it was not regrouped like the Font page.
- A screen reader was not used on the new layout.

## 2026-10-20: Follow-up, no popup on the way to the Font or Sprite page (change request)

Requested after seeing the checklist open over the Font page: the popup is not wanted there; go directly to the page. Client only. One commit on `main`, local only. This replaces the "checklist opens on arrival" behaviour of the previous follow-up.

### Changes
- **Generate font / Generate sprite** on the bulk bar now goes **directly** to the Font or Sprite page. No popup opens on the way or on arrival. The page shows the selected icons as **Chosen icons (n)** and says "n icons will be compiled into the font glyphs and CSS".
- The font is **built when you press Build font** (nothing is built automatically on arrival); the sprite page, which builds as soon as it has icons, shows the chosen icons at once.
- **Review / edit checklist** on the page still opens the checklist (with the chosen icons ticked) to change the choice; confirming rebuilds with it. Nothing else about the checklist changed.
- The plumbing for opening it on arrival (the router-state flag and the small hook that cleared it from the address) was removed.

### Validation (verified)
- Client `npm test`: **548 of 548** (updated: arriving from the bulk bar shows no dialog and builds nothing; Build font uses exactly the chosen icons; Review / edit checklist opens with them ticked and rebuilds on confirm, and keeps them on Cancel; the Icons screen hands over only the icon ids; a damaged hand-over is ignored). Two heavy tests were given longer waits for busy machines. Types and lint clean.
- Real browser (throwaway user, font project with 4 icons): select all, Generate font: the page became `/font` with no popup, "Chosen icons (4)", Copy CSS disabled, nothing built yet. Test data removed; the database holds your 1 user and 2 projects.

### Not tested, or open
- The sprite page was not re-checked in the browser for this change (its test coverage is updated and passes).

## 2026-10-20: Follow-up, Build font on the bulk bar and Download font as the main action (change request)

Requested after the direct flow: use "Build" instead of "Generate", build first and then open the Font page, and make Download font the main action there. Client only. One commit on `main`, local only.

### Changes
| Part | Change |
|---|---|
| **Bulk bar** | The primary button is now **Build font** (font projects) or **Build sprite** (sprite projects), before Download. The checklist's confirm button and wording say "Build" too ("Build font (7 icons)", "Ready to build with 7 icons"). |
| **Build, then open the page** | In a **font project**, Build font builds the font on the server from the selection, with the project's usual font settings, and only then opens the Font page, which shows the finished result straight away (sizes, the whole mapping table, Copy CSS enabled) without building it a second time. While it builds the button shows it is working and the other bulk actions are disabled. If the build fails (for example an old out-of-range character) the reason appears as a message and you stay on the Icons screen with your selection. In a **sprite project**, Build sprite opens the Sprite page, which builds in the browser as before. |
| **Download font is the main action** | The Font page's top row is now **Download font** (blue, first), **Copy CSS**, **Build font** (secondary: rebuild after changing settings), **Import a font**. It was "Download ZIP" before. It is always available (it builds on the server from the current settings). |
| **One set of starting settings** | The Icons screen and the Font page now share their default font settings (`lib/fontDefaults.ts`), so a font built from either place is identical. The finished build is handed to the Font page in memory for that one navigation (`lib/fontBuildCache.ts`): a reload, another project or a later visit starts from the page's own settings. |
| **Fix found by the browser check** | The preview glyphs in the table showed as empty boxes after arriving from the Icons screen: the page's cleanup removed the preview font the Icons screen had registered, while the page still showed the build (React's development double-mount does this). Registering a preview font is now idempotent and the Font page makes sure the font of the build it shows is registered, so the previews draw. |

### Validation (verified)
- Client `npm test`: **557 of 557** (new or updated: the Build labels everywhere; the font project building with the selection and default settings then opening the Font page with state and a waiting build; the failure message and staying put; the working state; refreshing lists only for editors and when new characters were saved; sprite projects opening the Sprite page without a server build; the Font page opening already built without calling the server, taking the waiting build, ignoring one for another project or after a reload, and downloading at once; the action order with Download font as the only primary button; idempotent font registration). Types and lint clean.
- Real browser (throwaway user, font project with 5 icons): select all, Build font: the page became `/font` with **Download font** as the blue main button, Copy CSS enabled, 5 icons with TTF 1.8 KB, WOFF 1.2 KB, WOFF2 808 B, the mapping table complete, and (after the fix) the glyph previews drawn from the built font. Test data removed; the database holds your 1 user and 2 projects.

### Not tested, or open
- The Download font button itself was not clicked in the browser for this change (the same download was checked earlier; the click is covered by tests).
- A font project with hundreds of icons takes longer to build before the page opens; the button shows it is working, but there is no progress figure.
- The Sprite page's top actions were not rearranged.

## 2026-10-20: Follow-up, Upload icons menu on the Icons page (change request)

Requested after the Font page review: Build font and Import a font should not sit on the Font page; on the Icons (project home) page the main button becomes **Upload icons** with the extra ways to add icons, as in Icon Vault. Client only. One commit on `main`, local only.

### Changes
| Part | Change |
|---|---|
| **Upload icons** | On the Icons page the blue **Add icons** button is now a split button, **Upload icons** (opens the upload dialog) plus a chevron that opens a menu titled "Add icons". The same wording is used on the empty state. |
| **The menu** | **Upload Files / ZIP** (Upload SVGs or drag & drop ZIP files), **From Another Project** with a "New" badge (Select and copy icons from other workspaces), **Import SVG Sprite** (Extract symbols from an SVG sprite file), **Import Icon Font** (Extract glyphs from TTF, WOFF, WOFF2), **Paste SVG Code** (Paste raw SVG markup directly; opens the upload dialog on its Paste tab). Keyboard: Arrow Down or Arrow Up on the chevron opens it, arrows, Home and End move, Escape closes and returns focus; clicking elsewhere closes it. The separate **Copy from project** button stays beside it. Only people who can add icons see any of this. |
| **Import moved** | The sprite and font import dialogs now open from this menu. **Import a sprite** is gone from the Sprite page and **Import a font** from the Font page; the dialogs themselves are unchanged. |
| **Build font stays** | The Font page keeps **Build font** (secondary, after Download font and Copy CSS): it is how changed settings are applied and how the page is built when you arrive from the tab rather than from the Icons page. It can be removed on request. |
| **Small fix** | The upload dialog accepts which tab to show first. The Upload icons label no longer wraps on a phone. |

### Validation (verified)
- Client `npm test`: **561 of 561** (new: the menu's five items and descriptions, each item's callback, keyboard moves and Escape with focus return, closing on an outside click, no menu for read-only people; the sprite and font import tests moved into their own file and run against the dialogs directly; the a11y checks now open the menu and both import dialogs). Types and lint clean.
- Real browser (throwaway user and project): the menu matched the reference, Import Icon Font opened its dialog, dark mode and a 375 px phone width had no horizontal scroll and the label on one line, the Font page's actions are Download font, Copy CSS, Build font. Test data removed; the database holds your 1 user and 2 projects.

### Not tested, or open
- Importing a real sprite or font file in the browser was not repeated; the dialogs are unchanged and covered by tests.

## 2026-10-20: Follow-up, project screen laid out like Icon Vault, with icon size, colour and style (change request)

Requested from an Icon Vault screenshot: the four levels of menus and the folder sidebar should look the same, and the Icons screen should get size, colour and type options. Client only. One commit on `main`, local only. The archive filter on the dashboard stays as it is (you asked to keep it).

### The four levels
| Level | Change |
|---|---|
| **1. Project bar** | One bar holds the colour dot and name, the badges **Prefix: M**, **Icon Font Project** (or Sprite Project) and Private or Public, the section menu, and on the right the buttons. |
| **2. Section menu** | A pill menu: **Icons** (with count), **Icon Font** (or **Sprite**), **Settings**, and a **Trash** icon (with its count when something is in it). The Settings tab is named Settings, not "Settings & Docs", because there are no docs pages here. |
| **3. Buttons** | **Upload icons** (with its menu) and **From Another Project** now sit in the project bar on the Icons screen (the bar's right side; on other sections that space is empty). The button was called "Copy from project" before. |
| **4. Toolbar** | Search, then the new **size**, **colour** and **style** controls, grid or list, sort and the preview background. Under it, Select all and a breadcrumb: project, then the folder, then "(n icons)". |

### Sidebar
A card titled **FOLDERS** with a **+** button for a new folder (the full-width New folder button is gone). All icons, Uncategorized and each folder keep their counts and menus; the chosen row is tinted blue like the reference. Dragging icons onto folders works as before.

### Size, colour and style (new)
| Option | What it does |
|---|---|
| **Size** | A slider with minus and plus buttons, 16 to 96 px, shown as "40px". Cards grow to fit. |
| **Colour** | **Default** (the theme's text colour), seven swatches and a custom colour picker. |
| **Style** | **Natural** (as designed), **Flat** (solid shapes in the one colour), **Wireframe** (outlines only, in the one colour). |

These change only how icons are drawn on screen, in this browser (remembered per browser). They do not change the stored icons or any download or build. In Natural, the colour only affects icons that use the text colour (`currentColor`); icons with their own colours keep them. Flat and Wireframe use the one colour for everything.

### Validation (verified)
- Client `npm test`: **567 of 567** (new: the size controls and their limits, colour choices, style choices with the current one marked, the breadcrumb, the buttons going into the header slot, the header's new labels). Types and lint clean.
- Real browser (throwaway user, font project with a stroke icon and a filled icon): the bar, pill menu, sidebar and toolbar render as designed in dark mode; Flat plus Green recoloured and filled both icons; the size slider grew the cards; the choice survives a reload; at 375 px there is no horizontal scroll. A rapid slider-then-swatch change lost the colour once (a stale value); fixed with a latest-value reference. Test data removed.

### Not tested, or open
- The reference also shows each icon's character (for example E701A) on the cards of a font project; that was not added.
- The reference's filter button beside sort was not added (the filters here are sort and the folder list).
- Light mode and the browser pane were checked at phone width and a wide desktop width only once each; the page width limit grew to 96 rem.

## 2026-10-20: Follow-up, no per-icon preview size (change request)

Requested because icon size is now one project-wide setting in the Icons toolbar. Client only. One commit on `main`, local only.

- The icon details panel no longer has its own size buttons (16 to 128). Its preview uses the toolbar's size, colour and style, so one choice applies everywhere. The preview background choice stays.
- Validation: client `npm test` **568 of 568** (the old size-button test became two: no size buttons and the default of 40 px, and following a size saved from the toolbar). Types and lint clean. Not checked in the browser; the change only removes a row of buttons and reuses the toolbar's saved value.
- Also removed from the details panel: its own **Preview background** switch. The panel uses the background chosen in the Icons toolbar (saved in the browser), like the size.
- Open: to see an icon at an exact size such as 128 px you now use the toolbar slider (maximum 96 px).

## 2026-10-20: Follow-up, toolbar in one row and search beside Select all (change request)

Requested after seeing the toolbar. Client only. One commit on `main`, local only.

- The breadcrumb (project, folder, count) is removed. **Search** takes its place, beside **Select all**.
- Size, colour, style, sort, background and grid or list are now in one row (on screens at least 1440 px wide; the style buttons then show icons only, with their names from 1700 px; narrower screens wrap and a phone stacks them).
- Validation: client tests, types and lint (see the count in Known issues). Checked in the browser at 1500 px: one row, no sideways scroll.

## 2026-10-20: Follow-up, coloured badges, header rows and Created by on the cards (change request)

Requested from the project bar screenshot. Client only. One commit on `main`, local only.

- **Colours:** Private is violet, Public green, Icon Font indigo, Sprite amber (`components/projects/ProjectBadges.tsx`). The words stay, so colour is never the only signal. The dashboard cards use the same badges (their type reads "Font" or "Sprite").
- **Project bar:** next to the name only the visibility and type badges. The prefix, the Archived badge and the description moved to the row under the bar. "by <owner>" is removed from the project page.
- **Dashboard cards:** the owner moved from under the name to a last line, "Created by You" or "Created by <name>", under a thin rule.
- Validation: client `npm test` **571 of 571**, types and lint clean. Real browser (throwaway user, one font and one sprite project): the cards and the project bar looked as described in light mode. Dark mode was not looked at for these badges; they use lighter text shades there. Test data removed.

## 2026-10-20: Follow-up, sort icon, fewer colour tiles, style labels back (change request)

Requested after seeing the toolbar. Client only. One commit on `main`, local only.

- **Sort** is an icon button (up and down arrows) instead of the "Newest" dropdown. It still opens the same five choices (Newest, Oldest, Name A–Z, Name Z–A, Largest); the tooltip names the current one.
- **Colour** is four tiles: Blue, Green and Red, and a rainbow tile that opens the colour picker for any other colour. The "Default" button is gone: pressing the selected tile again returns to the default (theme) colour, and its tooltip says so.
- **Style** shows the icon with its name again (Natural, Flat, Wireframe), at every screen width.
- The one-row toolbar now starts at 1366 px wide (the controls are narrower).
- Validation: client tests, types and lint (counts in Known issues). Checked in the browser at 1500 px: one row, no sideways scroll.

## 2026-10-20: Follow-up, simpler header, search first, background moved into More (change request)

Requested after seeing the toolbar. Client only. One commit on `main`, local only.

- **Header:** the prefix and the description are no longer shown on the project page (the prefix is still in Settings, the description in Edit details). Only an Archived badge and the read-only note can appear under the bar.
- **Toolbar:** **Search** is first in the row again, before the size control. Select all now sits alone on the row below.
- **Background:** the "Background: Match theme" dropdown is gone. A **More** button (after sort) opens a menu with the preview background as a single-choice list (Match theme, Light, Dark, Checkerboard), with the current one ticked. It is the place for further view options later. Keyboard: arrows open and move, Escape closes.
- Validation: client tests, types and lint (counts in Known issues). Checked in the browser at 1500 px: search first, one row, More menu opens with the current background ticked.

## 2026-10-20: Follow-up, breadcrumb on top, centred menu and a menu for Uncategorized (change request)

Requested from the Icon Vault screenshots. One commit on `main`, local only. The Font page comparison is a separate entry.

### Client
- **Breadcrumb:** a centred pill "Dashboard / <project>" above the project bar (Dashboard links to the project list). The back button with the "Projects" label is removed.
- **Menu:** Icons, Icon Font (or Sprite), Settings and Trash are centred in the bar (on screens from 1024 px wide; the name and badges sit on the left and the upload buttons on the right).
- **Uncategorized menu:** the sidebar row has a ⋮ menu like the folders: **Rename** (the owner or an admin) and **Reset name** (when renamed) and **Move all to trash** (editors; disabled when empty; asks first; the toast has Undo).

### Server
- New project setting `uncategorizedName` (up to 40 characters, empty means "Uncategorized"), changed with the existing `PATCH /api/projects/:id` (owner or admin only) and returned with every project.
- New `POST /api/projects/:projectId/icons/uncategorized/trash` (editors): sends every active icon that is in no folder to the trash and returns their ids (used for Undo through the existing restore call).
- What "rename" means: Uncategorized is not a real folder (those icons simply have no folder), so renaming it only changes the label shown in the sidebar and the mobile folder button. Other places still say "Uncategorized (project root)" in their folder pickers.

### Validation (verified)
- Server database tests: new `tests/db/uncategorized.db.test.ts` (4 tests: rename, trim, reset; the 40 character limit and a non-owner refused; only folderless icons trashed and restorable; edit access needed and other projects untouched). Client tests for the menu (labels, rename dialog, reset, confirm then trash, disabled when empty, hidden for read-only).

## 2026-10-20: Follow-up, Font page compared with Icon Vault: three columns, base class and build history (change request)

You asked whether every feature of the Icon Vault font page was considered (screenshots 2 and 3). I compared them with the Icon Vault source and its running page. Result: most were there; these were missing and are now added. One commit on `main`, local only.

### Comparison
| Icon Vault feature | Before | Now |
|---|---|---|
| 1. Scope selection as radios (Whole project (n icons), Selected folder with a folder list, Selected icons (n)) | one dropdown | radios as in Icon Vault; picking Selected icons with nothing chosen opens the checklist |
| Icon checklist card with "n / total" and Review / edit checklist | a button | the card with the counter |
| Target formats as pills | had it | same, moved under the scope column |
| 2. Font name, CSS prefix, **Base class**, starting codepoint with "Default: E001 (Private Use Area)" | no base class | base class added (optional) |
| 3. Font height (EM), descent, normalize | hidden under "Advanced" | always visible in the third column; the normalize label now reads "Normalize glyph bounds to height" |
| Stable Unicode codepoints mapping (preview, name, slug, hex, CSS entity) | had it, editable | unchanged |
| **Font build history** (kept packages with Download and delete) | none | added, see below |

### Base class
Optional. Empty keeps the old stylesheet (any element whose class starts with the prefix). With a base class such as `m` the stylesheet has `.m:before` and `.m.m-home:before`, so markup is `class="m m-home"`. The README inside the ZIP and the Copy class button follow it. Letters, digits, - and _, starting with a letter, up to 30.

### Font build history
- Every package an **editor** downloads is kept (the ZIP and a few facts). The page shows them newest first with date, size, formats, **Download** (anyone who can see the project) and a delete button (editors, with a confirmation). The server keeps the last 20 per project and skips any over 12 MB; they are removed with the project. Downloads by viewers are not kept.
- This changes an earlier statement: the Font page used to store nothing on the server. It now stores those ZIPs (collection `font_builds`). The History tells you what is kept; the "Build font" preview and codepoints work as before.

### Validation (verified)
- Server unit **136 of 136**; database tests **171 of 171** (new: `fontHistory.db.test.ts` with 7 tests: keeping, listing and downloading again, viewers' downloads not kept but listable on a public project, private projects hidden, delete rules, the 20 limit and removal with the project, the base class stylesheet and README, bad base classes refused; and the 4 uncategorized tests).
- Client **593 of 593** (new: the history list, empty, error, download and delete; the three columns, the folder and base class checks, Selected icons opening the checklist, copying a class with the base class). Types and lint clean.
- Real browser (throwaway user, font project with two icons and one kept download): the page showed the three columns, the history row, the breadcrumb pill and centred menu; Uncategorized renamed to "Loose icons" from its menu. A browser accidentally pointed at the Icon Vault tab briefly wrote a test sign-in into that tab's storage; it was removed again. Test data deleted (the font history went with the project): the database holds your 1 user and 2 projects.

### Not tested, or open
- Clicking the page's **Download font** button was not repeated in the browser; the download and the history entry are covered by the server tests.
- Icon Vault shows "Generate Font (n)" and a compiled-in-browser specimen panel; here Build font keeps its own preview and the mapping table.

## 2026-10-20: Follow-up, tab names (change request)

Client only. One commit on `main`, local only. In the project menu the **Icon Font** tab is now **Font Builder** and **Settings** is now **Project Settings**. **Icons**, **Sprite** (sprite projects) and the Trash icon are unchanged, and the Icon Font Project badge keeps its name. Client tests and lint pass; checked by test only. Earlier entries above still use the old names because they describe what was done then.

## 2026-10-20: Follow-up, Download font after Build font, and version numbers in the history (change request)

One commit on `main`, local only.

- **Download font** (the filled main button) is switched off until a font has been built, and a line under the actions says "Build the font first; then Download font is ready." A font built on the Icons screen counts (the page opens already built). **Build font** is now the outlined primary button (blue border and text), and **Copy CSS** stays plain and also waits for a build. If you change settings after a build, Download font still uses the current settings; press Build font to see the new result first.
- **Version numbers:** every kept package gets a version (v1, v2, ...) per project. The history shows it as a badge ("v3"), in the button names ("Download Feather v3 from ...") and in the file name of a download from the history (`Feather-font-v3.zip`). Numbers are never reused: after deleting the newest, or when the 20 build limit drops the oldest, the next one still continues the count. The count lives on the project (`fontBuildCount`, not shown anywhere else). A package downloaded straight from the Font page keeps its plain name (`<font>-font.zip`).
- Validation: server database tests **173 of 173** (new: versions in order, never reused after a delete or the 20 limit, each project counts on its own); client **594 of 594** (new: Download font off until built with its hint, the outlined Build font, version badges and names). The slow accessibility lookup for the icon grid got a longer timeout because it failed twice under load. Types and lint clean. Not checked in the browser this time.

## 2026-10-20: Follow-up, Font Builder in the bar and built automatically, Project Settings like Icon Vault, Manage menu for admins (change request)

One commit on `main`, local only.

### Font Builder
- The left block ("Icon font", the sentence under it, and the "Build the font first" hint) is gone. **Download font**, **Copy CSS** and **Build font** now sit in the project bar on the right, like Upload icons on the Icons screen.
- **The font builds by itself** (your question about automating it): when the page opens, and 0.7 seconds after the last change to any setting, scope, format or checklist choice. Download font and Copy CSS are ready as soon as the first build finishes. **Build font** stays as a manual rebuild. Nothing is built while the settings are not valid yet (for example an empty font name) or when no icon is covered; a font handed over from the Icons screen is not built a second time; only the newest build's answer is used when changes come quickly.
- Side effect to know: for people who can edit, a build saves new characters on icons that had none, so just opening the page can now assign them (they would have been assigned by the first Build font anyway, and they never change afterwards).

### Project Settings (like Icon Vault)
- One card with **Save settings** at the top right (the primary action, switched on only after a change), the owner, the project type (shown, with "Permanent (cannot be changed)"), name, description, prefix, accent colour and Private or Public cards. The old "Edit details" dialog is not used here any more (the dashboard still has it).
- A card to **Export entire project**, a card of **Integration guide & snippets** with copy buttons (sprite use and the CLI command for sprite projects; stylesheet and React use for font projects), and the danger zone (archive, transfer for admins, delete) as before.
- Read-only people see the same fields, disabled, with "Only the owner can change these settings."

### Admin: Manage menu
- Checked against Icon Vault: its Manage menu has Manage Projects and Manage Users. We already had a Users screen (Administration) but no project screen, and you reached it only from the account menu.
- New **Manage** button in the top bar (admins only) with **Manage Projects** and **Manage Users**. New screen **Manage projects** (`/admin/projects`): every project, private and archived too, with owner name and email, badges, icons and last change; search that also matches the owner's name or email; **Open**, **Transfer** (existing dialog) and **Delete** (with confirmation) per project. Users and Projects are tabs on both admin screens.
- Not copied from Icon Vault: adding or editing users and switching accounts (sign-in is Google or Microsoft here and admins come from `ADMIN_EMAILS`), and bulk transfer or delete of several projects at once.

### Fix found on the way
- Packages kept in the font history before version numbers existed had none (two of your gg-private downloads). They are numbered oldest first the first time the history is opened, and new ones carry on after them. A test covers it.

### Validation (verified)
- Server unit **136 of 136**; database **175 of 175** (new: admins list everyone's projects and search by owner, other users cannot; legacy builds numbered).
- Client **621 of 621** (new: automatic build cases, actions in the bar, no heading, the settings card and snippets, Manage Projects, the Manage menu and its keyboard use, and the admin screens' accessibility checks). Types and lint clean.
- Real browser (throwaway non-admin user): the Font Builder page opened already built with the actions in the bar and no left block; Project Settings looked like the Icon Vault card and Save settings renamed the project everywhere; the Manage button is not shown to a non-admin. Test data removed.

### Not tested, or open
- The Manage button and Manage Projects were not seen in the browser: that needs a signed-in admin, and the admin list is your `ADMIN_EMAILS` setting, which I do not change. They are covered by tests (including real HTTP tests for the list and search). Sign in as an admin and look at the top bar.
- Settings changes made while a font build is waiting are not combined; each change just restarts the 0.7 second wait.

## 2026-10-20: Follow-up, no Build font button, breadcrumb in the top bar, Trash page like Settings (change request)

Client only. One commit on `main`, local only.

- **No Build font button:** the font builds by itself (see the entry before), so the button is gone; the page's actions are **Download font** and **Copy CSS**. If a build fails the message has a **Try again** link, and changing any setting builds again.
- **Breadcrumb in the top bar:** "Dashboard / <project>" is now in the middle of the top bar on project pages instead of a separate pill under it. On a phone only the project name shows there (the logo still goes to the dashboard).
- **Trash tab:** an icon with no count any more. The **Trash page** now has the same width and card as Project Settings (a "Trash" heading, the explanation, then the list); on a phone the buttons wrap under the icon name.
- **"Showing 7 of 7 icons"** line removed from the Icons screen (Show more and the 1000 icon note stay).
- Validation: client **621 of 621**; types and lint clean. Real browser (throwaway user): breadcrumb in the bar, Trash card and its row on desktop and at 375 px with no sideways scroll. Test data removed.
- Tests changed: the Font page tests now wait for the automatic build instead of clicking Build font (and new ones cover Try again and no Build font button).

## 2026-10-20: Follow-up, split layout for the project screens and white, black, blue swatches (change request)

Client only. One commit on `main`, local only. You also asked for the dashboard in the same style, then asked me to **revert the dashboard changes**: the dashboard and its project cards are exactly as before.

- **Split layout (Icons screen):** the page uses the whole width. The project bar is a flat strip with a line under it (no rounded card), the folders sit in a left column with a vertical divider (no card around them), and the toolbar is a strip with its own line above the icons. Other sections (Font Builder, Project Settings, Trash) keep their centred widths with side padding.
- **Colour tiles:** **White, Black, Blue** and the rainbow tile for more colours (it was Blue, Green, Red). Pressing the chosen tile again still goes back to the default colour.
- Validation: types and lint clean; project page, dashboard and project tests pass (55). A full client run on a heavily loaded machine (load average above 500) timed out in 11 slow tests that pass when run on their own; the last complete clean run was 621 of 621 before this change. Real browser: the split layout and the new swatches looked right at 1500 px. Test data removed.

## 2026-10-21: Follow-up, Select all above the icon list and "Draft" instead of "Archived" (change request)

Client only. One commit on `main`, local only.

- **Select all N shown** moved out of the toolbar: it now sits above the icon cards (only when there are icons to show). The toolbar is controls only.
- **Draft wording:** what was called archiving is now a **draft**. The dashboard's Status dropdown reads **Active, Draft, Both** (it was Active, Archived, Active and archived). A draft project shows a **Draft** badge (dashboard card, project page, Manage projects), the card menu and Project Settings say **Mark as draft** and **Mark as active**, and the messages read "Marked “x” as draft." and "… as active.".
- Names only: the stored field (`isArchived`), the API and the address values (`status=archived`) are unchanged, so existing projects and links keep working.
- Validation: client **623 of 623**; types and lint clean. Tests changed for the new wording and for Select all (moved to its own component with its own tests). Not checked in the browser this time.

## 2026-10-21: Follow-up, dashboard filters as joined pills, Private / Public sections, buttons in the top bar (change request)

Client only. One commit on `main`, local only. The dashboard keeps its project cards; the filter menus change.

- **Joined (split) pills with counts:** **Show** is now All, Private, Public and **Type** is All types, Sprites, Fonts, each with a count ("All 4 | Private 1 | Public 3"). The old Mine choice is gone (an old `scope=mine` link just shows All). Private and Public are told apart in the page from one loaded list, so the counts always add up.
- **Sections:** with All chosen, the cards are grouped under **Private** and **Public** headings with counts (an empty group is left out). Choosing Private or Public shows one list.
- **Filter icon:** the "Recently updated" dropdown is a filter icon; it opens the same four sort choices (Recently updated, Newest, Name, Most icons) and its tooltip names the current one. **Status** stays a small dropdown (Active, Draft, Both).
- **Heading removed:** the visible "Projects" heading is gone (it stays for screen readers). **New project** and **Import project** moved into the top bar, left of the theme switch and account menu.
- Validation: client **629 of 629**; types and lint clean (the dashboard tests were rewritten for the new controls and cover the counts, the sections, one-kind lists, the type filter and the top-bar buttons). Real browser (throwaway user with one private and two public projects, plus the existing public one): buttons in the bar, pills with counts, the two sections and the filter icon looked right. Test data removed.
- Not done: showing the dashboard as a left sidebar and list (the earlier attempt, reverted at your request).

## 2026-10-21: Follow-up, full-width dashboard, more admin features and demo data (change request)

One commit on `main`, local only.

### Dashboard
- **Full width:** the page no longer sits in a centred column. The filters are a **flat second-level bar** with a line under it (search, Show and Type pills, Status, the sort filter icon), like the project bar; the cards below use the whole width (up to five across).
- **Status dropdown icon:** the browser's own arrow was cramped and sat differently from the other controls. It now has its own chevron, spaced the same as the rest.

### Admin features (compared with Icon Vault)
- **Totals** at the top of both admin screens: users (and admins), projects (private, public, draft), icons, font packages kept, active API tokens.
- **Manage projects:** tick projects (or all on the page) to **Transfer selected** to one user or **Delete selected** (asks first; each project is handled on its own and a failure is reported without stopping the rest). Owner filter: the Users screen has a **Projects** button per user that opens the project list for that owner, with a chip to go back to everyone.
- New server routes (admin only): `GET /api/admin/stats`, `POST /api/admin/projects/bulk-transfer` and `bulk-delete` (up to 100 projects), and `?owner=<userId>` on the project list.
- **Not copied from Icon Vault, on purpose:** adding or editing users, changing roles and "switch account". Sign-in is Google or Microsoft with no passwords, and admin rights come only from the ADMIN_EMAILS list that is never stored; a role editor or account switching would change that trust model, so they need your decision first.

### Why you saw no Manage button
Your `server/.env` has an empty `ADMIN_EMAILS`, so nobody is an admin. Put your sign-in e-mail there (comma-separated for several) and restart the server; the Manage button then appears. I do not edit that file.

### Demo profile for the admin view
- `npm run seed:demo` (in `server/`) adds four made-up users (Demo Admin, Ada, Grace and Linus Demo, e-mails ending `@demo.example.test`) and six projects of every kind (private, public, sprite, font, one draft) with a few icons each. It is safe to run twice. `npm run seed:demo -- --remove` deletes every trace. **I ran it against your database**, so they are there now.
- The demo users cannot sign in (no passwords); they just fill the lists. "Demo Admin" is a name only: nobody gets admin rights except through ADMIN_EMAILS.

### Validation (verified)
- Server unit **136 of 136**; database **181 of 181** (new: totals for admins only, bulk transfer with a partial failure, bulk delete with icons, refused for non-admins and bad input, the owner filter). Client **636 of 636** (new: the totals, the owner chip, ticking, bulk delete and bulk transfer, the Projects button). Types and lint clean. The slow lookups in the icon drawer accessibility test got a longer timeout after it failed once under load.
- Real browser: I started a temporary API on port 5100 with ADMIN_EMAILS set for one throwaway user only (your .env untouched) and a temporary client on 5174, then looked at the dashboard, Manage projects and Manage users with the demo data; both temporary servers and the user were removed afterwards.

## 2026-10-21: Follow-up, admin screens split by topic, sign-in filter and a way back (change request)

One commit on `main`, local only.

- **Users screen:** the cards now show only user numbers: **Users, Admins, Members, Google sign-ins, Microsoft sign-ins**. A **Sign-in** pill filter (All, Google, Microsoft, each with its count) narrows the list (new `provider` filter on `GET /api/admin/users`).
- **Projects screen:** the cards now show only project numbers: **Projects, Private, Public, Sprite projects, Font projects, Drafts**. Icons, font packages and API tokens are no longer shown there.
- **Back to the dashboard:** a **Back to dashboard** button sits next to the Users and Projects tabs on both admin screens.
- The totals route returns the new counts too (`members`, `googleUsers`, `microsoftUsers`, `spriteProjects`, `fontProjects`).
- Demo users sign in with the "system" provider, so they count in Users but in neither the Google nor the Microsoft number.
- Validation: server database tests for the admin routes **17 of 17** (new: the provider filter, the added counts); client **639 of 639**; types and lint clean. Not looked at in the browser this time (it needs an admin session; see the entry before).

## 2026-10-21: Follow-up, compact project cards, Manage users breadcrumb, one control height (change request)

Client only. One commit on `main`, local only.

- **Admin screens:** "Back to dashboard" is now a small breadcrumb above the title (**Dashboard / Manage users**, **Dashboard / Manage projects**). The users screen is titled **Manage users** (it was "Administration"), and the account menu entry is **Manage users** too.
- **Compact project cards (dashboard):** a small avatar, the name and the menu on one line; a **one line description** cut off with an ellipsis (the full text shows on hover); the badges; the sample icons on **a row of their own** (tiny, up to six); and "Created by". The icon count and the "Updated" date are gone. More space inside the card (12 px padding, 8 px between rows). **At most five cards in a row** (two on a phone, three, four, five as the screen widens). With All chosen, Private and Public sit one under the other and both are visible on one screen for a normal number of projects.
- **Search bar:** narrower (16 rem, not stretching), with even gaps between the search, the pills, Status and the sort icon.
- **One control height:** I measured the top bar and found 32 to 40 px controls side by side. Now every control in the top bar, the project bar, the dashboard filter bar and the icon toolbar is **36 px** (New project, Import project, Manage, the theme switch, the account button; Upload icons and its arrow, From Another Project, Download font, Copy CSS; the search, pills, Status and sort; the size, colour, style, sort, More and view controls). Checked in the browser on the dashboard and on a project page.
- Validation: client **640 of 640**; types and lint clean.

## 2026-10-21: Follow-up, project name in the bar (change request)

Client only. One commit on `main`, local only. In the project bar the name is exactly **20 px**, and a long name is **cut off with an ellipsis** (hover shows all of it) instead of wrapping. The Private and project-type badges always stay on the **same row** as the name. Checked in the browser with a very long name: 20 px computed size, ellipsis, name and badges on one line, no sideways scroll. Client tests: 641.

## 2026-10-21: Follow-up, one control height across the whole app and a 16 px project name (change request)

Client only. One commit on `main`, local only.

- **Cause of the mismatch you showed:** the pill menu (Icons, Sprite, Project Settings, Trash) was 46 px high next to 36 px buttons, because its padding was added on top of its 36 px buttons.
- **One height, 36 px, everywhere:** the pill menus (project bar and the admin tabs) are now 36 px with 28 px buttons inside, like the theme switch and the filter pills; the grid and list switch in the icon toolbar too. The default **Button** is 36 px (it was 40), as are **text boxes and dropdowns** in forms and dialogs (they were about 40), the **Sign in** button, the project and admin search boxes, and the checklist and copy-from-project filters. Small buttons stay 32 px (rows in tables and cards), and tiny inner buttons 28 px.
- **Audit:** in the browser I measured every button, box, dropdown and group on the dashboard, a project's Icons, Font Builder, Project Settings and Trash screens and the API tokens page: nothing sits at 33 to 46 px except 36 (the one 34 px reading is the invisible dropdown inside the 36 px sort icon). The admin screens could not be measured without an admin session; their tabs and search use the same sizes.
- **Project name:** 16 px (it was 20 px), still cut off with an ellipsis and with the badges on the same row.
- Validation: client **641 of 641**; types and lint clean.

## 2026-10-21: Follow-up, project card spacing and badges above the title (change request)

Client only. One commit on `main`, local only. The dashboard card now has the **Private / type (and Draft) badges above the title**, then the avatar, name and menu, a one line description, a roomier grey box for the sample icons (more padding, 12 px between icons, at least 36 px high; the icons stay at **18 px**, up to six), and "Created by". More space inside the card (14 px padding, 10 px between rows) and under the description. I tried 32 px icons on request and went back to 18 px because they were too big. Client tests: 641.

## 2026-10-21: Follow-up, Sprite Builder like the Font Builder and Icon Vault's sprite page (change request)

One commit on `main`, local only.

### Like the Font Builder
- **Actions in the project bar:** **Download sprite ZIP** (the main, filled button) and **Copy sprite**. The separate **Download sprite.svg** button is gone: the sprite file is inside the ZIP together with the demo page, the grid sprite and the preview image. The old "Download bundle" is now "Download sprite ZIP".
- **Builds by itself:** the sprite is built in the browser as soon as the page opens and again whenever the icons, the scope or an option change; the ZIP button is switched on as soon as the first build is shown. There is no Build button.
- **Three columns** like Icon Vault: **1. Scope selection** (whole project with its icon count, selected folder with a folder list, selected icons, and the Icon checklist card with "n / total" and Review / edit checklist), **2. Sprite architecture**, **3. Processing options**.

### Features taken from Icon Vault's sprite page
| Icon Vault | Here |
|---|---|
| Symbol, Stack and CSS companion sprite | all three; Stack makes nested `<svg>` icons shown by `:target` (for `<img src="sprite.svg#id">`), CSS adds a `sprite.css` to the ZIP; the code you copy for a symbol follows the choice |
| ID pattern `{prefix}-{name}` | same; it must contain `{name}`, and a bad one is explained and ignored until fixed |
| Convert to currentColor | same (fills and strokes; `none`, gradients and `currentColor` are left alone) |
| Namespace gradient and mask ids | same, on by default (each icon's inner ids get its name in front, and every reference is updated) |
| Sprite build history with download and delete | added: every sprite ZIP an editor downloads is kept (the last 20) with a version number v1, v2, ..., newest first, with the architecture, symbol count and size; anyone who can see the project can download one again, editors can delete them |
| Live preview, symbol list | the preview panel was removed at your request (the demo page is still inside the ZIP); the id list with a copy button per symbol stays |

- **Left out on purpose:** "Run SVGO optimization" and "Preserve viewBox". Icons are already cleaned and optimized when they are uploaded, and changing the viewBox again could shift an icon, so the two switches would do nothing useful here.
- **How the history is kept:** the ZIP is built in the browser, and after an editor's download it is sent to the server (`POST /api/projects/:id/sprite/builds`, up to 12 MB, must be a ZIP). If keeping it fails the download still works. Also `GET /api/projects/:id/sprite/builds`, `GET .../:buildId/download` and `DELETE .../:buildId`. They are removed with the project. The count that hands out version numbers is `spriteBuildCount` on the project, like the font one. New collection `sprite_builds`.

### Tab name
The **Sprite** tab is now **Sprite Builder** (sprite projects), matching **Font Builder**. The page address is unchanged.

### Validation (verified)
- Server unit **136 of 136**; database **188 of 188** (new: `spriteHistory.db.test.ts`, 6 tests: keeping, listing and downloading again, who may send, list and delete, bad uploads, deleting with version numbers never reused, the 20 limit and removal with the project).
- Client **670 of 670** (new: the sprite options, the history component, the page layout and each architecture, id pattern and colour option, history for editors and not for viewers). Types and lint clean.
- Real browser (throwaway user, sprite project with four icons): the three columns and the actions in the bar; Download sprite ZIP uploaded the ZIP and the history showed "v1 Symbol sprite (4 symbols)". Test data removed.

### Not tested, or open
- The browser pane cannot open the downloaded file, so what is inside the ZIP was checked by tests (the file names and the sprite text for each architecture), not by opening it.

## 2026-10-21: Project audit report (change request)

Added `AUDIT_REPORT.md` in the project root: a review of security gaps and errors with severity, evidence and recommended fixes (0 critical, 1 high, 6 medium, 8 low). Documentation only; no code changed. Highlights: update the client dependencies (`npm audit fix`), require `CORS_ORIGINS`/`SESSION_SECRET`/`TRUST_PROXY` in production, add per-user quotas, make sessions revocable, and give API tokens scopes and expiry.

## 2026-10-21: Audit fixes: dependencies, stray lockfile, production checks (change request)

- **Client dependencies:** `npm audit fix` in `client/` (follow-redirects and vite advisories); `npm audit` now reports 0. Build and `src/lib` tests pass.
- **Removed** the unused root `package-lock.json`.
- **Production startup checks:** new `server/src/config/production.ts`, called first in `index.ts`. With `NODE_ENV=production` the server refuses to start unless `SESSION_SECRET` is at least 32 characters and `CORS_ORIGINS` is set. Development is unaffected. Tests: `tests/productionConfig.test.ts` (4). **Deploy note:** set both variables before deploying to production.
- `AUDIT_REPORT.md` marks H1, M5 and L2 as fixed.

## 2026-10-21: Audit fixes: limits, sign out everywhere, token scopes and expiry, sanitizer and preview hardening (change request)

- **Limits** (`server/src/lib/quotas.ts`): 200 projects per user, 5000 icons (the trash counts) and 2000 folders per project. Creating, duplicating or importing a project, adding icons by upload, paste, copy, font import or archive import, and creating folders answer **409** with a clear message when full. Override with `MAX_PROJECTS_PER_USER`, `MAX_ICONS_PER_PROJECT`, `MAX_FOLDERS_PER_PROJECT`.
- **Sign out everywhere:** new `tokensValidAfter` on users; session tokens issued before it are refused. `POST /api/auth/me/sign-out-everywhere` (real session only) sets it and returns a fresh token so the asking device stays signed in. Button on the API tokens page. API tokens are not affected.
- **API token scopes and expiry:** a token is `read` or `write` and has an optional expiry. New tokens default to read-only and 90 days (`expiresInDays` 1 to 365, or `null` for never). A read token gets 403 on anything that changes data (it may still use the icon download POST); an expired token gets 401. Tokens made before this change keep write access and never expire. The create dialog has Access and Expires after fields; the list shows both. **Note:** a CLI token that uploads or imports must be created with Read and write.
- **Sanitizer:** removes `position`, `z-index`, `top/right/bottom/left/inset`, `pointer-events`, `filter`, `animation`, `transition` and similar from `style`; refuses icons with more than 5000 elements, nesting deeper than 32, a `<use>` that loops, or `<use>` chains that expand to more than 50,000 elements.
- **Preview:** `SvgPreview` renames the ids inside each icon per preview (`lib/svgIds.ts`) and clips and contains its content. It stays inline (not `<img>`) so `currentColor` icons keep following the theme.
- **Tests:** server 145 unit + 198 DB; new `tests/db/limits.db.test.ts` (10), sanitizer tests (5), `lib/svgIds.test.ts`, token page and preview tests.
- `AUDIT_REPORT.md` marks M1, M2, M3, L3 and L4 fixed and lists what is still open.

## 2026-10-21: Project renamed to IconVault (change request)

The visible name is now **IconVault**: the header, browser tab title, landing page footer, the footer of the generated demo page, the CLI help text and description, the README and `PROJECT_SUMMARY.md`. Internal identifiers were left alone so nothing breaks: the `svgsprite` command and its `SVGSPRITE_*` variables, the project archive format string `svg-sprite-compiler-project` (old exports still import), npm package names and the server's token issuer/audience.

## 2026-10-21: Command and package names renamed to IconVault (change request)

- **Command line:** `svgsprite` is now `iconvault` (`cli/bin/iconvault.mjs`), npm package `iconvault-cli`. Environment variables are `ICONVAULT_URL`, `ICONVAULT_TOKEN` and `ICONVAULT_CONFIG`; the saved login moved to `~/.config/iconvault/config.json`, so run `iconvault login` once again. Update any CI scripts.
- **Packages:** `client` is `iconvault-client`, `server` is `iconvault-server`.
- **Project archives:** exports are now `"format": "iconvault-project"`. Archives made before the rename (`svg-sprite-compiler-project`) still import.
- **Left as they were:** the session token issuer and audience (changing them would sign every user out) and the internal `window.__svgCompilerSessionToken` name.
- README, project summary, the Settings tab hint and the token dialog use the new command.

## 2026-10-21: .gitignore and env example cleaned before publishing (change request)

- `server/.env.example` held real-looking values (a MongoDB connection string with a password and the session secret) and was already tracked, although `.gitignore` listed it. The values are now placeholders. The two `.env.example` files are no longer ignored (they are templates); `.env.*` is ignored except `.env.example`. Also ignored: `.claude/`, `.vercel`, `coverage`, `*.tsbuildinfo`.
- **Action needed:** the old values stay in git history and were pushed to GitHub. Change the session secret and the MongoDB password (see the notes in the chat).

## Known issues
- `server/.env` holds the database password and session secret in plain text. `SVG-sprite-react-db-fixed.zip` (in `compiler project/`) contains an older `.env` with the previous credentials; do not share it. (The zip has since been moved to `astro tool/`, together with an extracted copy that also holds that `.env`.)
- Folder `server/package.json` scripts `backfill:owner`, `backfill:version-updated-at` and `cleanup:orphans` point to files that do not exist; the zip has the corrected names. **Resolved in Phase 0 (`63eb4c8`).**
- `server/src/config/db.ts` throws at import when `MONGODB_URI` is missing (crashes instead of starting without a DB). The zip has a fix. **Resolved in Phase 0 (`63eb4c8`).**
- `GET /api/sprites/:name` looks up bundles across all users although names are unique per owner, so a duplicate name can return 403 or another user's bundle (`server/src/routes/spriteRoutes.ts`). **Resolved in Phase 5: the route and the whole old library were removed.**
- `README.md` documents `MONGO_URI` (code reads `MONGODB_URI`) and omits `SESSION_SECRET`; `README.suggested.md` is correct. **Resolved in Phase 0 (`63eb4c8`).**
- ~~Client lists unused dependencies~~ Removed in Phase 8.
- ~~`npm audit` vulnerabilities in `server/` and `client/`~~ Fixed in Phase 8 (0 and 0). Repeat before each release.
- Google app is in "Testing" mode: only listed test users can sign in. Microsoft sign-in is not configured (`MS_CLIENT_ID` / `MS_TENANT_ID` unset).
- Tests: the client has 670 (Phases 3 to 8 and the follow-ups), the server 136 unit plus 188 database tests, and the command line 29. The project is under Git since Phase 0, with local commits only and no remote.

## Pending work
- ~~Decide whether to apply the fixes in the zip~~ Done in Phase 0.
- Rotate the database password and `SESSION_SECRET` if the zip or `.env` was ever shared.
- Add more test users or publish the Google app if others need access; configure Microsoft sign-in if wanted.
- ~~Initialize Git~~ Done in Phase 0. Still open: add a remote and push if wanted.
- All eight planned phases are done. What is left is in the Not tested, or open lists (above all Phase 8): a real sign-in with your `ADMIN_EMAILS`, a VoiceOver pass, choosing production rate limits and `CORS_ORIGINS`, adding a Git remote, and rotating the database password and `SESSION_SECRET` if they were ever shared.
