const { isIP } = require("node:net");
const path = require("node:path");

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  return isIP(host) === 4 && host.startsWith("127.");
}

function validateServerUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS IconVault API URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("The IconVault URL must not contain credentials, a query, or a fragment.");
  }
  if (url.protocol !== "https:" && !isLoopback(url.hostname)) {
    throw new Error("Remote IconVault servers must use HTTPS. HTTP is allowed only for a loopback server.");
  }
  return url.href.replace(/\/+$/, "");
}

function createUnresolvedServerDefinition(vscode, extensionPath) {
  return new vscode.McpStdioServerDefinition(
    "IconVault",
    process.execPath,
    [path.join(extensionPath, "dist", "iconvault-mcp.mjs")],
    {},
    "1.0.0",
  );
}

function createServerDefinition(vscode, extensionPath, serverUrl, token, allowedFileRoots = []) {
  const url = validateServerUrl(serverUrl);
  if (typeof token !== "string" || !token.startsWith("isv_")) {
    throw new Error("Enter a valid IconVault personal API token.");
  }
  if (!Array.isArray(allowedFileRoots) || allowedFileRoots.some((root) => typeof root !== "string" || !path.isAbsolute(root))) {
    throw new Error("IconVault file access roots must be absolute paths.");
  }

  const env = {
    ICONVAULT_URL: url,
    ICONVAULT_TOKEN: token,
  };
  if (allowedFileRoots.length > 0) {
    env.ICONVAULT_ALLOWED_FILE_ROOTS = allowedFileRoots.join(path.delimiter);
  }

  const definition = createUnresolvedServerDefinition(vscode, extensionPath);
  definition.env = env;
  return definition;
}

module.exports = {
  createServerDefinition,
  createUnresolvedServerDefinition,
  validateServerUrl,
};
