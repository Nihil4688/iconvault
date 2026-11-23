import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginModal from "./LoginModal";

const auth = vi.hoisted(() => ({
  loginWithGoogle: vi.fn(),
  loginWithMicrosoft: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => auth,
}));

describe("LoginModal popup cancellation", () => {
  beforeEach(() => {
    auth.loginWithGoogle.mockReset();
    auth.loginWithMicrosoft.mockReset();
  });

  it.each([
    ["Google", "Sign in with Google", "loginWithGoogle"],
    ["Microsoft", "Sign in with Microsoft", "loginWithMicrosoft"],
  ] as const)(
    "returns to the provider choices when %s sign-in is cancelled",
    async (provider, buttonName, loginMethod) => {
      auth[loginMethod].mockRejectedValue(
        new Error(`${provider} sign-in was cancelled.`),
      );
      render(<LoginModal isOpen onClose={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: buttonName }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: buttonName }),
        ).toBeEnabled();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );
});
