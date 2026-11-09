#!/usr/bin/env node
import { runMcpServer } from "../src/mcp.mjs";

runMcpServer().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not start the IconVault MCP server.");
  process.exitCode = 1;
});
