// Smoke tests for the API. They start the real server without a database (MONGODB_URI is empty) and check the routes that must keep working through the Icon Vault integration: health, authentication gates, input validation, and 404 handling.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { after, before, describe, it } from "node:test";

let child: ChildProcess;
let base = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, attempts = 240): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not start at ${url}`);
}

async function postJson(path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API smoke tests (no database)", () => {
  before(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        // Empty value means "not configured": the server must still boot.
        MONGODB_URI: "",
        SESSION_SECRET: "smoke-test-secret-0123456789",
        GOOGLE_CLIENT_ID: "smoke-test-google-client",
        MS_CLIENT_ID: "",
      },
      stdio: "ignore",
    });
    await waitForServer(`${base}/`);
  });

  after(() => {
    child?.kill();
  });

  it("boots without a database and answers the health route", async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "Backend Running");
  });

  it("returns 404 JSON for unknown paths", async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "Not found" });
  });

  it("answers project requests with 503 while there is no database", async () => {
    const res = await fetch(`${base}/api/projects`);
    assert.equal(res.status, 503);
  });

  it("does not let a malformed token past the database gate either", async () => {
    const res = await fetch(`${base}/api/projects`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    assert.equal(res.status, 503);
  });

  it("no longer serves the retired library routes", async () => {
    const res = await fetch(`${base}/api/sprites`);
    assert.equal(res.status, 404);
  });

  it("rejects /api/auth/me without a token", async () => {
    const res = await fetch(`${base}/api/auth/me`);
    assert.equal(res.status, 401);
  });

  it("requires a credential for Google sign-in", async () => {
    const res = await postJson("/api/auth/google", {});
    assert.equal(res.status, 400);
  });

  it("rejects an invalid Google credential", async () => {
    const res = await postJson("/api/auth/google", { credential: "x" });
    assert.equal(res.status, 401);
  });

  it("requires an idToken for Microsoft sign-in", async () => {
    const res = await postJson("/api/auth/microsoft", {});
    assert.equal(res.status, 400);
  });
});
