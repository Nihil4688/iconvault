import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import handler, { config } from "../api/mcp.mjs";

const TOKEN = `isv_${"A".repeat(43)}`;

let apiServer;
let mcpServer;
let apiBase;
let mcpBase;
let requests;
let previousApiUrl;

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function postMcp(body, authorization) {
  return fetch(`${mcpBase}/api/mcp`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

before(async () => {
  previousApiUrl = process.env.ICONVAULT_URL;
  apiServer = createServer(async (req, res) => {
    for await (const _chunk of req) {
      // Consume the request body before responding.
    }
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ projects: [], total: 0, page: 1, limit: 50 }));
  });
  await listen(apiServer);
  apiBase = `http://127.0.0.1:${apiServer.address().port}`;

  mcpServer = createServer((req, res) => handler(req, res));
  await listen(mcpServer);
  mcpBase = `http://127.0.0.1:${mcpServer.address().port}`;
  process.env.ICONVAULT_URL = apiBase;
});

after(async () => {
  await close(mcpServer);
  await close(apiServer);
  if (previousApiUrl === undefined) delete process.env.ICONVAULT_URL;
  else process.env.ICONVAULT_URL = previousApiUrl;
});

describe("remote IconVault MCP endpoint", () => {
  it("leaves the MCP request body stream untouched for the transport", () => {
    assert.equal(config.api.bodyParser, false);
  });

  it("requires a well-formed personal API token", async () => {
    requests = [];
    for (const authorization of [undefined, "Bearer isv_short"]) {
      const response = await postMcp(
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
        authorization,
      );
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "A valid IconVault personal API token is required." });
    }
    assert.equal(requests.length, 0);
  });

  it("serves stateless MCP requests using the caller's token and no local-file tools", async () => {
    requests = [];
    const initialize = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    }, `Bearer ${TOKEN}`);

    assert.equal(initialize.status, 200);
    assert.equal(initialize.headers.get("content-type"), "application/json");
    const initialized = await initialize.json();
    assert.equal(initialized.result.serverInfo.name, "iconvault");

    const listTools = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }, `Bearer ${TOKEN}`);

    assert.equal(listTools.status, 200);
    const { tools } = (await listTools.json()).result;
    const names = tools.map(({ name }) => name);
    assert.equal(names.includes("download_icon"), false);
    assert.equal(tools.find(({ name }) => name === "add_icon").inputSchema.properties.file_path, undefined);

    const callTool = await postMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_projects", arguments: {} },
    }, `Bearer ${TOKEN}`);

    assert.equal(callTool.status, 200);
    assert.equal((await callTool.json()).result.isError, undefined);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorization, `Bearer ${TOKEN}`);
    assert.equal(requests[0].url, "/api/projects?status=all&page=1&limit=100");
  });
});
