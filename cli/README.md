# IconVault MCP server

IconVault provides a local MCP server over **stdio** and a deployable **Streamable HTTP** endpoint for remote MCP clients. Both call the existing HTTP API with a personal API token; neither accesses MongoDB or a browser session. The local command requires Node.js 18 or newer.

## Host the remote MCP endpoint on Vercel

The remote endpoint is a separate Vercel project from the web client and API server. It is stateless and uses the caller's bearer token for every API request. Each person must create and configure their own IconVault personal API token; never put a user's token in Vercel environment variables or share one token between users.

1. Import this repository as a **new Vercel project**.
2. Set its **Root Directory** to `cli`.
3. Add the environment variable `ICONVAULT_URL` and set it to the deployed IconVault API base URL. For this deployment, use `https://iconvault-pktw.vercel.app` (not the client URL).
4. Leave the build command unset and deploy. Vercel serves the MCP endpoint at `https://<your-mcp-project>.vercel.app/api/mcp`.

The endpoint accepts Streamable HTTP `POST` requests with `Authorization: Bearer <personal-api-token>`. It does not require the MCP client to run or download this source code. It omits `download_icon` and local `file_path` access because a hosted function cannot write files on the caller's computer; use `get_icon` for SVG content and `add_icon` with `raw_svg` to upload. A read-scoped token can list and search; a write-scoped token is needed for edits. IconVault still enforces the token's permissions and project access.

For VS Code, save a configuration like this in `.vscode/mcp.json`, replacing the MCP project URL. VS Code prompts each user for their own token rather than storing it in the file:

```json
{
  "servers": {
    "iconvault": {
      "type": "http",
      "url": "https://<your-mcp-project>.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer ${input:iconvaultApiToken}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "iconvaultApiToken",
      "description": "Personal IconVault API token",
      "password": true
    }
  ]
}
```

Other MCP clients must support Streamable HTTP and allow setting an `Authorization` header. Check Vercel's current Hobby plan limits before relying on this endpoint for sustained or high-volume use.

## Install and authenticate

From a checkout of IconVault:

```bash
cd cli
npm ci
node bin/iconvault.mjs login --url http://localhost:5000
```

Create a **personal API token** in IconVault (account menu → API tokens). Choose a write token to use edit tools. The CLI prompts for the token with input hidden and saves it to `~/.config/iconvault/config.json` (or `%USERPROFILE%\.config\iconvault\config.json` on Windows); it sets POSIX permissions to `0600`. On Windows, protect the file using the ACLs for the containing user profile. The MCP server reads the same config; it never asks for or accepts an OAuth session token. The token can also be supplied through `ICONVAULT_TOKEN` from a local secret manager or environment, but do not put it in a committed config file.

## Standalone Windows executable

The Windows x64 executable bundles the MCP server and its Node.js runtime, so the receiving computer does not need this source tree, npm, or a separate Node.js installation. It still needs network access to the hosted IconVault API. This build currently targets Windows x64 only.

Build it on Windows from this directory:

```powershell
npm ci
npm run build:standalone:win-x64
```

The executable is `dist/iconvault-mcp-win-x64.exe`. Distribute that file through a trusted channel, such as a private GitHub Release. Each user configures their own API token on their own computer:

```powershell
.\iconvault-mcp-win-x64.exe login --url https://YOUR-ICONVAULT-API
```

The executable prompts for the token without echoing it and saves it in the current user's IconVault config under their profile. Do not pass a token on the command line, bake one into the executable, or share a token between users. Create a separate least-privilege token for each person/device and revoke it from the web app when no longer needed.

Configure the MCP client to launch the downloaded executable with no arguments; no-argument mode starts the stdio MCP server. For VS Code, for example:

```json
{
  "servers": {
    "iconvault": {
      "type": "stdio",
      "command": "C:\\path\\to\\iconvault-mcp-win-x64.exe",
      "args": []
    }
  }
}
```

