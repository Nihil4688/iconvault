import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SaveBuildVersionDialog from "./SaveBuildVersionDialog";

describe("SaveBuildVersionDialog", () => {
  it("offers a download without history or a versioned download", async () => {
    const onDownloadOnly = vi.fn();
    const onSaveVersion = vi.fn();
    render(
      <SaveBuildVersionDialog
        open
        kind="font"
        iconCount={3}
        busyAction={null}
        onDownloadOnly={onDownloadOnly}
        onSaveVersion={onSaveVersion}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Save this font build as a version?" })).toBeInTheDocument();
    expect(screen.getByText("This build contains 3 selected icons.")).toBeInTheDocument();

    const footer = screen.getByRole("dialog").querySelector('[data-slot="dialog-footer"]');
    const buttonRows = footer?.firstElementChild;
    expect(buttonRows).toHaveClass("w-full");
    expect(buttonRows?.firstElementChild).toHaveClass("grid-cols-2");
    expect(buttonRows?.lastElementChild).toHaveClass("text-primary");

    await userEvent.click(screen.getByRole("button", { name: "Download only" }));
    expect(onDownloadOnly).toHaveBeenCalledOnce();
    expect(onSaveVersion).not.toHaveBeenCalled();
  });

  it("starts a versioned download when requested", async () => {
    const onSaveVersion = vi.fn();
    render(
      <SaveBuildVersionDialog
        open
        kind="sprite"
        iconCount={1}
        busyAction={null}
        onDownloadOnly={() => undefined}
        onSaveVersion={onSaveVersion}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("This build contains 1 selected icon.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save version & download" }));
    expect(onSaveVersion).toHaveBeenCalledOnce();
  });
});
