# Audit Report: IconVault

Date: 2026-10-21 · Scope: `server/`, `client/`, `cli/`, repo hygiene · Commit audited: 9976c51

**Method:** manual code review of authentication, permissions, uploads, ZIP/SVG handling, routes, models and the client's HTML-injection surfaces; `npm audit` on every package; secret scan of the tree and git history; review of test results. No data was changed and `server/.env` was not touched. No live exploit probes were run against the real database.

**Overall:** the design is sound. Auth is tight, every project-scoped query is filtered by `projectId`, uploads are capped and sanitized, and no secrets are committed. There are no critical findings. The items below are hardening gaps, mostly around deployment configuration, abuse limits and dependency updates.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 6 |
| Low | 8 |
| Info / good practice | 6 |

---

## High

### H1. Client dependency `follow-redirects` has a known high-severity advisory — FIXED 2026-10-21 (`npm audit fix`, now 0 vulnerabilities)
- **Evidence:** `npm audit` in `client/` reports `follow-redirects` (high), pulled in by `axios`, plus a moderate `vite` advisory. `server/` reports 0.
- **Impact:** follow-redirects can leak the `Authorization`/cookie headers to another host on a cross-domain redirect. In the browser axios uses XHR, not follow-redirects, so real exposure is small, but the CLI and any Node-side use are affected.
- **Fix:** `cd client && npm audit fix` (then re-run the client tests and build). Update Vite to the patched release.

## Medium

### M1. Sessions are bearer JWTs in `localStorage` and cannot be revoked — FIXED 2026-10-21 (`User.tokensValidAfter` plus `POST /api/auth/me/sign-out-everywhere`; button on the API tokens page. Still in `localStorage`, and the 7-day TTL is unchanged)
- **Evidence:** `AuthContext.tsx` stores `sessionToken` in `localStorage`; `lib/session.ts` issues a 7-day HS256 JWT with no server-side session record. Signing out only deletes the browser copy.
- **Impact:** any XSS (or a stolen laptop profile) yields a 7-day credential that the server cannot invalidate. Deleting or demoting a user takes effect only because `requireUser` reloads the user, not because the token dies.
- **Fix:** shorten the TTL (e.g. 1 day) with refresh, or add a `sessionVersion` / `tokenValidAfter` on `User` checked in `requireUser` so "sign out everywhere" and password-less revocation work. Longer term, move to an `HttpOnly; SameSite=Lax` cookie.

### M2. API tokens have full user write access, no scopes, no expiry — FIXED 2026-10-21 (tokens are `read` or `write`, default read-only and 90 days; older tokens keep full access and no expiry)
- **Evidence:** `requireUser` accepts an `isv_…` token as the user for every route except token management and admin. `ApiToken` has no `expiresAt` or scope field; limit is 10 active per user.
- **Impact:** a leaked CI token can edit or delete every project the user owns, forever, until noticed.
- **Fix:** add `scopes` (`read`, `write`) and an optional `expiresAt` (default 90 days); show last-used IP/date; reject write routes for read tokens.

### M3. No per-user quotas on storage or object counts — FIXED 2026-10-21 (200 projects per user, 5000 icons and 2000 folders per project, changeable with `MAX_PROJECTS_PER_USER`, `MAX_ICONS_PER_PROJECT`, `MAX_FOLDERS_PER_PROJECT`. No byte budget per user yet)
- **Evidence:** limits exist per request (1 MB per SVG, 500 SVGs per ZIP, 5000 icons per project import, 20 sprite builds × 12 MB per project) but not per user. There is no cap on projects per user, icons per project, folders per project, or total bytes.
- **Impact:** one account can fill the MongoDB Atlas cluster (importing 100 MB archives repeatedly, creating unlimited projects). Sign-up is open to anyone with a Google/Microsoft account.
- **Fix:** add `MAX_PROJECTS_PER_USER`, `MAX_ICONS_PER_PROJECT`, `MAX_FOLDERS_PER_PROJECT` and a per-user byte budget enforced in `createProject`, `importSvg`, `importProject`, history uploads; return 409/413 with a clear message.

