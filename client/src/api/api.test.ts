// Tests for the shared HTTP client and the project, folder and icon API modules. Requests are intercepted at the adapter, so these check exactly what would be sent (method, URL, query, body, headers) and how failures are reported.
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as folders from "./folders";
import { ApiError, http } from "./http";
import * as icons from "./icons";
import * as projects from "./projects";

type Reply = { status?: number; data?: unknown; headers?: Record<string, string> };

function intercept(respond: (config: InternalAxiosRequestConfig) => Reply = () => ({})) {
  const calls: InternalAxiosRequestConfig[] = [];
  http.defaults.adapter = async (config) => {
    calls.push(config);
    const reply = respond(config);
    const response = { data: reply.data ?? {}, status: reply.status ?? 200, statusText: "", headers: reply.headers ?? {}, config, request: {} };
    if (response.status >= 400) throw new AxiosError("failed", "ERR_BAD_REQUEST", config, {}, response);
    return response;
  };
  return calls;
}

const sent = (config: InternalAxiosRequestConfig | undefined) => (typeof config?.data === "string" ? JSON.parse(config.data) : config?.data);
const last = (calls: InternalAxiosRequestConfig[]) => calls[calls.length - 1] as InternalAxiosRequestConfig;

const originalAdapter = http.defaults.adapter;
beforeEach(() => {
  window.__svgCompilerSessionToken = null;
});
afterEach(() => {
  http.defaults.adapter = originalAdapter;
  window.__svgCompilerSessionToken = null;
});

