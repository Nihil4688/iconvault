// Tests for the API tokens screen: listing, creating (the secret is shown once and can be copied), limits, revoking, and failures.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/http";
import * as tokensApi from "../api/tokens";
import type { ApiTokenItem } from "../api/types";
import { ToastProvider } from "../context/ToastContext";
import * as clipboard from "../lib/clipboard";
import * as sessionToken from "../lib/sessionToken";
import AccountTokensPage from "./AccountTokensPage";

vi.mock("../api/tokens");
vi.mock("../lib/clipboard");
vi.mock("../lib/sessionToken");

const listTokens = vi.mocked(tokensApi.listTokens);
const token = (over: Partial<ApiTokenItem> = {}): ApiTokenItem => ({ id: "t1", name: "CI server", prefix: "isv_AbCd", scope: "read", expiresAt: null, createdAt: "2026-10-01T10:00:00.000Z", lastUsedAt: null, revokedAt: null, ...over });
const SECRET = "isv_SECRETSECRETSECRETSECRETSECRETSECRETSECRET1";

function renderPage() {
  return render(
    <ToastProvider>
      <AccountTokensPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(clipboard.copyText).mockResolvedValue(true);
  listTokens.mockResolvedValue({ tokens: [token(), token({ id: "t2", name: "Old laptop", prefix: "isv_ZzZz", lastUsedAt: new Date().toISOString(), revokedAt: "2026-10-10T10:00:00.000Z" })], maxActive: 10 });
});

describe("listing", () => {
  it("shows each token with its prefix, state and use, never a secret", async () => {
    renderPage();
    expect(screen.getByLabelText("Loading tokens")).toHaveAttribute("aria-busy", "true");
    const active = (await screen.findByText("CI server")).closest("li") as HTMLElement;
    expect(within(active).getByText(/isv_AbCd…/)).toBeInTheDocument();
    expect(within(active).getByText(/never used/)).toBeInTheDocument();
    expect(within(active).getByRole("button", { name: "Revoke CI server" })).toBeInTheDocument();
    const revoked = screen.getByText("Old laptop").closest("li") as HTMLElement;
    expect(within(revoked).getByText("Revoked")).toBeInTheDocument();
    expect(within(revoked).queryByRole("button", { name: /Revoke/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 of 10 active tokens in use")).toBeInTheDocument();
  });

  it("invites creating the first token", async () => {
    listTokens.mockResolvedValue({ tokens: [], maxActive: 10 });
    renderPage();
    expect(await screen.findByText("No tokens yet.")).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    listTokens.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("CI server")).toBeInTheDocument();
  });

  it("stops offering new tokens at the limit", async () => {
    listTokens.mockResolvedValue({ tokens: [token(), token({ id: "t9", name: "Second" })], maxActive: 2 });
    renderPage();
    await screen.findByText("Second");
    expect(screen.getByRole("button", { name: "New token" })).toBeDisabled();
  });
});

describe("creating", () => {
  async function createOne(name = "Build box") {
    vi.mocked(tokensApi.createToken).mockResolvedValue({ ...token({ id: "t3", name }), token: SECRET });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "New token" }));
    const dialog = screen.getByRole("dialog", { name: "New API token" });
    await userEvent.type(within(dialog).getByLabelText("Name"), name);
    await userEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
  }

  it("shows the secret once, lets you copy it, and reloads the list", async () => {
    await createOne();
    expect(tokensApi.createToken).toHaveBeenCalledWith("Build box", "read", 90);
    const dialog = await screen.findByRole("dialog", { name: "Copy your new token" });
    expect(within(dialog).getByLabelText("Your new token")).toHaveValue(SECRET);
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(clipboard.copyText).toHaveBeenCalledWith(SECRET);
    expect(await screen.findByText("Copied the token.")).toBeInTheDocument();
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
    await userEvent.click(within(dialog).getByRole("button", { name: "I have copied it" }));
    expect(screen.queryByDisplayValue(SECRET)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("needs a name and shows a server refusal inside the dialog", async () => {
    vi.mocked(tokensApi.createToken).mockRejectedValue(new ApiError("You can have 10 active tokens at most. Revoke one first.", 409));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "New token" }));
    const dialog = screen.getByRole("dialog", { name: "New API token" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a name");
    expect(tokensApi.createToken).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText("Name"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    expect(await within(dialog).findByText(/10 active tokens at most/)).toBeInTheDocument();
  });
});

describe("access and expiry", () => {
  it("creates a read and write token that never expires when asked", async () => {
    vi.mocked(tokensApi.createToken).mockResolvedValue({ ...token({ id: "t3", name: "Deploy" }), token: SECRET });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "New token" }));
    const dialog = screen.getByRole("dialog", { name: "New API token" });
    expect(within(dialog).getByLabelText("Access")).toHaveValue("read");
    expect(within(dialog).getByLabelText("Expires after")).toHaveValue("90");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Deploy");
    await userEvent.selectOptions(within(dialog).getByLabelText("Access"), "write");
    await userEvent.selectOptions(within(dialog).getByLabelText("Expires after"), "never");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    await waitFor(() => expect(tokensApi.createToken).toHaveBeenCalledWith("Deploy", "write", null));
  });

  it("shows each token's access and when it expires", async () => {
    listTokens.mockResolvedValue({
      tokens: [
        token({ id: "a", name: "Reader", scope: "read", expiresAt: "2099-01-01T00:00:00.000Z" }),
        token({ id: "b", name: "Writer", scope: "write", expiresAt: null }),
        token({ id: "c", name: "Stale", scope: "read", expiresAt: "2020-01-01T00:00:00.000Z" }),
      ],
      maxActive: 10,
    });
    renderPage();
    const reader = (await screen.findByText("Reader")).closest("li") as HTMLElement;
    expect(within(reader).getByText("Read-only")).toBeInTheDocument();
    expect(within(reader).getByText(/expires/)).toBeInTheDocument();
    const writer = screen.getByText("Writer").closest("li") as HTMLElement;
    expect(within(writer).getByText("Read and write")).toBeInTheDocument();
    expect(within(writer).getByText(/never expires/)).toBeInTheDocument();
    const stale = screen.getByText("Stale").closest("li") as HTMLElement;
    expect(within(stale).getByText("Expired")).toBeInTheDocument();
  });
});

