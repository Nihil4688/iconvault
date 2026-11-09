const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createInterface } = require("node:readline");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

describe("bundled MCP server", () => {
  it("starts over stdio and advertises the IconVault tools", async () => {
    const configPath = path.join(os.tmpdir(), `iconvault-vsix-test-${process.pid}.json`);
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "dist", "iconvault-mcp.mjs")],
      {
        env: {
          ...process.env,
          ICONVAULT_CONFIG: configPath,
          ICONVAULT_URL: "https://icons.example.com",
          ICONVAULT_TOKEN: "isv_test_token",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const lines = createInterface({ input: child.stdout });
    const pending = new Map();
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        child.emit("error", new Error(`Bundled MCP server wrote non-JSON stdout: ${line}`));
        return;
      }
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    });

    function responseFor(id) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for MCP response ${id}. ${stderr}`));
        }, 5000);
        pending.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    }

    try {
      const initialized = responseFor(1);
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vsix-test", version: "1.0.0" },
        },
      })}\n`);
      assert.equal((await initialized).error, undefined);
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })}\n`);

      const toolsResponse = responseFor(2);
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      })}\n`);
      const tools = (await toolsResponse).result.tools.map((tool) => tool.name);

      assert.ok(tools.includes("search_icons"));
      assert.ok(tools.includes("download_icon"));
      assert.ok(tools.includes("add_icon"));
      assert.ok(tools.includes("restore_icon"));
      assert.equal(tools.includes("permanently_delete_icon"), false);
    } finally {
      lines.close();
      child.kill();
      await once(child, "close");
    }
  });
});
