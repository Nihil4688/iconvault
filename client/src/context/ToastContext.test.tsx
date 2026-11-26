import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./ToastContext";

function ToastTrigger() {
  const { showToast } = useToast();
  return <button onClick={() => showToast("Copied token")}>Copy token</button>;
}

describe("ToastProvider", () => {
  it("renders toasts inside the open dialog so they appear above its backdrop", () => {
    render(
      <ToastProvider>
        <dialog open>
          <ToastTrigger />
        </dialog>
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy token" }));

    const dialog = document.querySelector("dialog[open]");
    expect(dialog).toContainElement(screen.getByRole("status"));
  });
});
