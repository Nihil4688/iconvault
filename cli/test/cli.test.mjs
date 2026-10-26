// Tests for the iconvault command line, run against a small mock of the server's API: argument handling, saved settings, every command, project lookup by name, batching, exit codes, and that the token is never printed.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { Readable } from "node:stream";
import { DEFAULT_URL, main, parseArgs } from "../src/cli.mjs";

const TOKEN = "isv_TESTTOKENTESTTOKENTESTTOKENTESTTOKENTEST123";
const ID_A = "a".repeat(24);
const ID_B = "b".repeat(24);

let server;
let base;
let calls;
let dir;
let projects;
let uploadReply;

before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, "http://x");
    calls.push({ method: req.method, path: url.pathname, query: url.search, auth: req.headers.authorization, body, type: req.headers["content-type"] ?? "" });
    const json = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: "That API token is invalid or has been revoked." });
    const route = `${req.method} ${url.pathname}`;
    if (route === "GET /api/auth/me") return json(200, { user: { displayName: "Ada", email: "ada@example.com" } });
    if (route === "GET /api/projects") return json(200, { projects });
    if (route === `GET /api/projects/${ID_A}/icons`) return json(200, { icons: [{ id: "i1", slug: "home", name: "Home", byteSize: 120, tags: ["nav", "ui"] }], total: 1 });
    if (route === `POST /api/projects/${ID_A}/icons/upload`) return json(201, uploadReply());
    if (route === `GET /api/projects/${ID_A}/sprite`) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "X-Sprite-Symbols": "2" });
      return res.end("<svg><symbol id='fth-home'/></svg>");
    }
    if (route === `GET /api/projects/${ID_A}/export`) {
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="feather-export.zip"' });
      return res.end(Buffer.from("PK-fake-zip"));
    }
    if (route === "POST /api/projects/import") return json(201, { project: { id: ID_B, name: "Feather" }, imported: 3, foldersCreated: 1, problems: [] });
    return json(404, { error: "Not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

beforeEach(async () => {
  calls = [];
  dir = await mkdtemp(path.join(tmpdir(), "iconvault-test-"));
  projects = [
    { id: ID_A, name: "Feather", prefix: "fth", iconCount: 3, purpose: "sprite", visibility: "public", owner: { displayName: "Ada" } },
    { id: ID_B, name: "Other", prefix: "oth", iconCount: 0, purpose: "font", visibility: "private", owner: { displayName: "Bob" } },
  ];
  uploadReply = () => ({ created: [{}, {}], replaced: [], skipped: [], errors: [] });
});

// Runs the CLI with captured output and a private config location.
async function run(argv, extra = {}) {
  const out = [];
  const err = [];
  const code = await main(argv, {
    env: { ICONVAULT_CONFIG: path.join(dir, "config.json"), ...extra.env },
    home: dir,
    cwd: dir,
    stdout: { write: (s) => out.push(s) },
    stderr: { write: (s) => err.push(s) },
    stdin: "stdin" in extra ? extra.stdin : null,
  });
  return { code, out: out.join(""), err: err.join("") };
}
const withToken = { env: { ICONVAULT_URL: undefined, ICONVAULT_TOKEN: TOKEN } };
const cfgArgs = ["--url", "URL", "--token", TOKEN];
const args = (...a) => a.map((x) => (x === "URL" ? base : x));

describe("arguments", () => {
  it("separates words from options and accepts --name=value", () => {
    const parsed = parseArgs(["Feather", "--out=a.svg", "--json", "x"], { out: true, json: false });
    assert.deepEqual(parsed, { positional: ["Feather", "x"], options: { out: "a.svg", json: true } });
  });

  it("understands --no-<switch>", () => {
    assert.deepEqual(parseArgs(["--no-optimize"], { optimize: false }).options, { optimize: false });
  });

  it("refuses unknown options and options missing their value", () => {
    assert.throws(() => parseArgs(["--nope"], {}), /Unknown option --nope/);
    assert.throws(() => parseArgs(["--out"], { out: true }), /--out needs a value/);
    assert.throws(() => parseArgs(["--out", "--json"], { out: true, json: false }), /--out needs a value/);
  });

  it("treats everything after -- as words", () => {
    assert.deepEqual(parseArgs(["--", "--weird.svg"], {}).positional, ["--weird.svg"]);
  });
});

describe("help and unknown commands", () => {
  it("prints help, and exits 1 when no command was given", async () => {
    const none = await run([]);
    assert.equal(none.code, 1);
    assert.match(none.out, /Usage: iconvault/);
    assert.equal((await run(["help"])).code, 0);
    assert.match((await run(["--help"])).out, /login/);
  });

  it("rejects an unknown command", async () => {
    const r = await run(["frobnicate"]);
    assert.equal(r.code, 1);
    assert.match(r.err, /Unknown command "frobnicate"/);
    assert.equal((await run(["constructor"])).code, 1);
  });
});

describe("signing in", () => {
  it("asks for a token before doing anything", async () => {
    const r = await run(["projects"]);
    assert.equal(r.code, 1);
    assert.match(r.err, /Not signed in/);
    assert.equal(calls.length, 0);
  });

  it("login checks the token, saves it privately, and never prints it", async () => {
    const r = await run(["login", ...args("--url", "URL", "--token", TOKEN)]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Signed in as Ada <ada@example\.com>/);
    assert.equal(r.out.includes(TOKEN) || r.err.includes(TOKEN), false);
    const file = path.join(dir, "config.json");
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { url: base, token: TOKEN });
    assert.equal((await stat(file)).mode & 0o077, 0, "the file must not be readable by others");
    // The saved settings are used afterwards.
    const next = await run(["whoami"]);
    assert.equal(next.code, 0, next.err);
    assert.match(next.out, /Ada <ada@example\.com>/);
  });

  it("login refuses something that is not a token, and a token the server rejects", async () => {
    const wrong = await run(["login", ...args("--url", "URL", "--token", "eyJsession.jwt")]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.err, /does not look like an API token/);
    const revoked = await run(["login", ...args("--url", "URL", "--token", "isv_revokedrevokedrevokedrevokedrevoked123")]);
    assert.equal(revoked.code, 1);
    assert.match(revoked.err, /invalid or has been revoked/);
    await assert.rejects(stat(path.join(dir, "config.json")));
  });

  it("login can read the token from standard input", async () => {
    const r = await run(["login", "--url", base], { stdin: Readable.from([`${TOKEN}\n`]) });
    assert.equal(r.code, 0, r.err);
    assert.equal(JSON.parse(await readFile(path.join(dir, "config.json"), "utf8")).token, TOKEN);
  });

  it("settings come from flags, then the environment, then the saved file", async () => {
    await run(["login", ...args("--url", "URL", "--token", TOKEN)]);
    const viaEnv = await run(["whoami"], { env: { ICONVAULT_TOKEN: "isv_wrongwrongwrongwrongwrongwrongwrong1234" } });
    assert.equal(viaEnv.code, 1);
    const viaFlag = await run(["whoami", "--token", TOKEN], { env: { ICONVAULT_TOKEN: "isv_wrongwrongwrongwrongwrongwrongwrong1234" } });
    assert.equal(viaFlag.code, 0, viaFlag.err);
  });

  it("logout removes the saved token", async () => {
    await run(["login", ...args("--url", "URL", "--token", TOKEN)]);
    assert.equal((await run(["logout"])).code, 0);
    await assert.rejects(stat(path.join(dir, "config.json")));
    assert.equal((await run(["logout"])).code, 0);
  });

  it("explains an unreachable server and suggests logging in again on 401", async () => {
    const down = await run(["whoami", "--url", "http://127.0.0.1:1", "--token", TOKEN]);
    assert.equal(down.code, 1);
    assert.match(down.err, /Could not reach http:\/\/127\.0\.0\.1:1/);
    const bad = await run(["whoami", "--url", base, "--token", "isv_nopenopenopenopenopenopenopenopenopen12"]);
    assert.match(bad.err, /Run "iconvault login"/);
    assert.equal(bad.err.includes("isv_nope"), false);
  });

  it("uses the default server address when none is given", () => {
    assert.equal(DEFAULT_URL, "http://localhost:5000");
  });
});

describe("projects and icons", () => {
  it("lists projects as a table or as JSON, sending the token", async () => {
    const r = await run(["projects", ...args(...cfgArgs)]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /ID\s+NAME\s+PREFIX\s+ICONS/);
    assert.match(r.out, /Feather\s+fth\s+3\s+sprite\s+public\s+Ada/);
    assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
    const json = await run(["projects", "--json", ...args(...cfgArgs)]);
    assert.equal(JSON.parse(json.out)[1].name, "Other");
  });

  it("passes the scope filters", async () => {
    await run(["projects", "--mine", ...args(...cfgArgs)]);
    await run(["projects", "--public", ...args(...cfgArgs)]);
    assert.deepEqual(calls.map((c) => new URLSearchParams(c.query).get("scope")), ["mine", "public"]);
  });

  it("finds a project by exact name or prefix, ignoring case, but never guesses", async () => {
    assert.equal((await run(["icons", "feather", ...args(...cfgArgs)])).code, 0);
    assert.equal((await run(["icons", "FTH", ...args(...cfgArgs)])).code, 0);
    const missing = await run(["icons", "Feath", ...args(...cfgArgs)]);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /No project named "Feath"/);
    projects.push({ ...projects[0], id: "c".repeat(24) });
    const twice = await run(["icons", "Feather", ...args(...cfgArgs)]);
    assert.match(twice.err, /matches 2 projects/);
  });

  it("accepts a project id without looking it up", async () => {
    await run(["icons", ID_A, ...args(...cfgArgs)]);
    assert.equal(calls.some((c) => c.path === "/api/projects"), false);
  });

  it("lists a project's icons with their tags", async () => {
    const r = await run(["icons", ID_A, "--folder", "root", ...args(...cfgArgs)]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /home\s+Home\s+120 B\s+nav,ui/);
    assert.equal(new URLSearchParams(calls[0].query).get("folderId"), "root");
    assert.equal(new URLSearchParams(calls[0].query).get("svg"), "false");
  });
});

