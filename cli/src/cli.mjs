// The iconvault command line. It talks to the server's HTTP API with a personal API token (create one in the web app under API tokens), so it needs no database access and can run anywhere, including CI. No dependencies: Node 18 or newer.
//
// `main(argv, ctx)` returns the exit code and takes everything it touches (fetch, files, streams, environment) through `ctx`, so the tests can run it against a mock server.
import { mkdir, readFile, readdir, stat, writeFile, chmod, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { Writable } from "node:stream";

export const DEFAULT_URL = "http://localhost:5000";
const BATCH_SIZE = 100;

export class CliError extends Error {}

const HELP = `iconvault: command line for IconVault

Usage: iconvault <command> [options]

Commands
  login [--url <server>] [--token <token>]   Save the server address and your API token
  logout                                     Forget the saved token
  whoami                                     Show who the token belongs to
  projects [--mine | --public] [--json]      List projects you can see
  icons <project> [--folder <id|root>] [--json]
                                             List a project's icons
  upload <project> <file|folder>... [--folder <id>] [--strategy rename|replace|skip] [--no-optimize]
                                             Add .svg and .zip files (folders are searched for them)
  sprite <project> [--folder <id|root>] [--out <file>]
                                             Build the SVG sprite (prints to the screen without --out)
  export <project> [--out <file.zip>]        Download the whole project as a ZIP
  import <file.zip>                          Create a new project from an export ZIP
  help                                       Show this text

<project> is a project id, or its exact name or prefix.

Settings, strongest first: --url and --token, the ICONVAULT_URL and ICONVAULT_TOKEN environment variables, then the file saved by "login" (ICONVAULT_CONFIG, or ~/.config/iconvault/config.json). The default server is ${DEFAULT_URL}.
Create tokens in the web app: account menu, API tokens. Tokens never have admin rights.`;

// ---- arguments ----

// Splits argv into positional arguments and options. `spec` lists the options each command accepts: true = takes a value, false = a switch.
export function parseArgs(argv, spec) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [rawName, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const name = rawName.startsWith("no-") && spec[rawName.slice(3)] === false ? rawName.slice(3) : rawName;
    const negated = name !== rawName;
    if (!(name in spec)) throw new CliError(`Unknown option --${rawName}. Try "iconvault help".`);
    if (spec[name] === true) {
      const value = inline ?? argv[++i];
      if (value === undefined || (inline === undefined && value.startsWith("--"))) throw new CliError(`--${name} needs a value.`);
      options[name] = value;
    } else {
      options[name] = !negated;
    }
  }
  return { positional, options };
}

// ---- settings ----

function configPath(ctx) {
  return ctx.env.ICONVAULT_CONFIG || path.join(ctx.home, ".config", "iconvault", "config.json");
}

async function readConfig(ctx) {
  try {
    return JSON.parse(await readFile(configPath(ctx), "utf8"));
  } catch {
    return {};
  }
}

async function settings(ctx, options) {
  const saved = await readConfig(ctx);
  const url = (options.url || ctx.env.ICONVAULT_URL || saved.url || DEFAULT_URL).replace(/\/+$/, "");
  const token = options.token || ctx.env.ICONVAULT_TOKEN || saved.token || "";
  return { url, token };
}

function requireToken(cfg) {
  if (!cfg.token) throw new CliError('Not signed in. Create an API token in the web app (account menu, API tokens), then run "iconvault login".');
}

// ---- talking to the server ----

