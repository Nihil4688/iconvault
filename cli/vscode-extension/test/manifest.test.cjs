const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const manifest = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

describe("VS Code extension package", () => {
  it("contributes the IconVault MCP provider and secure endpoint settings", () => {
    assert.equal(manifest.main, "./extension.cjs");
    assert.equal(manifest.engines.vscode, "^1.99.0");
    assert.deepEqual(manifest.contributes.mcpServerDefinitionProviders, [
      { id: "iconvault.mcp", label: "IconVault" },
    ]);
    assert.equal(manifest.contributes.commands[0].command, "iconvault.updateToken");
    assert.equal(manifest.contributes.configuration.properties["iconvault.serverUrl"].default, "");
    assert.deepEqual(manifest.contributes.configuration.properties["iconvault.allowedFileRoots"].default, []);
  });

  it("builds a self-contained MCP server before packaging", () => {
    assert.equal(manifest.scripts.compile.includes("esbuild"), true);
    assert.equal(manifest.scripts["package:vsix"].includes("vsce package"), true);
  });
});