describe("upload", () => {
  async function makeFiles() {
    await mkdir(path.join(dir, "icons", "nested"), { recursive: true });
    await writeFile(path.join(dir, "icons", "a.svg"), "<svg/>");
    await writeFile(path.join(dir, "icons", "nested", "b.SVG"), "<svg/>");
    await writeFile(path.join(dir, "icons", "notes.txt"), "x");
    await writeFile(path.join(dir, "icons", ".hidden.svg"), "<svg/>");
    await writeFile(path.join(dir, "pack.zip"), "PK");
  }

  it("sends the svg and zip files found in files and folders, skipping hidden ones", async () => {
    await makeFiles();
    const r = await run(["upload", ID_A, path.join(dir, "icons"), path.join(dir, "pack.zip"), ...args(...cfgArgs)].filter((x) => x !== path.join(dir, "icons", "notes.txt")));
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /added 2, replaced 0, skipped 0/);
    const upload = calls.find((c) => c.path.endsWith("/icons/upload"));
    const text = upload.body.toString("latin1");
    assert.equal([...text.matchAll(/filename="([^"]+)"/g)].map((m) => m[1]).join(","), "a.svg,b.SVG,pack.zip");
    assert.match(text, /name="strategy"\r\n\r\nrename/);
    assert.match(text, /name="optimize"\r\n\r\ntrue/);
  });

  it("passes the folder, strategy and --no-optimize", async () => {
    await makeFiles();
    await run(["upload", ID_A, path.join(dir, "icons", "a.svg"), "--folder", ID_B, "--strategy", "replace", "--no-optimize", ...args(...cfgArgs)]);
    const text = calls.find((c) => c.path.endsWith("/upload")).body.toString("latin1");
    assert.match(text, /name="strategy"\r\n\r\nreplace/);
    assert.match(text, /name="optimize"\r\n\r\nfalse/);
    assert.match(text, new RegExp(`name="folderId"\\r\\n\\r\\n${ID_B}`));
  });

  it("splits more than 100 files into batches", async () => {
    await mkdir(path.join(dir, "many"));
    for (let i = 0; i < 230; i += 1) await writeFile(path.join(dir, "many", `i${String(i).padStart(3, "0")}.svg`), "<svg/>");
    const r = await run(["upload", ID_A, path.join(dir, "many"), ...args(...cfgArgs)]);
    assert.equal(r.code, 0, r.err);
    const uploads = calls.filter((c) => c.path.endsWith("/upload"));
    assert.deepEqual(uploads.map((u) => (u.body.toString("latin1").match(/filename=/g) ?? []).length), [100, 100, 30]);
    assert.match(r.out, /added 6, replaced/);
  });

  it("lists files the server could not add and exits with 2, still reporting what was added", async () => {
    await makeFiles();
    uploadReply = () => ({ created: [{}], replaced: [{}], skipped: [{}], errors: [{ file: "a.svg", message: "Contains a script." }] });
    const r = await run(["upload", ID_A, path.join(dir, "icons", "a.svg"), ...args(...cfgArgs)]);
    assert.equal(r.code, 2);
    assert.match(r.out, /added 1, replaced 1, skipped 1/);
    assert.match(r.err, /not added: a\.svg: Contains a script\./);
  });

  it("refuses bad input before contacting the server", async () => {
    await makeFiles();
    const none = await run(["upload", ID_A, ...args(...cfgArgs)]);
    assert.match(none.err, /Name at least one/);
    const wrong = await run(["upload", ID_A, path.join(dir, "icons", "notes.txt"), ...args(...cfgArgs)]);
    assert.match(wrong.err, /not an \.svg or \.zip/);
    const gone = await run(["upload", ID_A, path.join(dir, "nope.svg"), ...args(...cfgArgs)]);
    assert.match(gone.err, /Could not find/);
    const strat = await run(["upload", ID_A, path.join(dir, "icons", "a.svg"), "--strategy", "explode", ...args(...cfgArgs)]);
    assert.match(strat.err, /--strategy must be/);
    await mkdir(path.join(dir, "empty"));
    assert.match((await run(["upload", ID_A, path.join(dir, "empty"), ...args(...cfgArgs)])).err, /No \.svg or \.zip files found/);
    assert.equal(calls.length, 0);
  });
});

