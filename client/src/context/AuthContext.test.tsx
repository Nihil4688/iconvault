import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/http";
import { fetchCurrentUser, loginWithGoogle as loginWithGoogleApi } from "../api/auth";
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

function GoogleLoginTrigger() {
  const { loginWithGoogle } = useAuth();
  const [result, setResult] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void loginWithGoogle().then(
            () => setResult("signed in"),
            (error: Error) => setResult(error.message),
          );
        }}
      >
        Start Google sign-in
      </button>
      <div role="status">{result}</div>
    </>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <SessionStatus />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
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
    vi.useRealTimers();
    window.google = undefined;
    window.GOOGLE_CLIENT_ID = undefined;
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

  it("allows another Google sign-in after the popup is closed", async () => {
    vi.useFakeTimers();
    localStorage.clear();
    window.GOOGLE_CLIENT_ID = "google-client-id";
    let activeCallback:
      | ((response: { credential?: string; select_by?: string }) => void)
      | undefined;
    let buttonClickCount = 0;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((config) => {
            activeCallback = config.callback;
          }),
          prompt: vi.fn(),
          renderButton: vi.fn((parent) => {
            const callbackForButton = activeCallback;
            const button = document.createElement("div");
            button.setAttribute("role", "button");
            button.addEventListener("click", () => {
              buttonClickCount += 1;
              if (buttonClickCount === 2) {
                callbackForButton?.({ credential: "google-id-token" });
              }
            });
            parent.appendChild(button);
          }),
          disableAutoSelect: vi.fn(),
          revoke: vi.fn(),
        },
      },
    };
    vi.mocked(loginWithGoogleApi).mockResolvedValue({
      user: {
        id: "google-user",
        email: "google@example.com",
        displayName: "Google User",
        picture: null,
        emailVerified: true,
        provider: "google",
        role: "user",
      },
      token: "google-session-token",
    });
    const view = render(
      <AuthProvider>
        <GoogleLoginTrigger />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Google sign-in" }));
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Google sign-in was cancelled.",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Google sign-in" }));
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("signed in");
    expect(window.google.accounts.id.renderButton).toHaveBeenCalledTimes(2);

    view.unmount();
  });
});
