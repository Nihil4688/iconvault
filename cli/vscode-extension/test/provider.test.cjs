const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { IconVaultMcpProvider } = require("../src/provider.cjs");

class FakeStdioServerDefinition {
  constructor(label, command, args, env, version) {
    Object.assign(this, { label, command, args, env, version });
  }
}

function createVscode({ serverUrl = "", roots = [], token = undefined } = {}) {
  const updates = [];
  const storedSecrets = new Map(token ? [["iconvault.personalApiToken", token]] : []);
  const prompts = [];
  const messages = [];
  const configuration = {
    get(key, fallback) {
      if (key === "serverUrl") return serverUrl || fallback;
      if (key === "allowedFileRoots") return roots;
      return fallback;
    },
    async update(key, value, target) {
      updates.push({ key, value, target });
      if (key === "serverUrl") serverUrl = value;
    },
  };
  return {
    ConfigurationTarget: { Global: "global" },
    McpStdioServerDefinition: FakeStdioServerDefinition,
    workspace: { getConfiguration: () => configuration },
    window: {
      async showInputBox(options) {
        prompts.push(options);
        return options.password ? "isv_new_token" : "https://icons.example.com/";
      },
      async showInformationMessage(message) {
        messages.push(message);
      },
    },
    secrets: {
      async get(key) {
        return storedSecrets.get(key);
      },
      async store(key, value) {
        storedSecrets.set(key, value);
      },
    },
    get prompts() { return prompts; },
    get updates() { return updates; },
    get messages() { return messages; },
    storedSecrets,
  };
}

describe("IconVault MCP provider", () => {
  it("publishes the MCP server without prompting or exposing credentials", () => {
    const vscode = createVscode();
    const provider = new IconVaultMcpProvider(
      { extensionPath: "C:\\extensions\\iconvault", secrets: vscode.secrets },
      vscode,
    );
    const [server] = provider.provideMcpServerDefinitions();

    assert.equal(server.label, "IconVault");
    assert.deepEqual(server.env, {});
    assert.equal(vscode.prompts.length, 0);
  });

  it("collects the endpoint and token only when starting the server", async () => {
    const vscode = createVscode();
    const provider = new IconVaultMcpProvider(
      { extensionPath: "C:\\extensions\\iconvault", secrets: vscode.secrets },
      vscode,
    );
    const [server] = provider.provideMcpServerDefinitions();

    const resolved = await provider.resolveMcpServerDefinition(server);

    assert.equal(resolved, server);
    assert.equal(server.env.ICONVAULT_URL, "https://icons.example.com");
    assert.equal(server.env.ICONVAULT_TOKEN, "isv_new_token");
    assert.equal(vscode.storedSecrets.get("iconvault.personalApiToken"), "isv_new_token");
    assert.deepEqual(vscode.updates, [
      { key: "serverUrl", value: "https://icons.example.com", target: "global" },
    ]);
  });

  it("uses a saved secret and enables file access only for configured roots", async () => {
    const vscode = createVscode({
      serverUrl: "https://icons.example.com",
      roots: ["C:\\work\\icons"],
      token: "isv_saved_token",
    });
    const provider = new IconVaultMcpProvider(
      { extensionPath: "C:\\extensions\\iconvault", secrets: vscode.secrets },
      vscode,
    );
    const [server] = provider.provideMcpServerDefinitions();

    await provider.resolveMcpServerDefinition(server);

    assert.equal(server.env.ICONVAULT_TOKEN, "isv_saved_token");
    assert.equal(server.env.ICONVAULT_ALLOWED_FILE_ROOTS, "C:\\work\\icons");
    assert.equal(vscode.prompts.length, 0);
  });

  it("allows replacing a token through the extension command", async () => {
    const vscode = createVscode({ token: "isv_old_token" });
    const provider = new IconVaultMcpProvider(
      { extensionPath: "C:\\extensions\\iconvault", secrets: vscode.secrets },
      vscode,
    );

    await provider.updatePersonalToken();

    assert.equal(vscode.storedSecrets.get("iconvault.personalApiToken"), "isv_new_token");
    assert.equal(vscode.prompts[0].password, true);
    assert.match(vscode.messages[0], /restart/i);
  });
});
