const assert = require("node:assert/strict");
const path = require("node:path");
const { describe, it } = require("node:test");
const {
  createServerDefinition,
  validateServerUrl,
} = require("../src/server-definition.cjs");

class FakeStdioServerDefinition {
  constructor(label, command, args, env, version) {
    Object.assign(this, { label, command, args, env, version });
  }
}

describe("IconVault MCP server definition", () => {
  it("accepts HTTPS remote servers and loopback HTTP only", () => {
    assert.equal(validateServerUrl("https://icons.example.com/"), "https://icons.example.com");
    assert.equal(validateServerUrl("http://localhost:5000"), "http://localhost:5000");
    assert.throws(() => validateServerUrl("http://icons.example.com"), /must use HTTPS/i);
    assert.throws(() => validateServerUrl("https://user:pass@icons.example.com"), /credentials/i);
    assert.throws(() => validateServerUrl("https://icons.example.com?token=secret"), /credentials/i);
  });

  it("runs the bundled server with the editor Node runtime and only the configured access", () => {
    const definition = createServerDefinition(
      { McpStdioServerDefinition: FakeStdioServerDefinition },
      "C:\\extensions\\iconvault",
      "https://icons.example.com",
      "isv_test_token",
    );

    assert.equal(definition.label, "IconVault");
    assert.equal(definition.command, process.execPath);
    assert.deepEqual(definition.args, [
      path.join("C:\\extensions\\iconvault", "dist", "iconvault-mcp.mjs"),
    ]);
    assert.deepEqual(definition.env, {
      ICONVAULT_URL: "https://icons.example.com",
      ICONVAULT_TOKEN: "isv_test_token",
    });
    assert.equal(definition.version, "1.0.0");
  });

  it("grants local file access only to explicitly configured roots", () => {
    const noRoots = createServerDefinition(
      { McpStdioServerDefinition: FakeStdioServerDefinition },
      "C:\\extensions\\iconvault",
      "https://icons.example.com",
      "isv_test_token",
    );
    assert.equal("ICONVAULT_ALLOWED_FILE_ROOTS" in noRoots.env, false);

    const withRoots = createServerDefinition(
      { McpStdioServerDefinition: FakeStdioServerDefinition },
      "C:\\extensions\\iconvault",
      "https://icons.example.com",
      "isv_test_token",
      ["C:\\work\\icons", "D:\\shared\\svg"],
    );
    assert.equal(
      withRoots.env.ICONVAULT_ALLOWED_FILE_ROOTS,
      ["C:\\work\\icons", "D:\\shared\\svg"].join(path.delimiter),
    );
  });

  it("rejects malformed tokens and relative file access roots", () => {
    const vscode = { McpStdioServerDefinition: FakeStdioServerDefinition };
    assert.throws(
      () => createServerDefinition(vscode, "C:\\extensions\\iconvault", "https://icons.example.com", "not-a-token"),
      /personal API token/i,
    );
    assert.throws(
      () => createServerDefinition(vscode, "C:\\extensions\\iconvault", "https://icons.example.com", "isv_test_token", ["icons"]),
      /absolute paths/i,
    );
  });
});
