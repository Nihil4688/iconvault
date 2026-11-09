import { main as runCli } from "./cli.mjs";
import { runMcpServer as startMcpServer } from "./mcp.mjs";

export async function runStandalone(argv = process.argv.slice(2), dependencies = {}) {
  const cli = dependencies.cliMain ?? runCli;
  const runMcp = dependencies.runMcpServer ?? startMcpServer;

  if (argv.length === 0 || argv[0] === "mcp") {
    if (argv.length > 1) throw new Error('The "mcp" command does not accept arguments.');
    await runMcp();
    return 0;
  }

  return cli(argv);
}
