import { open, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { isIP } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_URL = "http://localhost:5000";
const MAX_SVG_BYTES = 1_000_000;
const OBJECT_ID = z.string().regex(/^[a-f\d]{24}$/i, "must be a valid IconVault id");
const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(50);
const strategies = ["rename", "replace", "skip"];

class ToolError extends Error {}

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  if (isIP(host) === 4) return host.startsWith("127.");
  return false;
}

export function validateServerUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ToolError("ICONVAULT_URL must be a valid HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ToolError("ICONVAULT_URL must be an HTTP(S) base URL without credentials, query, or fragment.");
  }
  if (url.protocol !== "https:" && !isLoopback(url.hostname)) {
    throw new ToolError("Remote IconVault servers must use HTTPS. HTTP is allowed only for a loopback server.");
  }
  return url.href.replace(/\/+$/, "");
}

async function loadSettings({ env, home, token: tokenOverride, url: urlOverride }) {
  const configPath = env.ICONVAULT_CONFIG || path.join(home, ".config", "iconvault", "config.json");
  let saved = {};
  if (tokenOverride === undefined || urlOverride === undefined) {
    try {
      saved = JSON.parse(await readFile(configPath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        if (error instanceof SyntaxError) throw new ToolError("The saved IconVault CLI config is not valid JSON.");
        throw new ToolError("Could not read the saved IconVault CLI config.");
      }
    }
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      throw new ToolError("The saved IconVault CLI config must be a JSON object.");
    }
  }

  const token = tokenOverride ?? (env.ICONVAULT_TOKEN || saved.token);
  if (typeof token !== "string" || !token.startsWith("isv_")) {
    throw new ToolError('Not signed in. Create a personal API token, then run "iconvault login" or set ICONVAULT_TOKEN.');
  }
  const rawUrl = urlOverride ?? (env.ICONVAULT_URL || saved.url || DEFAULT_URL);
  if (typeof rawUrl !== "string") throw new ToolError("ICONVAULT_URL must be a string.");
  return { url: validateServerUrl(rawUrl), token };
}

