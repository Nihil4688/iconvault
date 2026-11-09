const {
  createServerDefinition,
  createUnresolvedServerDefinition,
  validateServerUrl,
} = require("./server-definition.cjs");

const TOKEN_SECRET_KEY = "iconvault.personalApiToken";

class IconVaultMcpProvider {
  constructor(context, vscode) {
    this.context = context;
    this.vscode = vscode;
  }

  provideMcpServerDefinitions() {
    return [createUnresolvedServerDefinition(this.vscode, this.context.extensionPath)];
  }

  async updatePersonalToken() {
    const token = await this.vscode.window.showInputBox({
      prompt: "Enter a new personal IconVault API token.",
      password: true,
      ignoreFocusOut: true,
      validateInput(value) {
        return value.startsWith("isv_") ? undefined : "Token must be an IconVault personal API token.";
      },
    });
    if (!token) return;

    await this.context.secrets.store(TOKEN_SECRET_KEY, token);
    await this.vscode.window.showInformationMessage(
      "IconVault API token saved securely. Restart the IconVault MCP server to apply it.",
    );
  }

  async resolveMcpServerDefinition(server) {
    const configuration = this.vscode.workspace.getConfiguration("iconvault");
    let serverUrl = configuration.get("serverUrl", "");

    if (!serverUrl) {
      const input = await this.vscode.window.showInputBox({
        prompt: "Enter the base URL of your IconVault API server.",
        placeHolder: "https://icons.example.com",
        ignoreFocusOut: true,
        validateInput(value) {
          try {
            validateServerUrl(value);
            return undefined;
          } catch (error) {
            return error.message;
          }
        },
      });
      if (!input) return undefined;
      serverUrl = validateServerUrl(input);
      await configuration.update("serverUrl", serverUrl, this.vscode.ConfigurationTarget.Global);
    } else {
      serverUrl = validateServerUrl(serverUrl);
    }

    let token = await this.context.secrets.get(TOKEN_SECRET_KEY);
    if (!token) {
      token = await this.vscode.window.showInputBox({
        prompt: "Enter a personal IconVault API token (create one in your IconVault account settings).",
        password: true,
        ignoreFocusOut: true,
        validateInput(value) {
          return value.startsWith("isv_") ? undefined : "Token must be an IconVault personal API token.";
        },
      });
      if (!token) return undefined;
      await this.context.secrets.store(TOKEN_SECRET_KEY, token);
    }

    const allowedFileRoots = configuration.get("allowedFileRoots", []);
    const resolved = createServerDefinition(
      this.vscode,
      this.context.extensionPath,
      serverUrl,
      token,
      allowedFileRoots,
    );
    server.env = resolved.env;
    server.version = resolved.version;
    return server;
  }
}

module.exports = { IconVaultMcpProvider };