### M4. Rate limiting is in-memory and depends on `TRUST_PROXY`
- **Evidence:** `middleware/rateLimit.ts` uses the default in-process store; `app.ts` only trusts the proxy when `TRUST_PROXY` is set.
- **Impact:** behind a reverse proxy without `TRUST_PROXY`, every request appears to come from the proxy IP, so one noisy user trips the limit for everyone (or, if mis-set, clients can spoof `X-Forwarded-For` and bypass it). With several server instances the limits multiply. Limits also reset on every restart.
- **Fix:** set `TRUST_PROXY` to the exact hop count in production; use a shared store (Redis / Mongo) if you run more than one instance; also key heavy endpoints by user id, not only IP.

### M5. CORS and production configuration are permissive by default — FIXED 2026-10-21 (server refuses to start in production without `CORS_ORIGINS` and a 32+ character `SESSION_SECRET`; `config/production.ts`)
- **Evidence:** `CORS_ORIGINS` is optional; when unset the server falls back to development behaviour. `SESSION_SECRET` strength is not enforced at startup (only presence).
- **Impact:** a production deploy that forgets these two variables runs with open CORS or a weak signing secret, which would make forged admin sessions possible.
- **Fix:** in production (`NODE_ENV=production`) refuse to start unless `CORS_ORIGINS` is set and `SESSION_SECRET` is at least 32 characters; document both in the README.

### M6. Microsoft sign-in `email_verified` default
- **Evidence:** `lib/microsoft.ts` treats the email claim as usable; `isAdminUser` only grants admin when the email is verified, or when Microsoft is single-tenant (`MS_TENANT_ID` not `common`/`organizations`/`consumers`).
- **Impact:** admin escalation is correctly blocked for multi-tenant Microsoft. But a non-admin account whose Microsoft email matches a Google account is a different user (keyed by provider + providerId), which is correct; the risk is only if `emailVerified` is ever defaulted to `true` for Microsoft. Keep it `false`/`undefined` unless the tenant is single.
- **Fix:** add a unit test that a multi-tenant Microsoft login with an `ADMIN_EMAILS` address is **not** admin (the logic exists; the regression guard is worth having).

## Low

### L1. Auth routes can return internal error text
- **Evidence:** `routes/authRoutes.ts` returns provider/exchange failure messages in some 5xx responses.
- **Fix:** log the detail server-side, return a generic "Sign-in failed, please try again." to the client.

### L2. Stray root `package-lock.json` — FIXED 2026-10-21 (deleted)
- **Evidence:** the repo root has a `package-lock.json` with no `package.json`; `npm audit` flags `brace-expansion` and `braces` there.
- **Fix:** delete it (it is not used by `client/`, `server/` or `cli/`).

### L3. SVG sanitizer allows `<use href="#…">` and `style` attributes — FIXED 2026-10-21 (position, z-index, inset, pointer-events, filter, animation and similar style properties removed; limits of 5000 elements, 32 levels and 50,000 drawn elements after `<use>` expansion)
- **Evidence:** `svgSanitizer.ts` strips external `href`s, `url()` that is not `#…`, `expression(`, `@import`, `javascript:`; allows `use`, `style`, `mask`, `pattern`, `text`.
- **Impact:** no script execution path was found (scripts, event handlers, `foreignObject`, `image`, `filter`, `<style>` are removed; entities rejected). Remaining risk is visual only: a hostile icon can use huge `transform`/`pattern` sizes to slow rendering, and `style="position:fixed;..."` can overlay UI if an icon is ever inlined into the app page (see L4).
- **Fix:** drop `position`, `z-index`, `top/left`, `pointer-events` declarations in `cleanStyleAttribute`; cap element count (e.g. 5000) and nesting depth after parsing.

