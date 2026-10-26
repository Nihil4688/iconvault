# IconVault: project summary

A web app for collecting SVG icons in **projects**, then turning them into an **SVG sprite** or an **icon font** and downloading the result. It started as a simple sprite compiler and was rebuilt, phase by phase, around the project-first design of the Icon Vault app: projects, folders, an icon library with search and bulk actions, a Font Builder, a Sprite Builder, an admin area, API tokens and a command line.

Status: all planned phases (0 to 8) and many follow-up changes are done. The code is in a local Git repository (branch `main`, no remote). `CHANGELOG.md` records every change with how it was verified; `README.md` is the setup and API reference.

---

## 1. Tech stack

### Client (`client/`)
| Area | Technology |
|---|---|
| UI | React 19, TypeScript (strict), React Router 7 |
| Styling | Tailwind CSS 4 (design tokens, light / dark / system theme), `clsx` + `tailwind-merge`, `lucide-react` icons |
| Build / dev | Vite 8 |
| HTTP | axios |
| Tests | Vitest 5, Testing Library (`react`, `user-event`, `jest-dom`), jsdom, `axe-core` (accessibility checks) |
| Quality | ESLint 10 (typescript-eslint, react-hooks 7, react-refresh), `tsc` |
| In the browser | sprite building, the ZIP bundle (demo page, grid sprite, preview PNG), the preview font |

### Server (`server/`)
| Area | Technology |
|---|---|
| Runtime / language | Node.js (ESM), TypeScript, Express 5 |
| Database | MongoDB (Atlas) with Mongoose 9 |
| Validation | zod 4 |
| Sign-in | Google and Microsoft (ID tokens); sessions are signed JWTs (HS256) made with `jose` |
| SVG handling | `jsdom` + `DOMPurify` (cleaning), SVGO 4 (optimizing) |
| Icon fonts | `fantasticon` (TTF, WOFF, WOFF2, EOT, SVG font, CSS, SCSS, JSON, HTML), `opentype.js` and `wawoff2` (reading fonts to import them) |
| Files | `multer` (uploads), `fflate` (ZIP) |
| Config / security | `dotenv`, `cors`, security headers, in-process rate limiting |
| Tests | Node's built-in test runner with `tsx`; database tests run against throwaway MongoDB databases |

### Command line (`cli/`)
`iconvault`: a dependency-free Node 18+ tool that uses the HTTP API with a personal token (login, list projects, upload icons, build a sprite, export and import projects).

### Environment
- Server `.env`: `MONGODB_URI`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `MS_CLIENT_ID`, `MS_TENANT_ID`, `ADMIN_EMAILS`, `PORT`, `CORS_ORIGINS`, `TRUST_PROXY`, `RATE_LIMIT_DISABLED`.
- Client `.env`: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_MS_CLIENT_ID`, `VITE_MS_TENANT_ID`.
- Run: `npm run dev` in `server/` (port 5000) and in `client/` (port 5173). Maintenance scripts: `backup:db`, `cutover:drop-legacy`, `seed:demo`.

---

## 2. Architecture in one picture

```
Browser (React SPA)  --axios + Bearer session token-->  Express API  -->  MongoDB Atlas
   |  builds sprites, ZIPs, previews                      |  validates (zod), cleans SVG (DOMPurify/SVGO),
   |  Google / Microsoft sign-in                          |  builds fonts (fantasticon), stores data
   v                                                      v