describe("sprite, export and import", () => {
  it("writes the sprite to a file, or prints it for piping", async () => {
    const file = path.join(dir, "out.svg");
    const toFile = await run(["sprite", ID_A, "--out", file, ...args(...cfgArgs)]);
    assert.equal(toFile.code, 0, toFile.err);
    assert.match(toFile.out, /Wrote 2 symbols to/);
    assert.equal(await readFile(file, "utf8"), "<svg><symbol id='fth-home'/></svg>");
    const printed = await run(["sprite", ID_A, "--folder", "root", ...args(...cfgArgs)]);
    assert.equal(printed.out, "<svg><symbol id='fth-home'/></svg>\n");
    assert.match(printed.err, /2 symbols/);
    assert.equal(calls.at(-1).query, "?folderId=root");
  });

  it("exports to the name the server suggests, or to --out", async () => {
    const r = await run(["export", ID_A, ...args(...cfgArgs)]);
    assert.equal(r.code, 0, r.err);
    assert.equal(await readFile(path.join(dir, "feather-export.zip"), "utf8"), "PK-fake-zip");
    const target = path.join(dir, "mine.zip");
    await run(["export", ID_A, "--out", target, ...args(...cfgArgs)]);
    assert.equal(await readFile(target, "utf8"), "PK-fake-zip");
  });

  it("imports a ZIP as a new project", async () => {
    await writeFile(path.join(dir, "in.zip"), "PK-data");
    const r = await run(["import", path.join(dir, "in.zip"), ...args(...cfgArgs)]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, new RegExp(`Created "Feather" \\(${ID_B}\\) with 3 icons and 1 folder\\.`));
    const sent = calls.at(-1);
    assert.match(sent.type, /^multipart\/form-data/);
    assert.match(sent.body.toString("latin1"), /filename="in\.zip"[\s\S]*PK-data/);
  });

  it("reports import problems with exit code 2, and bad input with 1", async () => {
    await writeFile(path.join(dir, "in.zip"), "PK");
    projects = [];
    const missing = await run(["import", path.join(dir, "nope.zip"), ...args(...cfgArgs)]);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /Could not read/);
    assert.match((await run(["import", ...args(...cfgArgs)])).err, /Name the export ZIP/);
  });

  it("needs a project name for project commands", async () => {
    for (const command of ["icons", "sprite", "export"]) {
      const r = await run([command, ...args(...cfgArgs)]);
      assert.equal(r.code, 1, command);
      assert.match(r.err, /Name the project/);
    }
  });
});