describe("sign out everywhere", () => {
  it("asks first, then signs the other devices out and keeps this one on the new token", async () => {
    vi.mocked(tokensApi.signOutEverywhere).mockResolvedValue("fresh-session-token");
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all other devices" }));
    const dialog = screen.getByRole("dialog", { name: "Sign out of all other devices?" });
    expect(tokensApi.signOutEverywhere).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign out other devices" }));
    expect(tokensApi.signOutEverywhere).toHaveBeenCalledTimes(1);
    expect(sessionToken.replaceSessionToken).toHaveBeenCalledWith("fresh-session-token");
    expect(await screen.findByText("Signed out of all other devices.")).toBeInTheDocument();
  });
});

describe("revoking", () => {
  it("asks first, then revokes and reloads", async () => {
    vi.mocked(tokensApi.revokeToken).mockResolvedValue(token({ revokedAt: new Date().toISOString() }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Revoke CI server" }));
    const dialog = screen.getByRole("dialog", { name: "Revoke “CI server”?" });
    expect(tokensApi.revokeToken).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Revoke token" }));
    expect(tokensApi.revokeToken).toHaveBeenCalledWith("t1");
    expect(await screen.findByText("Revoked “CI server”.")).toBeInTheDocument();
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
  });

  it("keeps the dialog open with the reason when revoking fails", async () => {
    vi.mocked(tokensApi.revokeToken).mockRejectedValue(new ApiError("Token not found.", 404));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Revoke CI server" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke token" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Token not found.");
  });
});
