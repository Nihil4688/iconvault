import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/http";
import { fetchCurrentUser } from "../api/auth";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("../api/auth", () => ({
  fetchCurrentUser: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithMicrosoft: vi.fn(),
}));

function SessionStatus() {
  const { currentUser, initializing } = useAuth();
  return <div>{initializing ? "loading" : currentUser?.email ?? "signed out"}</div>;
}

function renderAuth() {
  return render(
    <AuthProvider>
      <SessionStatus />
    </AuthProvider>,
  );
}

describe("AuthProvider session rehydration", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "currentUser",
      JSON.stringify({
        id: "user-1",
        email: "user@example.com",
        displayName: "Test User",
        picture: null,
        emailVerified: true,
        provider: "google",
        role: "user",
      }),
    );
    localStorage.setItem("sessionToken", "saved-session-token");
    vi.mocked(fetchCurrentUser).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the saved session when verification fails without an HTTP status", async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValue(
      new ApiError("Could not reach the server.", null),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderAuth();
    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument(),
    );

    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(localStorage.getItem("sessionToken")).toBe("saved-session-token");
    expect(window.__svgCompilerSessionToken).toBe("saved-session-token");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not verify the saved session"),
      expect.any(ApiError),
    );
  });

  it("clears the saved session when the server rejects the token", async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValue(
      new ApiError("Session expired.", 401),
    );

    renderAuth();
    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument(),
    );

    expect(screen.getByText("signed out")).toBeInTheDocument();
    expect(localStorage.getItem("sessionToken")).toBeNull();
    expect(window.__svgCompilerSessionToken).toBeNull();
  });
});