### L4. `SvgPreview` injects sanitized markup with `dangerouslySetInnerHTML` — FIXED 2026-10-21 (ids are renamed per preview and the box clips and contains its content. Kept inline instead of `<img>` so `currentColor` icons still follow the theme)
- **Evidence:** `client/src/components/ui/SvgPreview.tsx:26`. The input is server-sanitized, but `id`s inside icons are not namespaced, so two icons on one page with the same `id` (`a`, `clip0`) can steal each other's gradients/clip-paths.
- **Fix:** render previews in `<img src="data:image/svg+xml,…">` (scripts and external loads are disabled in image context and ids are isolated), or namespace ids per icon like the sprite builder does.

### L5. ZIP header sizes are trusted for the budget check
- **Evidence:** `zipService.ts` and `projectArchive.ts` budget on `file.originalSize` from the header and re-check the real size afterwards. A forged small header could let fflate inflate a larger stream before the second check.
- **Impact:** bounded by the 25 MB multer upload limit and the per-entry re-check, so memory use is limited, but peak usage can exceed the stated 50 MB / 100 MB.
- **Fix:** inflate each entry with a streaming `Unzip` and abort once the running total passes the limit.

### L6. Project import copies manifest fields verbatim after zod `pick`
- **Evidence:** `projectArchive.ts` spreads `manifest.project` (name, description, prefix, color, purpose) into `Project.create`. The schema is a strict pick, so no mass-assignment of `ownerId`/`visibility` was found; `visibility` is forced to `private`.
- **Status:** safe as written. Keep the `pick` if the schema grows.

### L7. No `unique` index on `users.email`; duplicate rows are possible across providers
- **Evidence:** only `(provider, providerId)` is unique. The same person using Google and Microsoft gets two accounts with the same email.
- **Impact:** by design today, but admin allowlist and future account linking depend on email, and the admin list shows duplicates.
- **Fix:** document it; if linking is wanted, link on verified email.

### L8. Tests: the full client suite did not finish green in one run
- **Evidence:** the last full client run under heavy machine load finished with 664 of 670 passing; the 6 failures (`refuses more than 1000 icons for a font`, copy-dialog tests, `sprite section`) were timeouts. Each file passes when run alone (`--maxWorkers=1 --testTimeout=90000`).
- **Fix:** re-run the full suite on an idle machine / in CI; the 32 s case is a candidate for a faster fixture (build 1001 icons in memory rather than through the UI).

## Info / good practice (no action required)

1. **Secrets:** `server/.env` and `backups/` are git-ignored; no secrets in tree or git history.
2. **Admin rights** come only from `ADMIN_EMAILS` and a verified email; never stored; tokens never carry admin.
3. **Ownership checks:** all icon batch routes, copy, download and folder assertions filter by `projectId` (`assertFolderInProject` on move/copy/upload/paste); foreign ids are ignored, not touched.
4. **Downloads** set `Content-Disposition: attachment`, `nosniff` and a `sandbox` CSP, with filenames sanitised.
5. **Tokens** are 256-bit random, only the SHA-256 hash is stored, shown once; token management requires a real session.
6. **NoSQL injection:** search input goes through `escapeRegExp`; ids are parsed with `parseObjectId`; request bodies use zod (several `.strict()`).

---

## Still open after the 2026-10-21 fixes

- M4 rate limiting store and `TRUST_PROXY` (deployment setting; shared store only needed with several instances)
- M6 regression test for multi-tenant Microsoft admin
- L1, L5, L7, L8
- Sessions still live in `localStorage` (move to an `HttpOnly` cookie if XSS risk matters more than convenience)
- No per-user byte budget; the admin bulk transfer does not check the recipient's project limit

## Suggested order of work

1. `cd client && npm audit fix`; delete the root `package-lock.json` (H1, L2): 10 minutes.
2. Production startup checks for `CORS_ORIGINS`, `SESSION_SECRET`, `TRUST_PROXY` (M4, M5).
3. Per-user quotas (M3).
4. Session revocation (`tokenValidAfter`) and API-token scopes/expiry (M1, M2).
5. Sanitizer hardening and `<img>`-based previews (L3, L4); streaming ZIP budget (L5).