Command line `iconvault` ---- personal API token ----> same API (never admin rights)
```

- **Sign-in:** the browser gets an ID token from Google or Microsoft; the server verifies it and returns its own session token. No passwords exist anywhere.
- **Sprites are built in the browser** (nothing stored on the server except the ZIPs you download as an editor). **Fonts are built on the server** in a temporary folder.
- **Admins** are not stored: a user is an admin only when their verified email is in `ADMIN_EMAILS`.

---

## 3. Features

### Accounts and access
- Sign in with Google or Microsoft; a signed-out visitor sees a landing page.
- Project access: the **owner** (and admins) manage a project; others can view **public** projects and copy icons out of them; **private** projects are visible only to the owner and admins.
- **Personal API tokens** (account menu, API tokens): shown once, stored as hashes, revocable, up to 10 active, used by the command line and scripts, never admin.

### Dashboard
- Every project you can see, as compact cards (badge row, avatar, name, one-line description, sample icons, who created it) in up to five columns.
- **Joined filter pills with counts:** Show (All / Private / Public) and Type (All types / Sprites / Fonts); a Status dropdown (Active / Draft / Both) and a sort filter icon (recently updated, newest, name, most icons). With All chosen the cards are grouped under **Private** and **Public**.
- Search across projects **and icons** in all projects, with a button to copy a found icon into one of your projects.
- Create, edit, duplicate, **mark as draft / active**, delete; import a project from an export ZIP. New project and Import project sit in the top bar.

### Projects, folders and icons (the Icons screen)
- Project bar: breadcrumb in the top bar, name (16 px, with an ellipsis), Private/Public and type badges, a pill menu (Icons, Font Builder or Sprite Builder, Project Settings, Trash), and the main buttons.
- **Upload icons** menu: files or ZIP (drag and drop), from another project, **import an SVG sprite**, **import an icon font**, paste SVG code.
- Folders: nested, create / rename / move / delete (icons move to Uncategorized), drag icons onto folders; the **Uncategorized** row has its own menu (rename the label, move all to the trash, with Undo).
- Icon list: grid or table, search by name or tag, sort, **preview size / colour / style** controls (Natural, Flat, Wireframe; only a preview), preview background (Match theme, Light, Dark, Checkerboard), select all above the list.
- Icon details panel: name, folder, tags, codepoint (font projects), code editor with live preview, copy as SVG / React / Vue, download, optimize, versions with restore, move to trash.
- Bulk actions: move, tag, optimize, download, **Build sprite / Build font** from the selection, trash with Undo.
- Trash: restore (one or all, with notes when a name or codepoint changed), delete for good, empty.
- Uploads are cleaned (scripts and unsafe content removed), optimized, size-limited, and duplicate names are handled (keep both, skip or replace).

### Font Builder (font projects)
- Actions in the project bar: **Download font** (main) and **Copy CSS**. **The font builds by itself** when the page opens and shortly after any setting changes.
- Three columns: **scope** (whole project, a folder, selected icons, with the icon checklist), **font and CSS settings** (name, class prefix, optional base class, starting codepoint), **metrics** (height, descent, normalize). Target formats: WOFF2, WOFF, TTF, EOT, SVG.
- **Stable Unicode codepoints mapping** table: every icon keeps its character (E000 to F8FF) between builds; editors can change a value and the font rebuilds with it.
- **Font build history:** every package an editor downloads is kept with a version number (v1, v2, ...); download again or delete (last 20 per project).

### Sprite Builder (sprite projects)
- Actions in the project bar: **Download sprite ZIP** (main) and **Copy sprite**; builds by itself in the browser whenever the icons or an option change.
- Three columns: **scope** (like the font page), **architecture** (symbol sprite, stack sprite, symbols with a CSS companion), **processing options** (symbol id pattern, convert colours to currentColor, namespace gradient and mask ids).
- The ZIP holds the sprite, a grid sprite, a demo page, a preview image and (CSS mode) a stylesheet. The symbol id list copies the right code for the chosen architecture.
- **Sprite build history** with version numbers, like the fonts (last 20 per project).

### Project Settings
- Icon Vault style card: owner, fixed project type, name, description, prefix, accent colour, Private or Public, with **Save settings** at the top; export the whole project as a ZIP; integration snippets with copy buttons; danger zone (mark as draft, transfer ownership for admins, delete).

### Admin (admins only; a **Manage** menu in the top bar)
- **Manage users:** user list with provider, project and icon counts, tokens and last sign-in; search; a **Google / Microsoft** filter; user numbers (users, admins, members, Google, Microsoft); delete a user (their projects are deleted or handed to another user); a button to see a user's projects.
- **Manage projects:** every project (private and draft too) with its owner, search by project or by owner name or email, optional owner filter, project numbers (total, private, public, sprite, font, drafts), open, transfer and delete per project, and **tick several to transfer or delete together**.
- Demo data: `npm run seed:demo` adds made-up users and projects for looking at these screens (removable with `-- --remove`).

### Command line
`login`, `projects`, `upload`, `sprite`, `export`, `import`; for scripts and CI use `ICONVAULT_URL` and `ICONVAULT_TOKEN`.

### Quality, accessibility and security
- Keyboard-friendly menus and dialogs, labelled controls, colour-contrast checks, an `axe` check on every main screen; one 36 px control height; light, dark and system themes; works from phone width up.
- Security headers, CORS control, rate limits, size limits on every upload, SVG cleaning on the server, hashed API tokens, `npm audit` clean at the time of Phase 8.

---

## 4. Database (MongoDB Atlas, database `svg-compiler`)

Eight collections. Dates are ISO dates; `_id` values are ObjectIds.

| Collection | One document is | Main fields |
|---|---|---|
| `users` | a signed-in person (one per provider + provider id) | provider (`google`, `microsoft`, `system`, `password`), providerId, email, emailVerified, displayName, name, picture, createdAt, lastLoginAt |
| `projects` | a workspace that owns folders and icons | ownerId, name (max 100), description (max 500), prefix (`a-z0-9_-`, up to 20), colour (`#rrggbb`), `purpose` (`sprite` or `font`, fixed at creation), `visibility` (`public` or `private`), `isArchived` (shown as **Draft**), `uncategorizedName` (max 40), `fontBuildCount`, `spriteBuildCount`, createdAt, updatedAt |
| `folders` | a folder | projectId, parentId (null = project root), name, orderIndex |
| `icons` | one SVG | projectId, folderId (null = Uncategorized), name, `slug`, `svg` (cleaned markup), byteSize, originalByteSize, width, height, viewBox, tags, flags (hasStroke, hasGradient, hasText), `codepoint` (font projects), `deletedAt` (soft delete), timestamps |
| `icon_versions` | an earlier state of an icon | iconId, svg, byteSize, createdAt |
| `font_builds` | a font ZIP an editor downloaded | projectId, createdBy, `version`, fontName, iconCount, formats, size, `zip` (binary), createdAt |
| `sprite_builds` | a sprite ZIP an editor downloaded | projectId, createdBy, `version`, mode (symbol / stack / css), iconCount, size, `zip` (binary), createdAt |
| `api_tokens` | a personal API token | userId, name, SHA-256 hash (never the token), display prefix, lastUsedAt, revokedAt |