The executable also supports the regular CLI commands, including `logout` to remove the locally saved configuration and `mcp` to start the MCP server explicitly. Keep the executable updated when distributing new releases. Unsigned executables may trigger a Windows SmartScreen warning; distribute only through a channel users trust and consider code signing for wider distribution.

`ICONVAULT_URL` overrides the URL saved by `iconvault login`; the default is `http://localhost:5000`. HTTP is accepted only for loopback hosts. For a remote IconVault instance, set the API base URL to HTTPS (the host must expose the `/api/...` endpoints). Requests use the current user's API token and IconVault continues to enforce token scope, project visibility, and edit permissions.

## Local SVG file access

Adding SVG text with `raw_svg` needs no filesystem access. To allow `add_icon` to read `file_path` or `download_icon` to save a file, set `ICONVAULT_ALLOWED_FILE_ROOTS` to one or more trusted, absolute workspace directories. Separate roots with `;` on Windows and `:` on macOS/Linux. Files must be `.svg` files no larger than 1 MB. The server resolves symlinks and rejects paths outside the configured roots; downloads never overwrite existing files. Without roots, local file access is disabled.

Only configure roots that the agent should be able to read and write. A root is an access boundary, not just a convenience setting.

## Client configuration

Replace the example executable path and workspace root. Neither configuration contains a token: authenticate once with `iconvault login`, or inject `ICONVAULT_TOKEN` through a local secret-management mechanism.

### VS Code

See the [VS Code MCP server documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers) for configuration destinations and trust prompts.

For a shareable VS Code extension that bundles this MCP server and prompts each user for their API URL and token, see [IconVault MCP for VS Code](vscode-extension/README.md). Build the installable VSIX from `cli/vscode-extension` with `npm ci` followed by `npm run package:vsix`; each installer must have access to an IconVault API server and a personal API token.

For Copilot's global MCP configuration, add this server to `~/.copilot/mcp-config.json` (on Windows, `%USERPROFILE%\.copilot\mcp-config.json`). The `mcpServers` format is portable:

```json
{
  "mcpServers": {
    "iconvault": {
      "command": "node",
      "args": ["C:\\path\\to\\iconvault\\cli\\bin\\iconvault-mcp.mjs"],
      "env": {
        "ICONVAULT_URL": "http://localhost:5000",
        "ICONVAULT_ALLOWED_FILE_ROOTS": "C:\\path\\to\\workspace"
      }
    }
  }
}
```

Alternatively, add the same stdio command through **Chat: Open Customizations → MCP Servers → Add Server**. VS Code's legacy `.vscode/mcp.json` format uses a `servers` property and `"type": "stdio"`; use the format appropriate to the configuration file you edit.

### Codex

See the [Codex MCP documentation](https://developers.openai.com/codex/mcp/) for other scopes and server options.

Add this to `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`):

```toml
[mcp_servers.iconvault]
command = "node"
args = ["C:/path/to/iconvault/cli/bin/iconvault-mcp.mjs"]
env = { ICONVAULT_URL = "http://localhost:5000", ICONVAULT_ALLOWED_FILE_ROOTS = "C:/path/to/workspace" }
```

Codex starts the command as a local stdio server. Restart Codex after editing the config.

### Antigravity