function createApiClient({ env, home, fetchImpl, token, url }) {
  let settingsPromise;
  const settings = () => (settingsPromise ??= loadSettings({ env, home, token, url }));

  function redact(value, token) {
    if (typeof value === "string") return value.split(token).join("[redacted]");
    if (Array.isArray(value)) return value.map((item) => redact(item, token));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          key.toLowerCase() === "token" ? "[redacted]" : redact(item, token),
        ]),
      );
    }
    return value;
  }

  return async function apiRequest(method, route, body) {
    const config = await settings();
    const headers = { Authorization: `Bearer ${config.token}`, Accept: "application/json" };
    const init = {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(`${config.url}${route}`, init);
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new ToolError("The IconVault API request timed out.");
      }
      throw new ToolError("Could not reach the configured IconVault server.");
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new ToolError(`The IconVault API returned an unreadable response (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      const message = result && typeof result.error === "string" ? result.error : `The IconVault API returned HTTP ${response.status}.`;
      throw new ToolError(message.split(config.token).join("[redacted]"));
    }
    return redact(result, config.token);
  };
}

function jsonResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function registerTool(server, name, description, inputSchema, handler, annotations = {}) {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: { openWorldHint: false, ...annotations },
    },
    async (input) => {
      try {
        return jsonResult(await handler(input));
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof ToolError ? error.message : "IconVault operation failed." }],
        };
      }
    },
  );
}

function queryString(values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readWorkspaceSvg(filePath, rootsValue) {
  const configuredRoots = typeof rootsValue === "string" ? rootsValue.split(path.delimiter).filter(Boolean) : [];
  if (configuredRoots.length === 0) {
    throw new ToolError("Local file access is disabled. Set ICONVAULT_ALLOWED_FILE_ROOTS to one or more trusted workspace directories.");
  }
  if (typeof filePath !== "string" || path.extname(filePath).toLowerCase() !== ".svg") {
    throw new ToolError("file_path must name an .svg file.");
  }

  let file;
  let fileInfo;
  let roots;
  try {
    [file, fileInfo, roots] = await Promise.all([
      realpath(filePath),
      stat(filePath),
      Promise.all(configuredRoots.map((root) => realpath(root))),
    ]);
  } catch {
    throw new ToolError("The SVG file or a configured workspace root does not exist or cannot be accessed.");
  }
  if (!roots.some((root) => isWithin(root, file))) {
    throw new ToolError("The SVG file must resolve inside one of the configured workspace roots.");
  }
  let handle;
  try {
    handle = await open(file, "r");
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile() || openedInfo.dev !== fileInfo.dev || openedInfo.ino !== fileInfo.ino) {
      throw new ToolError("The SVG file changed while it was being opened.");
    }
    if (openedInfo.size > MAX_SVG_BYTES) throw new ToolError("SVG files may not exceed 1 MB.");

    const bytes = Buffer.alloc(MAX_SVG_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_SVG_BYTES) throw new ToolError("SVG files may not exceed 1 MB.");
    return bytes.toString("utf8", 0, length);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("Could not read the SVG file.");
  } finally {
    await handle?.close();
  }
}

async function resolveWorkspaceDestination(filePath, rootsValue) {
  const configuredRoots = typeof rootsValue === "string" ? rootsValue.split(path.delimiter).filter(Boolean) : [];
  if (configuredRoots.length === 0) {
    throw new ToolError("Local file access is disabled. Set ICONVAULT_ALLOWED_FILE_ROOTS to one or more trusted workspace directories.");
  }
  if (typeof filePath !== "string" || path.extname(filePath).toLowerCase() !== ".svg") {
    throw new ToolError("file_path must name an .svg file.");
  }

  const absolutePath = path.resolve(filePath);
  let parent;
  let roots;
  try {
    [parent, roots] = await Promise.all([
      realpath(path.dirname(absolutePath)),
      Promise.all(configuredRoots.map((root) => realpath(root))),
    ]);
  } catch {
    throw new ToolError("The destination directory or a configured workspace root does not exist or cannot be accessed.");
  }
  const destination = path.join(parent, path.basename(absolutePath));
  if (!roots.some((root) => isWithin(root, destination))) {
    throw new ToolError("The SVG destination must resolve inside one of the configured workspace roots.");
  }
  return destination;
}

async function writeWorkspaceSvg(filePath, rootsValue, svg) {
  const destination = await resolveWorkspaceDestination(filePath, rootsValue);
  if (Buffer.byteLength(svg, "utf8") > MAX_SVG_BYTES) {
    throw new ToolError("SVG files may not exceed 1 MB.");
  }

  let handle;
  try {
    handle = await open(destination, "wx", 0o600);
    await handle.writeFile(svg, "utf8");
  } catch (error) {
    if (error?.code === "EEXIST") throw new ToolError("The destination file already exists; choose a different file_path.");
    throw new ToolError("Could not write the SVG file.");
  } finally {
    await handle?.close();
  }
  return { file_path: destination, bytes_written: Buffer.byteLength(svg, "utf8") };
}

function stripSvg(icon) {
  const { svg: _svg, ...metadata } = icon;
  return metadata;
}

export function createMcpServer(options = {}) {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const fetchImpl = options.fetchImpl ?? fetch;
  const localFiles = options.localFiles ?? true;
  const api = createApiClient({
    env,
    home,
    fetchImpl,
    token: options.apiToken,
    url: options.apiUrl,
  });
  const server = new McpServer(
    { name: "iconvault", version: "1.0.0" },
    { maxToolInputElements: 2_000 },
  );

  registerTool(
    server,
    "list_projects",
    "List projects visible to the authenticated user. Returns project IDs, names, visibility, purpose, icon counts, and access flags.",
    {
      search: z.string().trim().max(100).optional(),
      purpose: z.enum(["sprite", "font"]).optional(),
      limit: z.number().int().min(1).max(1000).default(100),
    },
    async ({ search, purpose, limit }) => {
      const projects = [];
      let total = 0;
      for (let page = 1; page <= 10; page += 1) {
        const query = queryString({ status: "all", search, purpose, page, limit: 100 });
        const result = await api("GET", `/api/projects?${query}`);
        projects.push(...(result.projects ?? []));
        total = result.total ?? projects.length;
        if (projects.length >= total || projects.length >= limit) break;
      }
      return { projects: projects.slice(0, limit), total, returned: Math.min(projects.length, limit) };
    },
    { readOnlyHint: true },
  );

  registerTool(
    server,
    "create_project",
    "Create a project owned by the authenticated user. Purpose is fixed after creation; project names, visibility, prefix, and other settings remain editable through update_project.",
    {
      name: z.string().trim().min(1).max(100),
      description: z.string().trim().max(500).optional(),
      prefix: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,20}$/).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      purpose: z.enum(["sprite", "font"]).optional(),
      visibility: z.enum(["public", "private"]).optional(),
    },
    ({ name, description, prefix, color, purpose, visibility }) => {
      const body = { name };
      if (description !== undefined) body.description = description;
      if (prefix !== undefined) body.prefix = prefix;
      if (color !== undefined) body.color = color;
      if (purpose !== undefined) body.purpose = purpose;
      if (visibility !== undefined) body.visibility = visibility;
      return api("POST", "/api/projects", body);
    },
    { destructiveHint: false },
  );

  registerTool(
    server,
    "get_project",
    "Get a visible project's full settings, icon and trash counts, owner, and access flags.",
    { project_id: OBJECT_ID },
    ({ project_id }) => api("GET", `/api/projects/${project_id}`),
    { readOnlyHint: true },
  );

  registerTool(
    server,
    "update_project",
    "Update a project you own or administer. Use name to rename it. Include only fields to change; purpose cannot be changed after creation.",
    {
      project_id: OBJECT_ID,
      name: z.string().trim().min(1).max(100).optional(),
      description: z.string().trim().max(500).optional(),
      prefix: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,20}$/).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      visibility: z.enum(["public", "private"]).optional(),
      is_archived: z.boolean().optional(),
      uncategorized_name: z.string().trim().max(40).optional(),
    },
    async ({ project_id, name, description, prefix, color, visibility, is_archived, uncategorized_name }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (prefix !== undefined) body.prefix = prefix;
      if (color !== undefined) body.color = color;
      if (visibility !== undefined) body.visibility = visibility;
      if (is_archived !== undefined) body.isArchived = is_archived;
      if (uncategorized_name !== undefined) body.uncategorizedName = uncategorized_name;
      if (Object.keys(body).length === 0) throw new ToolError("Provide at least one field to update.");
      return api("PATCH", `/api/projects/${project_id}`, body);
    },
    { destructiveHint: false },
  );

  registerTool(
    server,
    "list_folders",
    "List folders in a project the authenticated user can view, including folder IDs, parent IDs, and icon counts.",
    { project_id: OBJECT_ID },
    ({ project_id }) => api("GET", `/api/projects/${project_id}/folders`),
    { readOnlyHint: true },
  );

  registerTool(
    server,
    "create_folder",
    "Create a folder in a project you can edit. parent_id may be null for a top-level folder.",
    {
      project_id: OBJECT_ID,
      name: z.string().trim().min(1).max(100),
      parent_id: OBJECT_ID.nullable().optional(),
    },
    ({ project_id, name, parent_id }) =>
      api("POST", `/api/projects/${project_id}/folders`, { name, parentId: parent_id ?? null }),
    { destructiveHint: false },
  );

  registerTool(
    server,
    "rename_folder",
    "Rename a folder in a project you can edit.",
    {
      folder_id: OBJECT_ID,
      name: z.string().trim().min(1).max(100),
    },
    ({ folder_id, name }) => api("PATCH", `/api/folders/${folder_id}`, { name }),
    { destructiveHint: false },
  );

  registerTool(
    server,
    "move_folder",
    "Move a folder in a project you can edit. parent_id may be null to move it to the project root; the API prevents moving a folder into itself or one of its descendants.",
    {
      folder_id: OBJECT_ID,
      parent_id: OBJECT_ID.nullable(),
      order_index: z.number().int().min(0).optional(),
    },
    ({ folder_id, parent_id, order_index }) =>
      api("POST", `/api/folders/${folder_id}/move`, {
        parentId: parent_id,
        ...(order_index === undefined ? {} : { orderIndex: order_index }),
      }),
    { destructiveHint: false },
  );

  registerTool(
    server,
    "delete_folder",
    "Delete a folder and its subfolders. Icons inside are moved to the project's trash and can be restored.",
    { folder_id: OBJECT_ID },
    ({ folder_id }) => api("DELETE", `/api/folders/${folder_id}`),
    { destructiveHint: true },
  );

  registerTool(
    server,
    "search_icons",
    "Search visible icons by name, slug, or tag. Supply project_id to search one project with exact folder/tag/trash filters and optional subfolders; otherwise query is required and project/folder/name/tag filters refine the API's paginated cross-project results. Cross-project search returns active icons only.",
    {
      query: z.string().trim().min(1).max(100).optional(),
      project_id: OBJECT_ID.optional(),
      folder_id: z.union([OBJECT_ID, z.literal("root")]).optional(),
      name: z.string().trim().min(1).max(100).optional(),
      tag: z.string().trim().min(1).max(40).optional(),
      include_subfolders: z.boolean().default(false),
      trash: z.boolean().default(false),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
    },
    async ({ query, project_id, folder_id, name, tag, include_subfolders, trash, page, limit }) => {
      if (project_id) {
        const params = queryString({
          folderId: folder_id,
          includeSubfolders: include_subfolders,
          search: query ?? name,
          tag,
          trash,
          page,
          limit,
          svg: false,
        });
        const result = await api("GET", `/api/projects/${project_id}/icons?${params}`);
        const icons = (result.icons ?? []).filter((icon) => !name || icon.name.toLowerCase().includes(name.toLowerCase()));
        return { ...result, icons, returned: icons.length };
      }
      if (!query && !name) throw new ToolError("Provide query or name for a cross-project search.");
      if (trash) throw new ToolError("Trash search requires project_id because cross-project search excludes trashed icons.");
      if (include_subfolders) throw new ToolError("include_subfolders requires project_id.");
      const q = encodeURIComponent(query ?? name);
      const result = await api("GET", `/api/icons/search?q=${q}&page=${page}&limit=100`);
      const icons = (result.icons ?? [])
        .filter((icon) => !name || icon.name.toLowerCase().includes(name.toLowerCase()))
        .filter((icon) => !project_id || icon.projectId === project_id)
        .filter((icon) => !folder_id || icon.folderId === (folder_id === "root" ? null : folder_id))
        .filter((icon) => !tag || icon.tags?.some((value) => value.toLowerCase() === tag.toLowerCase()))
        .slice(0, limit)
        .map(stripSvg);
      return {
        icons,
        sourceTotal: result.total,
        page,
        limit,
        filtersAppliedAfterSearch: Boolean(name || project_id || folder_id || tag),
      };
    },
    { readOnlyHint: true },
  );

  registerTool(
    server,
    "get_icon",
    "Get one visible icon's metadata and sanitized SVG, plus its project and folder context. A missing or inaccessible icon is reported by the API as not found.",
    { icon_id: OBJECT_ID },
    async ({ icon_id }) => {
      const icon = await api("GET", `/api/icons/${icon_id}`);
      const [project, folderResult] = await Promise.all([
        api("GET", `/api/projects/${icon.projectId}`),
        api("GET", `/api/projects/${icon.projectId}/folders`),
      ]);
      const folder = icon.folderId ? folderResult.folders?.find((item) => item.id === icon.folderId) ?? null : null;
      return { ...icon, project: { id: project.id, name: project.name }, folder: folder ? { id: folder.id, name: folder.name, parentId: folder.parentId } : null };
    },
    { readOnlyHint: true },
  );

  if (localFiles) {
    registerTool(
      server,
      "download_icon",
      "Download one visible icon's sanitized SVG to a local .svg file. The destination must be inside ICONVAULT_ALLOWED_FILE_ROOTS; existing files are never overwritten.",
      {
        icon_id: OBJECT_ID,
        file_path: z.string().trim().min(1).max(4096),
      },
      async ({ icon_id, file_path }) => {
        const destination = await resolveWorkspaceDestination(file_path, env.ICONVAULT_ALLOWED_FILE_ROOTS);
        const icon = await api("GET", `/api/icons/${icon_id}`);
        if (typeof icon.svg !== "string") throw new ToolError("The IconVault API did not return SVG content for this icon.");
        const saved = await writeWorkspaceSvg(destination, env.ICONVAULT_ALLOWED_FILE_ROOTS, icon.svg);
        return { ...stripSvg(icon), ...saved };
      },
    );
  }

  registerTool(
    server,
    "add_icon",
    localFiles
      ? "Add one SVG to a project the authenticated user can edit. Provide exactly one of raw_svg or file_path. Local files are read only inside ICONVAULT_ALLOWED_FILE_ROOTS. IconVault validates and sanitizes SVG and applies its 1 MB limit; duplicate names use strategy (default rename)."
      : "Add one SVG from raw_svg to a project the authenticated user can edit. IconVault validates and sanitizes SVG and applies its 1 MB limit; duplicate names use strategy (default rename).",
    {
      project_id: OBJECT_ID,
      raw_svg: z.string().min(1).max(MAX_SVG_BYTES).optional(),
      ...(localFiles ? { file_path: z.string().min(1).optional() } : {}),
      name: z.string().trim().min(1).max(100).optional(),
      folder_id: OBJECT_ID.nullable().optional(),
      tags: tagsSchema.optional(),
      strategy: z.enum(strategies).default("rename"),
      optimize: z.boolean().default(true),
    },
    async ({ project_id, raw_svg, file_path, name, folder_id, tags, strategy, optimize }) => {
      if (localFiles && (raw_svg === undefined) === (file_path === undefined)) {
        throw new ToolError("Provide exactly one of raw_svg or file_path.");
      }
      if (!localFiles && raw_svg === undefined) {
        throw new ToolError("Provide raw_svg; local file access is unavailable on the hosted MCP server.");
      }
      const svg = raw_svg ?? (await readWorkspaceSvg(file_path, env.ICONVAULT_ALLOWED_FILE_ROOTS));
      if (Buffer.byteLength(svg, "utf8") > MAX_SVG_BYTES) throw new ToolError("SVG content may not exceed 1 MB.");
      const iconName = name ?? (file_path ? path.basename(file_path, path.extname(file_path)) : "Pasted icon");
      return api("POST", `/api/projects/${project_id}/icons/paste`, {
        rawSvg: svg,
        name: iconName,
        folderId: folder_id ?? null,
        tags: tags ?? [],
        strategy,
        optimize,
      });
    },
    { destructiveHint: false },
  );

  registerTool(
    server,
    "update_icon",
    "Update an active icon's name, folder, tags, or SVG. Include only fields to change; folder_id may be null for the project root. SVG content is revalidated and sanitized by IconVault, and earlier SVG versions are retained by the API.",
    {
      icon_id: OBJECT_ID,
      name: z.string().trim().min(1).max(100).optional(),
      folder_id: OBJECT_ID.nullable().optional(),
      tags: tagsSchema.optional(),
      raw_svg: z.string().min(1).max(MAX_SVG_BYTES).optional(),
    },
    async ({ icon_id, name, folder_id, tags, raw_svg }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (folder_id !== undefined) body.folderId = folder_id;
      if (tags !== undefined) body.tags = tags;
      if (raw_svg !== undefined) {
        if (Buffer.byteLength(raw_svg, "utf8") > MAX_SVG_BYTES) throw new ToolError("SVG content may not exceed 1 MB.");
        body.rawSvg = raw_svg;
      }
      if (Object.keys(body).length === 0) throw new ToolError("Provide at least one field to update.");
      return api("PATCH", `/api/icons/${icon_id}`, body);
    },
    { destructiveHint: false },
  );

  registerTool(
    server,
    "move_icons",
    "Move one or more active icons to a folder or the root of the SAME project. This does not move icons across projects; use copy_icons for cross-project copies. The destination folder must belong to project_id.",
    {
      project_id: OBJECT_ID,
      icon_ids: z.array(OBJECT_ID).min(1).max(500),
      folder_id: OBJECT_ID.nullable(),
    },
    ({ project_id, icon_ids, folder_id }) =>
      api("POST", `/api/projects/${project_id}/icons/batch/move`, { iconIds: icon_ids, folderId: folder_id }),
    { destructiveHint: false },
  );

  registerTool(
    server,
    "copy_icons",
    "Copy active icons from a project the user can view into a project they can edit. This creates copies and does not remove the originals. Optional folder_id is in target_project_id; duplicate names follow strategy.",
    {
      source_project_id: OBJECT_ID,
      target_project_id: OBJECT_ID,
      icon_ids: z.array(OBJECT_ID).min(1).max(500),
      folder_id: OBJECT_ID.nullable().optional(),
      strategy: z.enum(strategies).default("rename"),
      optimize: z.boolean().default(false),
    },
    ({ source_project_id, target_project_id, icon_ids, folder_id, strategy, optimize }) =>
      api("POST", `/api/projects/${target_project_id}/icons/copy`, {
        sourceProjectId: source_project_id,
        iconIds: icon_ids,
        folderId: folder_id ?? null,
        strategy,
        optimize,
      }),
    { destructiveHint: false },
  );

  registerTool(
    server,
    "trash_icon",
    "Move one icon to its project's trash. This is reversible and does not permanently delete data. Permanent deletion and emptying trash are intentionally not exposed through MCP.",
    { icon_id: OBJECT_ID },
    ({ icon_id }) => api("DELETE", `/api/icons/${icon_id}`),
    { destructiveHint: true, idempotentHint: true },
  );

  registerTool(
    server,
    "restore_icon",
    "Restore one icon from its project's trash. If its previous name or folder conflicts, IconVault may adjust the restored icon; the API reports those adjustments.",
    { icon_id: OBJECT_ID },
    ({ icon_id }) => api("POST", `/api/icons/${icon_id}/restore`, {}),
    { destructiveHint: false, idempotentHint: true },
  );

  return server;
}

export async function runMcpServer() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