describe("http client", () => {
  it("sends the session token when there is one, and none when there is not", async () => {
    const calls = intercept();
    await projects.listProjects();
    expect(last(calls).headers.get("Authorization")).toBeFalsy();

    window.__svgCompilerSessionToken = "token-123";
    await projects.listProjects();
    expect(last(calls).headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("turns a server error into an ApiError with the server's message, status and details", async () => {
    intercept(() => ({ status: 400, data: { error: "Invalid input (name): is required", details: [{ path: "name", message: "is required" }] } }));
    const error = await projects.createProject({ name: "" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Invalid input (name): is required", status: 400, details: [{ path: "name", message: "is required" }] });
  });

  it("falls back to a plain message when the error has no body", async () => {
    intercept(() => ({ status: 500, data: "" }));
    await expect(projects.getProject("x")).rejects.toMatchObject({ message: "The server answered 500.", status: 500 });
  });

  it("reads the error message out of a downloaded Blob", async () => {
    intercept(() => ({ status: 404, data: new Blob([JSON.stringify({ error: "No matching icons found." })]) }));
    await expect(icons.downloadIcons("p", ["i"])).rejects.toMatchObject({ message: "No matching icons found.", status: 404 });
  });

  it("explains when the server cannot be reached", async () => {
    http.defaults.adapter = async (config) => {
      throw new AxiosError("Network Error", "ERR_NETWORK", config);
    };
    const error = (await projects.listProjects().catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBeNull();
    expect(error.message).toMatch(/could not reach the server/i);
  });
});

describe("projects API", () => {
  it("lists with query parameters", async () => {
    const calls = intercept();
    await projects.listProjects({ scope: "mine", status: "all", sort: "name", page: 2, limit: 10, search: "feather" });
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/projects", params: { scope: "mine", status: "all", sort: "name", page: 2, limit: 10, search: "feather" } });
  });

  it("creates, reads, updates, deletes and duplicates", async () => {
    const calls = intercept();
    await projects.createProject({ name: "Feather", purpose: "font", visibility: "public" });
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/projects" });
    expect(sent(last(calls))).toEqual({ name: "Feather", purpose: "font", visibility: "public" });

    await projects.getProject("abc");
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/projects/abc" });

    await projects.updateProject("abc", { name: "New", isArchived: true });
    expect(last(calls)).toMatchObject({ method: "patch", url: "/api/projects/abc" });
    expect(sent(last(calls))).toEqual({ name: "New", isArchived: true });

    await projects.deleteProject("abc");
    expect(last(calls)).toMatchObject({ method: "delete", url: "/api/projects/abc" });

    await projects.duplicateProject("abc");
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/projects/abc/duplicate" });
  });

  it("encodes ids so they cannot change the path", async () => {
    const calls = intercept();
    await projects.getProject("a/b?c");
    expect(last(calls).url).toBe("/api/projects/a%2Fb%3Fc");
  });
});

describe("folders API", () => {
  it("lists, creates, renames, moves and deletes", async () => {
    const calls = intercept();
    await folders.listFolders("p1");
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/projects/p1/folders" });

    await folders.createFolder("p1", { name: "UI", parentId: null });
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/projects/p1/folders" });
    expect(sent(last(calls))).toEqual({ name: "UI", parentId: null });

    await folders.renameFolder("f1", "Icons");
    expect(last(calls)).toMatchObject({ method: "patch", url: "/api/folders/f1" });
    expect(sent(last(calls))).toEqual({ name: "Icons" });

    await folders.moveFolder("f1", { parentId: "f2", orderIndex: 3 });
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/folders/f1/move" });
    expect(sent(last(calls))).toEqual({ parentId: "f2", orderIndex: 3 });

    await folders.deleteFolder("f1");
    expect(last(calls)).toMatchObject({ method: "delete", url: "/api/folders/f1" });
  });
});

describe("icons API", () => {
  it("lists and searches", async () => {
    const calls = intercept();
    await icons.listIcons("p1", { folderId: "root", trash: true, sort: "name", svg: false });
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/projects/p1/icons", params: { folderId: "root", trash: true, sort: "name", svg: false } });
    await icons.searchIcons("arrow", { limit: 5 });
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/icons/search", params: { q: "arrow", limit: 5 } });
  });

  it("uploads files as multipart with the options as fields", async () => {
    const calls = intercept();
    const a = new File(["<svg/>"], "a.svg", { type: "image/svg+xml" });
    const b = new File(["zip"], "pack.zip", { type: "application/zip" });
    await icons.uploadIcons("p1", [a, b], { folderId: "f9", strategy: "skip", optimize: false, tags: ["ui", "nav"] });
    const config = last(calls);
    expect(config).toMatchObject({ method: "post", url: "/api/projects/p1/icons/upload" });
    const form = config.data as FormData;
    expect(form.getAll("files").map((f) => (f as File).name)).toEqual(["a.svg", "pack.zip"]);
    expect(form.get("folderId")).toBe("f9");
    expect(form.get("strategy")).toBe("skip");
    expect(form.get("optimize")).toBe("false");
    expect(JSON.parse(form.get("tags") as string)).toEqual(["ui", "nav"]);
  });

  it("uploads with defaults: root folder, rename, optimize, no tags", async () => {
    const calls = intercept();
    await icons.uploadIcons("p1", [new File(["<svg/>"], "a.svg")]);
    const form = last(calls).data as FormData;
    expect(form.get("folderId")).toBe("");
    expect(form.get("strategy")).toBe("rename");
    expect(form.get("optimize")).toBe("true");
    expect(form.get("tags")).toBe("[]");
  });

  it("pastes and copies", async () => {
    const calls = intercept();
    await icons.pasteIcon("p1", { rawSvg: "<svg/>", name: "Arrow", strategy: "replace" });
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/projects/p1/icons/paste" });
    expect(sent(last(calls))).toEqual({ rawSvg: "<svg/>", name: "Arrow", strategy: "replace" });
    await icons.copyIcons("p1", { sourceProjectId: "p2", iconIds: ["i1", "i2"], folderId: "f1" });
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/projects/p1/icons/copy" });
    expect(sent(last(calls))).toEqual({ sourceProjectId: "p2", iconIds: ["i1", "i2"], folderId: "f1" });
  });

  it("reads, edits and optimizes one icon", async () => {
    const calls = intercept();
    await icons.getIcon("i1");
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/icons/i1" });
    await icons.updateIcon("i1", { name: "New", tags: ["a"], codepoint: null });
    expect(last(calls)).toMatchObject({ method: "patch", url: "/api/icons/i1" });
    expect(sent(last(calls))).toEqual({ name: "New", tags: ["a"], codepoint: null });
    await icons.optimizeIcon("i1");
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/icons/i1/optimize" });
  });

  it("works with versions", async () => {
    const calls = intercept(() => ({ data: { versions: [{ id: "v1", byteSize: 10, createdAt: "2026-01-01" }] } }));
    expect(await icons.listVersions("i1")).toEqual([{ id: "v1", byteSize: 10, createdAt: "2026-01-01" }]);
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/icons/i1/versions" });
    await icons.restoreVersion("i1", "v1");
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/icons/i1/versions/v1/restore" });
  });

  it("trashes, deletes permanently and restores", async () => {
    const calls = intercept();
    await icons.deleteIcon("i1");
    expect(last(calls)).toMatchObject({ method: "delete", url: "/api/icons/i1" });
    expect(last(calls).params).toBeUndefined();
    await icons.deleteIcon("i1", { permanent: true });
    expect(last(calls).params).toEqual({ permanent: true });
    await icons.restoreIcon("i1");
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/icons/i1/restore" });
    await icons.emptyTrash("p1");
    expect(last(calls)).toMatchObject({ method: "delete", url: "/api/projects/p1/icons/trash" });
  });

  it("sends batch actions to the project's own batch routes", async () => {
    const calls = intercept();
    await icons.batchMoveIcons("p1", ["a", "b"], null);
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/projects/p1/icons/batch/move" });
    expect(sent(last(calls))).toEqual({ iconIds: ["a", "b"], folderId: null });

    await icons.batchTagIcons("p1", ["a"], ["x"]);
    expect(sent(last(calls))).toEqual({ iconIds: ["a"], tags: ["x"], mode: "add" });
    await icons.batchTagIcons("p1", ["a"], ["x"], "set");
    expect(last(calls).url).toBe("/api/projects/p1/icons/batch/tag");
    expect(sent(last(calls)).mode).toBe("set");

    await icons.batchDeleteIcons("p1", ["a"]);
    expect(sent(last(calls))).toEqual({ iconIds: ["a"], permanent: false });
    await icons.batchDeleteIcons("p1", ["a"], { permanent: true });
    expect(sent(last(calls)).permanent).toBe(true);

    await icons.batchRestoreIcons("p1", ["a"]);
    expect(last(calls).url).toBe("/api/projects/p1/icons/batch/restore");
    await icons.batchOptimizeIcons("p1", ["a"]);
    expect(last(calls).url).toBe("/api/projects/p1/icons/batch/optimize");
  });

  it("downloads as a blob with the server's file name", async () => {
    const blob = new Blob(["<svg/>"]);
    const calls = intercept(() => ({ data: blob, headers: { "content-disposition": 'attachment; filename="arrow-left.svg"' } }));
    const one = await icons.downloadIcon("i1");
    expect(last(calls)).toMatchObject({ method: "get", url: "/api/icons/i1/download", responseType: "blob" });
    expect(one).toEqual({ blob, filename: "arrow-left.svg" });

    const many = await icons.downloadIcons("p1", ["a", "b"]);
    expect(last(calls)).toMatchObject({ method: "post", url: "/api/projects/p1/icons/download", responseType: "blob" });
    expect(sent(last(calls))).toEqual({ iconIds: ["a", "b"] });
    expect(many.filename).toBe("arrow-left.svg");
  });

  it("falls back to a default file name", async () => {
    intercept(() => ({ data: new Blob(["x"]) }));
    expect((await icons.downloadIcons("p1", ["a"])).filename).toBe("icons.zip");
    expect((await icons.downloadIcon("i1")).filename).toBe("icon.svg");
  });

  it("reads file names from Content-Disposition headers", () => {
    expect(icons.filenameFromDisposition('attachment; filename="icons.zip"', "x")).toBe("icons.zip");
    expect(icons.filenameFromDisposition("attachment; filename=plain.svg", "x")).toBe("plain.svg");
    expect(icons.filenameFromDisposition(undefined, "fallback.svg")).toBe("fallback.svg");
    expect(icons.filenameFromDisposition("inline", "fallback.svg")).toBe("fallback.svg");
  });
});