See the [Antigravity MCP documentation](https://antigravity.google/docs/mcp) for the current client-specific setup.

In Antigravity's MCP Servers settings, use **Copy Config File Path** and add the following entry under `mcpServers` in that `mcp_config.json`:

```json
{
  "mcpServers": {
    "iconvault": {
      "command": "node",
      "args": ["C:\\path\\to\\iconvault\\cli\\bin\\iconvault-mcp.mjs"],
      "env": {
        "ICONVAULT_URL": "http://localhost:5000",
        "ICONVAULT_ALLOWED_FILE_ROOTS": "C:\\path\\to\\workspace"
      }
    }
  }
}
```

Antigravity's app, IDE, and CLI expose configuration through different settings locations; use the path shown by the specific client. This integration is a **local stdio** server, not a remote MCP endpoint. Antigravity's OAuth support is not needed: the process authenticates to IconVault with the API token from the CLI config.

Other MCP clients that support local stdio servers can use the same `command`, `args`, and `env` values.

## Available tools

All IDs are IconVault IDs. API validation and permissions remain authoritative.
No administrator-only operations, project deletion, empty-trash, or permanent icon deletion tools are exposed.

| Tool | Required input | Behavior |
|---|---|---|
| `list_projects` | — | Lists accessible projects; optional name search, sprite/font purpose, and result limit. |
| `create_project` | `name` | Creates a project; optional description, prefix, color, purpose, and visibility. Purpose cannot be changed later. |
| `get_project` | `project_id` | Returns full settings, icon/trash counts, owner, and access flags for a visible project. |
| `update_project` | `project_id`, at least one field | Updates project settings. Use `name` to rename; purpose is fixed after creation. |
| `list_folders` | `project_id` | Lists folder IDs, parents, names, and icon counts. |
| `create_folder` | `project_id`, `name` | Creates a folder at the project root or under `parent_id`. |
| `rename_folder` | `folder_id`, `name` | Renames a folder. |
| `move_folder` | `folder_id`, `parent_id` | Moves a folder in its project, optionally setting `order_index`; the API prevents cycles. |
| `delete_folder` | `folder_id` | Deletes the folder and descendants; contained icons go to trash and can be restored. |
| `search_icons` | `query` or project-scoped filters | Searches active icons across visible projects, or searches a selected project with folder, tag, trash, and optional subfolder filters. Cross-project filters refine the API's paginated search results; use `project_id` for exact folder/tag/trash filtering. |
| `get_icon` | `icon_id` | Returns metadata, SVG, project name, and folder context. |
| `download_icon` | `icon_id`, `file_path` | Saves the icon's sanitized SVG to a new `.svg` file inside an allowed file root. Existing files are not overwritten. |
| `add_icon` | `project_id`, exactly one of `raw_svg` / `file_path` | Adds a sanitized SVG, optionally with name, folder, tags, duplicate strategy, and optimization. |
| `update_icon` | `icon_id`, at least one field | Changes name, folder, tags, or SVG. SVG edits retain IconVault's version history. |
| `move_icons` | `project_id`, `icon_ids`, `folder_id` (nullable) | Moves up to 500 icons within the same project. |
| `copy_icons` | `source_project_id`, `target_project_id`, `icon_ids` | Copies icons the user can view into a project they can edit. Originals stay in place. |
| `trash_icon` | `icon_id` | Moves an icon to trash. Reversible; permanent deletion and empty-trash operations are unavailable. |
| `restore_icon` | `icon_id` | Restores an icon from trash; name/folder conflict adjustments are returned by the API. |

There is no cross-project move API, so cross-project organization is a copy followed by a separately confirmed trash operation if desired. Project deletion, empty-trash, and permanent icon deletion are intentionally not exposed to MCP.

## Troubleshooting

- **Authentication required / invalid token:** Create or revoke a personal API token in the web app, then rerun `node bin/iconvault.mjs login`. Do not use a browser session token.
- **Read-only token:** Listing and searching work, but edit tools require a write-scoped token.
- **Could not reach the server:** Confirm the API is running, `ICONVAULT_URL` points to the API base (not just a separate frontend host), and remote hosts use HTTPS.
- **403 or 404:** The same IconVault ownership, visibility, and editor rules apply. Private or otherwise inaccessible projects may appear as not found.
- **Local file access is disabled / file outside roots:** Set `ICONVAULT_ALLOWED_FILE_ROOTS` to the exact workspace directory. Symlinks pointing outside it are rejected.
- **Download destination already exists:** Choose a different `file_path`; `download_icon` will not overwrite local files.
- **Invalid SVG:** The MCP server sends SVG through IconVault's paste/edit API, which enforces the app's size limit, XML validation, and SVG sanitization. Review the API's returned validation error.
- **No MCP tools after configuration:** Restart the client and verify its server command points to the installed checkout and that `node --version` is at least 18.

## Development checks

```bash
npm test
npm audit --omit=dev
```
