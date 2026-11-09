import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runStandalone } from "../src/standalone.mjs";

describe("standalone executable", () => {
  it("starts the MCP server when launched without arguments", async () => {
    let mcpStarted = false;
    const exitCode = await runStandalone([], {
      cliMain: async () => assert.fail("CLI should not run"),
      runMcpServer: async () => {
        mcpStarted = true;
      },
    });

    assert.equal(exitCode, 0);
    assert.equal(mcpStarted, true);
  });

  it("starts the MCP server when passed the mcp command", async () => {
    let mcpStarted = false;
    const exitCode = await runStandalone(["mcp"], {
      cliMain: async () => assert.fail("CLI should not run"),
      runMcpServer: async () => {
        mcpStarted = true;
      },
    });

    assert.equal(exitCode, 0);
    assert.equal(mcpStarted, true);
  });

  it("passes setup commands to the existing CLI", async () => {
    let cliArguments;
    const exitCode = await runStandalone(["login", "--url", "https://icons.example"], {
      cliMain: async (argv) => {
        cliArguments = argv;
        return 0;
      },
      runMcpServer: async () => assert.fail("MCP should not run"),
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(cliArguments, ["login", "--url", "https://icons.example"]);
  });
});