**Rules and indexes**
- `users`: unique (provider, providerId).
- `projects`: indexed by (ownerId, updatedAt) and (visibility, isArchived).
- `folders`: indexed by (projectId, parentId, orderIndex).
- `icons`: the slug is **unique per project among active icons** (so a name can be reused while the old icon is in the trash); the codepoint is **unique per project among active icons that have one**; indexes on (projectId, folderId) and (projectId, deletedAt, updatedAt).
- `icon_versions`: (iconId, createdAt). `font_builds` / `sprite_builds`: (projectId, createdAt); at most **20 kept per project**, each under **12 MB**, and version numbers are **never reused** (the counters live on the project).
- A font character is exactly four hex digits from **E000 to F8FF** (the Private Use Area); the server refuses anything else.
- Deleting a project deletes its folders, icons, versions and kept ZIPs. Admins are never stored (they come from `ADMIN_EMAILS`).

---

## 5. API at a glance

All routes are under `/api` and need a signed-in user (session or API token) except the sign-in calls.

| Group | What it covers |
|---|---|
| Auth and session | Google / Microsoft sign-in, the current user, sign-out |
| Projects | list (filters, search), create, read, update, delete, duplicate, export ZIP, import ZIP |
| Folders | list with counts, create, rename, move, delete |
| Icons | upload (files and ZIPs), paste, copy between projects, list and search, read, edit, versions, restore, trash, batch move / tag / optimize / delete / restore, move uncategorized to the trash, downloads, import an SVG font |
| Fonts | build (preview data), download ZIP, build history (list, download, delete) |
| Sprites | server-built sprite file, sprite build history (send, list, download, delete) |
| API tokens | list, create, revoke |
| Admin | totals, users (list, delete), projects (transfer, bulk transfer, bulk delete) |

The full table with methods and paths is in `README.md`.

---

## 6. Tests and checks (as of 2026-10-21)

| Suite | Size |
|---|---|
| Server unit tests | 136 |
| Server database tests (throwaway databases) | 188 |
| Command line tests | 29 |
| Client tests (Vitest, including accessibility checks) | about 670 |

Types (`tsc`) and lint are clean on the client and server. The machine used for development is sometimes heavily loaded, which makes the slowest client tests time out; they pass when run alone or with fewer workers.

---

## 7. Known limits and decisions

- Sessions live in the browser's local storage; rate limits live in the server process (use a shared store behind several servers).
- Admin rights come only from `ADMIN_EMAILS` (set and restart the server). There is no role editor, no "add user" and no "switch account", on purpose.
- Font and sprite builds are not stored, except the ZIPs an editor downloads (the last 20 per project).
- The sprite page does not offer SVGO or viewBox switches (icons are already cleaned and optimized on upload).
- Everything is committed locally only; nothing has been pushed anywhere.