async function request(ctx, cfg, method, route, { body, form, raw = false } = {}) {
  const headers = { Authorization: `Bearer ${cfg.token}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await ctx.fetch(`${cfg.url}${route}`, { method, headers, body: payload });
  } catch {
    throw new CliError(`Could not reach ${cfg.url}. Is the server running, and is the address right?`);
  }
  if (!response.ok) {
    let message = `The server answered ${response.status}.`;
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // not JSON; keep the status message
    }
    if (response.status === 401) message = `${message} Run "iconvault login" with a valid API token.`;
    throw new CliError(message);
  }
  return raw ? response : response.json();
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

// A project id, or an exact name or prefix (case-insensitive) among the projects the token can see. Ambiguity is an error, never a guess.
async function resolveProject(ctx, cfg, reference) {
  if (!reference) throw new CliError("Name the project (its id, name or prefix).");
  if (OBJECT_ID.test(reference)) return { id: reference, label: reference };
  const { projects } = await request(ctx, cfg, "GET", "/api/projects?limit=100&status=all");
  const wanted = reference.toLowerCase();
  let matches = projects.filter((p) => p.name.toLowerCase() === wanted);
  if (matches.length === 0) matches = projects.filter((p) => p.prefix.toLowerCase() === wanted);
  if (matches.length === 0) throw new CliError(`No project named "${reference}". Run "iconvault projects" to see yours.`);
  if (matches.length > 1) throw new CliError(`"${reference}" matches ${matches.length} projects (${matches.map((p) => p.id).join(", ")}). Use the id.`);
  return { id: matches[0].id, label: matches[0].name };
}

// ---- output ----

function table(rows, columns) {
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ").trimEnd();
  return [line(columns.map((c) => c.toUpperCase())), ...rows.map((r) => line(columns.map((c) => r[c] ?? "")))].join("\n");
}

function filenameFrom(response, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(response.headers.get("content-disposition") || "");
  return match ? match[1] : fallback;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- commands ----

async function askToken(ctx) {
  if (!ctx.stdin) throw new CliError("Give the token with --token or the ICONVAULT_TOKEN variable.");
  const muted = new Writable({ write: (_chunk, _enc, done) => done() });
  ctx.stderr.write("API token (input is hidden): ");
  const rl = readline.createInterface({ input: ctx.stdin, output: muted, terminal: Boolean(ctx.stdin.isTTY) });
  const answer = await new Promise((resolve) => {
    rl.once("line", resolve);
    rl.once("close", () => resolve(""));
  });
  rl.close();
  ctx.stderr.write("\n");
  return answer.trim();
}

const commands = {
  async login(ctx, argv) {
    const { options } = parseArgs(argv, { url: true, token: true });
    const url = (options.url || ctx.env.ICONVAULT_URL || (await readConfig(ctx)).url || DEFAULT_URL).replace(/\/+$/, "");
    const token = options.token || ctx.env.ICONVAULT_TOKEN || (await askToken(ctx));
    if (!token) throw new CliError("No token given.");
    if (!token.startsWith("isv_")) throw new CliError('That does not look like an API token (they start with "isv_"). Create one in the web app under API tokens.');
    const { user } = await request(ctx, { url, token }, "GET", "/api/auth/me");
    const file = configPath(ctx);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ url, token }, null, 2)}\n`, { mode: 0o600 });
    await chmod(file, 0o600);
    ctx.stdout.write(`Signed in as ${user.displayName} <${user.email}> on ${url}\n`);
  },

  async logout(ctx) {
    await rm(configPath(ctx), { force: true });
    ctx.stdout.write("Removed the saved token from this computer. To stop it working everywhere, revoke it in the web app (API tokens).\n");
  },

  async whoami(ctx, argv) {
    const { options } = parseArgs(argv, { url: true, token: true });
    const cfg = await settings(ctx, options);
    requireToken(cfg);
    const { user } = await request(ctx, cfg, "GET", "/api/auth/me");
    ctx.stdout.write(`${user.displayName} <${user.email}> on ${cfg.url}\n`);
  },

  async projects(ctx, argv) {
    const { options } = parseArgs(argv, { url: true, token: true, mine: false, public: false, json: false });
    const cfg = await settings(ctx, options);
    requireToken(cfg);
    const scope = options.mine ? "mine" : options.public ? "public" : "all";
    const { projects } = await request(ctx, cfg, "GET", `/api/projects?limit=100&scope=${scope}`);
    if (options.json) return void ctx.stdout.write(`${JSON.stringify(projects, null, 2)}\n`);
    if (projects.length === 0) return void ctx.stdout.write("No projects.\n");
    ctx.stdout.write(`${table(projects.map((p) => ({ id: p.id, name: p.name, prefix: p.prefix, icons: p.iconCount, type: p.purpose, visibility: p.visibility, owner: p.owner.displayName })), ["id", "name", "prefix", "icons", "type", "visibility", "owner"])}\n`);
  },

  async icons(ctx, argv) {
    const { positional, options } = parseArgs(argv, { url: true, token: true, folder: true, json: false });
    const cfg = await settings(ctx, options);
    requireToken(cfg);
    const project = await resolveProject(ctx, cfg, positional[0]);
    const query = new URLSearchParams({ limit: "1000", svg: "false", sort: "name" });
    if (options.folder) query.set("folderId", options.folder);
    const { icons, total } = await request(ctx, cfg, "GET", `/api/projects/${project.id}/icons?${query}`);
    if (options.json) return void ctx.stdout.write(`${JSON.stringify(icons, null, 2)}\n`);
    if (icons.length === 0) return void ctx.stdout.write("No icons.\n");
    ctx.stdout.write(`${table(icons.map((i) => ({ id: i.id, slug: i.slug, name: i.name, size: `${i.byteSize} B`, tags: i.tags.join(",") })), ["id", "slug", "name", "size", "tags"])}\n`);
    if (total > icons.length) ctx.stderr.write(`Showing the first ${icons.length} of ${total}.\n`);
  },

  async upload(ctx, argv) {
    const { positional, options } = parseArgs(argv, { url: true, token: true, folder: true, strategy: true, optimize: false });
    const cfg = await settings(ctx, options);
    requireToken(cfg);
    const strategy = options.strategy ?? "rename";
    if (!["rename", "replace", "skip"].includes(strategy)) throw new CliError('--strategy must be "rename", "replace" or "skip".');
    const [reference, ...inputs] = positional;
    if (inputs.length === 0) throw new CliError("Name at least one .svg or .zip file, or a folder that contains some.");
    const files = await collectFiles(inputs);
    if (files.length === 0) throw new CliError("No .svg or .zip files found.");
    const project = await resolveProject(ctx, cfg, reference);

    const total = { created: 0, replaced: 0, skipped: 0, errors: [] };
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const form = new FormData();
      for (const file of files.slice(i, i + BATCH_SIZE)) form.append("files", new Blob([await readFile(file)]), path.basename(file));
      form.append("strategy", strategy);
      form.append("optimize", String(options.optimize !== false));
      if (options.folder) form.append("folderId", options.folder);
      const result = await request(ctx, cfg, "POST", `/api/projects/${project.id}/icons/upload`, { form });
      total.created += result.created.length;
      total.replaced += result.replaced.length;
      total.skipped += result.skipped.length;
      total.errors.push(...result.errors.map((e) => `${e.file}: ${e.message}`));
      ctx.stderr.write(`Sent ${Math.min(i + BATCH_SIZE, files.length)} of ${plural(files.length, "file")}\n`);
    }
    ctx.stdout.write(`${project.label}: added ${total.created}, replaced ${total.replaced}, skipped ${total.skipped}.\n`);
    for (const message of total.errors) ctx.stderr.write(`  not added: ${message}\n`);
    if (total.errors.length > 0) return 2;
    return 0;
  },

  async sprite(ctx, argv) {
    const { positional, options } = parseArgs(argv, { url: true, token: true, folder: true, out: true });
    const cfg = await settings(ctx, options);
    requireToken(cfg);
    const project = await resolveProject(ctx, cfg, positional[0]);
    const query = options.folder ? `?folderId=${encodeURIComponent(options.folder)}` : "";
    const response = await request(ctx, cfg, "GET", `/api/projects/${project.id}/sprite${query}`, { raw: true });
    const xml = await response.text();
    const count = response.headers.get("x-sprite-symbols") ?? "?";
    if (options.out) {
      await writeFile(options.out, xml);
      ctx.stdout.write(`Wrote ${plural(Number(count), "symbol")} to ${options.out}\n`);
    } else {
      ctx.stdout.write(xml);
      if (!xml.endsWith("\n")) ctx.stdout.write("\n");
      ctx.stderr.write(`${plural(Number(count), "symbol")}\n`);
    }
  },

  async export(ctx, argv) {
    const { positional, options } = parseArgs(argv, { url: true, token: true, out: true });
    const cfg = await settings(ctx, options);
    requireToken(cfg);
    const project = await resolveProject(ctx, cfg, positional[0]);
    const response = await request(ctx, cfg, "GET", `/api/projects/${project.id}/export`, { raw: true });
    const out = options.out || path.join(ctx.cwd, filenameFrom(response, "project-export.zip"));
    await writeFile(out, Buffer.from(await response.arrayBuffer()));
    ctx.stdout.write(`Exported ${project.label} to ${out}\n`);
  },

  async import(ctx, argv) {
    const { positional, options } = parseArgs(argv, { url: true, token: true });
    const cfg = await settings(ctx, options);
    requireToken(cfg);
    if (!positional[0]) throw new CliError("Name the export ZIP to import.");
    let data;
    try {
      data = await readFile(positional[0]);
    } catch {
      throw new CliError(`Could not read ${positional[0]}.`);
    }
    const form = new FormData();
    form.append("file", new Blob([data], { type: "application/zip" }), path.basename(positional[0]));
    const result = await request(ctx, cfg, "POST", "/api/projects/import", { form });
    ctx.stdout.write(`Created "${result.project.name}" (${result.project.id}) with ${plural(result.imported, "icon")} and ${plural(result.foldersCreated, "folder")}.\n`);
    for (const problem of result.problems) ctx.stderr.write(`  not imported: ${problem.file}: ${problem.message}\n`);
    if (result.problems.length > 0) return 2;
    return 0;
  },
};

