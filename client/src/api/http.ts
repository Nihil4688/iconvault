// Shared HTTP client for the project, folder and icon APIs. Adds the signed-in user's token to every request and turns failures into ApiError with the server's own message, so screens can show it directly.
import axios, { AxiosError } from "axios";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// The AuthContext keeps the current session token here (set on sign-in, cleared on sign-out), so this module does not import the context.
declare global {
  interface Window {
    __svgCompilerSessionToken?: string | null;
  }
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly details: unknown;

  constructor(message: string, status: number | null = null, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export const http = axios.create({ baseURL: API_BASE });

http.interceptors.request.use((config) => {
  const token = window.__svgCompilerSessionToken;
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

// Blob.text() where it exists (all current browsers), FileReader otherwise.
function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// Downloads come back as Blobs, so an error body has to be read out of the Blob first.
async function readErrorBody(data: unknown): Promise<{ error?: string; details?: unknown } | null> {
  try {
    if (data instanceof Blob) return JSON.parse(await readBlobText(data));
    if (data && typeof data === "object") return data as { error?: string; details?: unknown };
  } catch {
    // not JSON
  }
  return null;
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (error instanceof AxiosError) {
      if (error.response) {
        const body = await readErrorBody(error.response.data);
        throw new ApiError(body?.error ?? `The server answered ${error.response.status}.`, error.response.status, body?.details);
      }
      throw new ApiError("Could not reach the server. Check your connection and try again.");
    }
    throw error;
  },
);
