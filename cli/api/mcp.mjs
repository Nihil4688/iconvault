import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, validateServerUrl } from "../src/mcp.mjs";

const TOKEN_HEADER = /^Bearer (isv_[A-Za-z0-9_-]{43})$/;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "2mb" },
  },
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const authorization = req.headers.authorization;
  const tokenMatch = typeof authorization === "string" ? TOKEN_HEADER.exec(authorization) : null;
  if (!tokenMatch) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="IconVault MCP"');
    sendJson(res, 401, { error: "A valid IconVault personal API token is required." });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Only POST is supported by this stateless MCP endpoint." });
    return;
  }

  let apiUrl;
  try {
    if (!process.env.ICONVAULT_URL) throw new Error("ICONVAULT_URL is not set.");
    apiUrl = validateServerUrl(process.env.ICONVAULT_URL);
  } catch (error) {
    console.error("[iconvault-mcp] Configure ICONVAULT_URL with the HTTPS IconVault API base URL.", error);
    sendJson(res, 503, { error: "The IconVault MCP backend is not configured." });
    return;
  }

  const server = createMcpServer({
    apiToken: tokenMatch[1],
    apiUrl,
    localFiles: false,
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(
      "[iconvault-mcp] Failed to handle an MCP request.",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (!res.headersSent) sendJson(res, 500, { error: "The MCP request could not be completed." });
  } finally {
    try {
      await server.close();
    } catch (error) {
      console.error(
        "[iconvault-mcp] Failed to close the MCP server.",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
}