// .svg and .zip files from the given files and folders, in a stable order. Inside a folder, hidden names and other kinds of file are skipped quietly; a file named directly must be an .svg or .zip.
async function collectFiles(inputs) {
  const found = [];
  async function visit(target, direct) {
    let info;
    try {
      info = await stat(target);
    } catch {
      throw new CliError(`Could not find ${target}.`);
    }
    if (info.isDirectory()) {
      for (const entry of (await readdir(target)).sort()) if (!entry.startsWith(".")) await visit(path.join(target, entry), false);
    } else if (/\.(svg|zip)$/i.test(target)) {
      found.push(target);
    } else if (direct) {
      throw new CliError(`${target} is not an .svg or .zip file.`);
    }
  }
  for (const input of inputs) await visit(input, true);
  return found;
}

// ---- entry ----

export async function main(argv, ctx = {}) {
  const context = {
    fetch: ctx.fetch ?? globalThis.fetch,
    env: ctx.env ?? process.env,
    home: ctx.home ?? homedir(),
    cwd: ctx.cwd ?? process.cwd(),
    stdout: ctx.stdout ?? process.stdout,
    stderr: ctx.stderr ?? process.stderr,
    stdin: "stdin" in ctx ? ctx.stdin : process.stdin,
  };
  const [name, ...rest] = argv;
  if (!name || name === "help" || name === "--help" || name === "-h") {
    context.stdout.write(`${HELP}\n`);
    return name ? 0 : 1;
  }
  const command = commands[name];
  if (!command || !Object.hasOwn(commands, name)) {
    context.stderr.write(`Unknown command "${name}". Try "iconvault help".\n`);
    return 1;
  }
  try {
    return (await command(context, rest)) ?? 0;
  } catch (err) {
    context.stderr.write(`Error: ${err instanceof CliError ? err.message : `Unexpected problem: ${err instanceof Error ? err.message : err}`}\n`);
    return 1;
  }
}
