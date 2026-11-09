# IconVault MCP for VS Code

Install this VSIX to add IconVault's existing MCP tools to VS Code without a checkout-specific command or path. It packages the CLI MCP server and its runtime dependencies; it uses the Node.js runtime bundled with VS Code.

## Requirements

- VS Code 1.99 or newer.
- Access to an IconVault API server. This extension does not host IconVault or create an account.
- A personal API token from that IconVault account.

## Install

Download `iconvault-mcp-1.0.0.vsix` from the person distributing it, then in VS Code:

1. Open **Extensions**.
2. Select **... → Install from VSIX...**.
3. Choose the VSIX file and reload VS Code if prompted.
4. Open **Chat: Open Chat**. On the first attempt to start the IconVault MCP server, enter the base URL of your IconVault API and a personal API token.

The API URL is saved in your VS Code user settings. The token is stored in VS Code SecretStorage and is not written to settings or workspace files. Use **IconVault MCP: Update Personal API Token** from the Command Palette to replace it; restart the MCP server to apply the new token. Remote API URLs must use HTTPS; HTTP is accepted only for loopback development servers.

## Build and share

From this directory:

```powershell
npm ci
npm test
npm run package:vsix
```

The generated VSIX is named `iconvault-mcp-1.0.0.vsix` in this directory. Share that file for local installation. To publish it to the Visual Studio Marketplace, the publisher must be registered with Microsoft and the package must include the project's chosen license and publisher metadata.

## Local SVG file access

`add_icon` accepts SVG text without filesystem access. To allow `add_icon` to read SVG files or `download_icon` to save them, open VS Code settings and add only trusted absolute directories to **IconVault MCP: Allowed File Roots**. No directories are enabled by default. The server validates file paths and symlinks against those roots; downloads create a new file and never overwrite an existing one.

## Tools and permissions

The extension exposes the same project, folder, and icon tools documented in [the CLI README](https://github.com/Nihil4688/iconvault/blob/main/cli/README.md#available-tools). IconVault's API continues to enforce token scope and project permissions. Permanent deletion and project deletion are not exposed.

## Troubleshooting

- If no tools appear, make sure the extension is enabled and use **Developer: Reload Window**.
- If connection fails, confirm the API URL points to the IconVault API (including `/api/...` routes), and use HTTPS for remote servers.
- A read-only token can list and search but cannot use edit tools.
- Revoke a stored token in your IconVault account before removing or replacing it.
