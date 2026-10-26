// Shared setup for HTTP tests that need a database: connects the app's models to a throwaway database, starts the real Express app on a free port, and creates signed-in users. Each test file runs in its own process, so each gets its own database.
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { signSession } from "../../src/lib/session.js";
import ApiToken from "../../src/models/ApiToken.js";
import Folder from "../../src/models/Folder.js";
import Icon from "../../src/models/Icon.js";
import IconVersion from "../../src/models/IconVersion.js";
import Project from "../../src/models/Project.js";
import User from "../../src/models/User.js";

export type Reply = { status: number; body: any; headers: Headers; raw: Response };
export type TestUser = { id: string; email: string; token: string };

export const hasDatabase = Boolean(process.env.MONGODB_URI);

export async function startHarness() {
  const uri = process.env.MONGODB_URI as string;
  const dbName = `svg-compiler-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Safety: only ever touch a database created by this test.
  assert.match(dbName, /^svg-compiler-test-/);

  process.env.SESSION_SECRET = "http-test-secret-0123456789";
  // These suites make thousands of requests from one address; the limiter has its own tests.
  process.env.RATE_LIMIT_DISABLED = "1";
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
  await Promise.all([User, Project, Folder, Icon, IconVersion, ApiToken].map((model) => model.syncIndexes()));

  const server: Server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const adminEmails: string[] = [];
  let counter = 0;

  async function makeUser(label: string, options: { admin?: boolean } = {}): Promise<TestUser> {
    counter += 1;
    const email = `${label}-${counter}@example.test`;
    const user = await User.create({ provider: "google", providerId: `${label}-${counter}`, email, emailVerified: true, displayName: label });
    if (options.admin) {
      adminEmails.push(email);
      process.env.ADMIN_EMAILS = adminEmails.join(",");
    }
    const token = await signSession({ sub: String(user._id), email, provider: "google", providerId: `${label}-${counter}` });
    return { id: String(user._id), email, token };
  }

  async function call(token: string | null, method: string, path: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: payload });
    const text = await res.clone().text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON (for example an SVG or ZIP download)
    }
    return { status: res.status, body: parsed, headers: res.headers, raw: res };
  }

  async function stop() {
    assert.match(mongoose.connection.name, /^svg-compiler-test-/);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  return { baseUrl, makeUser, call, stop };
}

export const SVG = (inner = '<path d="M2 2h20v20H2z"/>', extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${extra}>${inner}</svg>`;
