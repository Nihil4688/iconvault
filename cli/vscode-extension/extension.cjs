const vscode = require("vscode");
const { IconVaultMcpProvider } = require("./src/provider.cjs");

function activate(context) {
  const provider = new IconVaultMcpProvider(context, vscode);
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("iconvault.mcp", provider),
    vscode.commands.registerCommand("iconvault.updateToken", () => provider.updatePersonalToken()),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
