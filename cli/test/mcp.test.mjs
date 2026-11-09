import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpServer, validateServerUrl } from "../src/mcp.mjs";

const TOKEN = "isv_TESTTOKENTESTTOKENTESTTOKENTESTTOKENTEST123";
const PROJECT_ID = "a".repeat(24);
const ICON_ID = "b".repeat(24);

let server;
let base;
let requests;
let responseFor;
let temp;
let connections;

before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    const response = responseFor(req, body);
    res.writeHead(response.status ?? 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

afterEach(async () => {
  for (const [client, mcpServer] of connections) {
    await client.close();
    await mcpServer.close();
  }
  connections = [];
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = undefined;
});

beforeEach(async () => {
  requests = [];
  connections = [];
  responseFor = () => ({ body: {} });
  temp = await mkdtemp(path.join(tmpdir(), "iconvault-mcp-test-"));
});

async function connectedClient(env = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpServer = createMcpServer({
    env: { ICONVAULT_URL: base, ICONVAULT_TOKEN: TOKEN, ...env },
    home: temp,
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  connections.push([client, mcpServer]);
  return { client, mcpServer };
}

function text(result) {
  return result.content.map((item) => item.text ?? "").join("\n");
}

describe("IconVault MCP tools", () => {
  it("allows HTTP only for loopback servers and requires HTTPS remotely", () => {
    assert.equal(validateServerUrl("http://localhost:5000/"), "http://localhost:5000");
    assert.equal(validateServerUrl("http://127.0.0.1:5000"), "http://127.0.0.1:5000");
    assert.equal(validateServerUrl("https://icons.example.com"), "https://icons.example.com");
    assert.throws(() => validateServerUrl("http://icons.example.com"), /must use HTTPS/i);
    assert.throws(() => validateServerUrl("https://user:pass@icons.example.com"), /without credentials/i);
  });

  it("advertises focused schemas and no irreversible deletion tool", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    assert.deepEqual(names, [
      "list_projects",
      "create_project",
      "get_project",
      "update_project",
      "list_folders",
      "create_folder",
      "rename_folder",
      "move_folder",
      "delete_folder",
      "search_icons",
      "get_icon",
      "download_icon",
      "add_icon",
      "update_icon",
      "move_icons",
      "copy_icons",
      "trash_icon",
      "restore_icon",
    ]);
    assert.match(tools.find((tool) => tool.name === "trash_icon").description, /trash/i);
    assert.equal(names.includes("permanently_delete_icon"), false);
    assert.ok(tools.find((tool) => tool.name === "add_icon").inputSchema.required.includes("project_id"));
  });

  it("downloads a retrieved icon as sanitized SVG inside an allowed workspace root", async () => {
    const root = path.join(temp, "workspace");
    await mkdir(root);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    responseFor = () => ({ body: { id: ICON_ID, name: "Cheese Grater", svg } });
    const { client } = await connectedClient({ ICONVAULT_ALLOWED_FILE_ROOTS: root });
    const filePath = path.join(root, "cheese-grater.svg");

    const result = await client.callTool({
      name: "download_icon",
      arguments: { icon_id: ICON_ID, file_path: filePath },
    });

    assert.equal(result.isError, undefined);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].url, `/api/icons/${ICON_ID}`);
    assert.equal(await readFile(filePath, "utf8"), svg);
    assert.deepEqual(result.structuredContent, {
      id: ICON_ID,
      name: "Cheese Grater",
      file_path: path.join(await realpath(root), "cheese-grater.svg"),
      bytes_written: Buffer.byteLength(svg, "utf8"),
    });
  });

  it("refuses icon downloads outside allowed roots and does not overwrite existing files", async () => {
    const root = path.join(temp, "workspace");
    const outside = path.join(temp, "outside");
    await mkdir(root);
    await mkdir(outside);
    await symlink(outside, path.join(root, "outside-link"), "junction");
    const existing = path.join(root, "existing.svg");
    await writeFile(existing, "keep this file");
    const { client } = await connectedClient({ ICONVAULT_ALLOWED_FILE_ROOTS: root });

    const outsideResult = await client.callTool({
      name: "download_icon",
      arguments: { icon_id: ICON_ID, file_path: path.join(outside, "icon.svg") },
    });
    assert.equal(outsideResult.isError, true);
    assert.match(text(outsideResult), /inside one of the configured workspace roots/i);
    assert.equal(requests.length, 0);

    const symlinkResult = await client.callTool({
      name: "download_icon",
      arguments: { icon_id: ICON_ID, file_path: path.join(root, "outside-link", "escaped.svg") },
    });
    assert.equal(symlinkResult.isError, true);
    assert.match(text(symlinkResult), /inside one of the configured workspace roots/i);
    assert.equal(requests.length, 0);

    responseFor = () => ({ body: { id: ICON_ID, name: "Icon", svg: "<svg/>" } });
    const existingResult = await client.callTool({
      name: "download_icon",
      arguments: { icon_id: ICON_ID, file_path: existing },
    });
    assert.equal(existingResult.isError, true);
    assert.match(text(existingResult), /already exists/i);
    assert.equal(await readFile(existing, "utf8"), "keep this file");
  });

  it("creates and updates projects through the project API", async () => {
    responseFor = (req, body) => ({
      body: req.method === "POST"
        ? { id: PROJECT_ID, name: JSON.parse(body).name }
        : { id: PROJECT_ID, name: JSON.parse(body).name, visibility: JSON.parse(body).visibility },
    });
    const { client } = await connectedClient();

    const created = await client.callTool({
      name: "create_project",
      arguments: { name: "Customer Sprites", purpose: "sprite", visibility: "private" },
    });
    assert.equal(created.isError, undefined);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "/api/projects");
    assert.deepEqual(JSON.parse(requests[0].body), {
      name: "Customer Sprites",
      purpose: "sprite",
      visibility: "private",
    });

    const updated = await client.callTool({
      name: "update_project",
      arguments: {
        project_id: PROJECT_ID,
        name: "BoldDesk-customer-Sprie-icons",
        visibility: "public",
        is_archived: true,
        uncategorized_name: "Loose icons",
      },
    });
    assert.equal(updated.isError, undefined);
    assert.equal(requests[1].method, "PATCH");
    assert.equal(requests[1].url, `/api/projects/${PROJECT_ID}`);
    assert.deepEqual(JSON.parse(requests[1].body), {
      name: "BoldDesk-customer-Sprie-icons",
      visibility: "public",
      isArchived: true,
      uncategorizedName: "Loose icons",
    });
  });

  it("reads a project and rejects empty project updates before making a request", async () => {
    responseFor = () => ({ body: { id: PROJECT_ID, name: "Customer Sprites" } });
    const { client } = await connectedClient();

    const result = await client.callTool({ name: "get_project", arguments: { project_id: PROJECT_ID } });
    assert.equal(result.isError, undefined);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].url, `/api/projects/${PROJECT_ID}`);

    const invalid = await client.callTool({ name: "update_project", arguments: { project_id: PROJECT_ID } });
    assert.equal(invalid.isError, true);
    assert.match(text(invalid), /at least one field/i);
    assert.equal(requests.length, 1);
  });

  it("creates, renames, moves, and deletes folders using project-scoped API routes", async () => {
    responseFor = () => ({ body: { id: ICON_ID, projectId: PROJECT_ID, name: "Assets" } });
    const { client } = await connectedClient();

    const created = await client.callTool({
      name: "create_folder",
      arguments: { project_id: PROJECT_ID, name: "Assets" },
    });
    const renamed = await client.callTool({
      name: "rename_folder",
      arguments: { folder_id: ICON_ID, name: "Brand Assets" },
    });
    const moved = await client.callTool({
      name: "move_folder",
      arguments: { folder_id: ICON_ID, parent_id: null, order_index: 2 },
    });
    const deleted = await client.callTool({
      name: "delete_folder",
      arguments: { folder_id: ICON_ID },
    });

    assert.deepEqual([created.isError, renamed.isError, moved.isError, deleted.isError], [undefined, undefined, undefined, undefined]);
    assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
      ["POST", `/api/projects/${PROJECT_ID}/folders`],
      ["PATCH", `/api/folders/${ICON_ID}`],
      ["POST", `/api/folders/${ICON_ID}/move`],
      ["DELETE", `/api/folders/${ICON_ID}`],
    ]);
    assert.deepEqual(JSON.parse(requests[0].body), { name: "Assets", parentId: null });
    assert.deepEqual(JSON.parse(requests[1].body), { name: "Brand Assets" });
    assert.deepEqual(JSON.parse(requests[2].body), { parentId: null, orderIndex: 2 });
  });

  it("starts the package entry point as a real stdio MCP process", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../bin/iconvault-mcp.mjs", import.meta.url))],
    });
    const client = new Client({ name: "stdio-test-client", version: "1.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      assert.equal(tools.some((tool) => tool.name === "add_icon"), true);
    } finally {
      await client.close();
    }
  });

  it("sends the personal API token only in the Authorization header", async () => {
    responseFor = () => ({ body: { projects: [], total: 0, page: 1, limit: 50 } });
    const { client } = await connectedClient();
    const result = await client.callTool({ name: "list_projects", arguments: {} });

    assert.equal(result.isError, undefined);
    assert.equal(requests[0].auth, `Bearer ${TOKEN}`);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  });

  it("uses the CLI's saved personal API token without requiring a session token", async () => {
    const configPath = path.join(temp, "saved-config.json");
    await writeFile(configPath, JSON.stringify({ url: base, token: TOKEN }));
    responseFor = () => ({ body: { folders: [], uncategorizedCount: 0 } });
    const { client } = await connectedClient({
      ICONVAULT_TOKEN: undefined,
      ICONVAULT_CONFIG: configPath,
    });
    const result = await client.callTool({ name: "list_folders", arguments: { project_id: PROJECT_ID } });

    assert.equal(result.isError, undefined);
    assert.equal(requests[0].auth, `Bearer ${TOKEN}`);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  });

  it("surfaces authentication and permission errors without masking them as success", async () => {
    const { client } = await connectedClient();
    responseFor = () => ({ status: 401, body: { error: "That API token is invalid or has been revoked." } });
    const unauthenticated = await client.callTool({ name: "list_projects", arguments: {} });
    assert.equal(unauthenticated.isError, true);
    assert.match(text(unauthenticated), /invalid or has been revoked/i);

    responseFor = () => ({ status: 403, body: { error: "You can only change projects you own." } });
    const forbidden = await client.callTool({
      name: "trash_icon",
      arguments: { icon_id: ICON_ID },
    });
    assert.equal(forbidden.isError, true);
    assert.match(text(forbidden), /only change projects you own/i);
  });

  it("redacts token values echoed by an API response", async () => {
    responseFor = () => ({ body: { folders: [], token: TOKEN, warning: `Unexpected ${TOKEN}` } });
    const { client } = await connectedClient();
    const result = await client.callTool({ name: "list_folders", arguments: { project_id: PROJECT_ID } });

    assert.equal(JSON.stringify(result).includes(TOKEN), false);
    assert.deepEqual(result.structuredContent, {
      folders: [],
      token: "[redacted]",
      warning: "Unexpected [redacted]",
    });
  });

  it("adds SVG through the sanitizing paste API and preserves structured context", async () => {
    responseFor = (_req, body) => ({
      status: 201,
      body: { outcome: "created", icon: { id: ICON_ID, projectId: PROJECT_ID, name: "Home", svg: JSON.parse(body).rawSvg } },
    });
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "add_icon",
      arguments: {
        project_id: PROJECT_ID,
        raw_svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0\"/></svg>",
        name: "Home",
        tags: ["navigation"],
      },
    });

    assert.equal(result.isError, undefined);
    assert.match(requests[0].url, new RegExp(`/api/projects/${PROJECT_ID}/icons/paste`));
    assert.equal(JSON.parse(requests[0].body).rawSvg.includes("<svg"), true);
    assert.deepEqual(result.structuredContent.icon, {
      id: ICON_ID,
      projectId: PROJECT_ID,
      name: "Home",
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0\"/></svg>",
    });
  });

  it("rejects malformed SVG responses from the API as errors", async () => {
    responseFor = () => ({ status: 400, body: { error: "Invalid SVG: malformed XML." } });
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "add_icon",
      arguments: { project_id: PROJECT_ID, raw_svg: "<svg>" },
    });
    assert.equal(result.isError, true);
    assert.match(text(result), /malformed XML/i);
  });

  it("rejects oversized or ambiguous SVG input before making an API request", async () => {
    const { client } = await connectedClient();
    const oversized = await client.callTool({
      name: "add_icon",
      arguments: { project_id: PROJECT_ID, raw_svg: `<svg>${"x".repeat(1_000_000)}</svg>` },
    });
    assert.equal(oversized.isError, true);
    assert.equal(requests.length, 0);

    const ambiguous = await client.callTool({
      name: "add_icon",
      arguments: { project_id: PROJECT_ID, raw_svg: "<svg/>", file_path: "icon.svg" },
    });
    assert.equal(ambiguous.isError, true);
    assert.match(text(ambiguous), /exactly one/i);
    assert.equal(requests.length, 0);
  });

  it("trashes an icon without requesting permanent deletion", async () => {
    responseFor = () => ({ body: { id: ICON_ID, projectId: PROJECT_ID, deletedAt: "2026-01-01T00:00:00.000Z" } });
    const { client } = await connectedClient();
    const result = await client.callTool({ name: "trash_icon", arguments: { icon_id: ICON_ID } });

    assert.equal(result.isError, undefined);
    assert.equal(requests[0].method, "DELETE");
    assert.equal(requests[0].url, `/api/icons/${ICON_ID}`);
    assert.equal(requests[0].url.includes("permanent=true"), false);
  });

  it("reads local SVG files only within configured workspace roots", async () => {
    const root = path.join(temp, "workspace");
    const outside = path.join(temp, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(root, "safe.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    await writeFile(path.join(outside, "secret.svg"), "<svg/>");
    await symlink(path.join(outside, "secret.svg"), path.join(root, "escape.svg"));
    responseFor = (_req, body) => ({ status: 201, body: { outcome: "created", icon: { id: ICON_ID, svg: JSON.parse(body).rawSvg } } });

    const { client } = await connectedClient({ ICONVAULT_ALLOWED_FILE_ROOTS: root });
    const accepted = await client.callTool({
      name: "add_icon",
      arguments: { project_id: PROJECT_ID, file_path: path.join(root, "safe.svg") },
    });
    assert.equal(accepted.isError, undefined);
    assert.equal(JSON.parse(requests[0].body).rawSvg.includes("<svg"), true);

    const denied = await client.callTool({
      name: "add_icon",
      arguments: { project_id: PROJECT_ID, file_path: path.join(root, "escape.svg") },
    });
    assert.equal(denied.isError, true);
    assert.match(text(denied), /configured workspace roots/i);
    assert.equal(requests.length, 1);

    const traversal = await client.callTool({
      name: "add_icon",
      arguments: { project_id: PROJECT_ID, file_path: path.join(root, "..", "outside", "secret.svg") },
    });
    assert.equal(traversal.isError, true);
    assert.match(text(traversal), /configured workspace roots/i);
    assert.equal(requests.length, 1);
  });
});
