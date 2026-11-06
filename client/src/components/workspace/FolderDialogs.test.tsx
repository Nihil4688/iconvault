import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeFolder } from "../../test/fixtures";
import { MoveFolderDialog } from "./FolderDialogs";

describe("MoveFolderDialog", () => {
  it("moves a folder to the selected destination while excluding itself and descendants", async () => {
    const folders = [
      makeFolder({ id: "moving", name: "Moving" }),
      makeFolder({ id: "child", name: "Child", parentId: "moving" }),
      makeFolder({ id: "destination", name: "Destination" }),
    ];
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MoveFolderDialog open folder={folders[0] ?? null} folders={folders} onClose={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Folder: Project Root" }));
    const menu = screen.getByRole("menu", { name: "Folder" });
    expect(within(menu).queryByRole("menuitemradio", { name: "Moving" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitemradio", { name: "Child" })).not.toBeInTheDocument();
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "Destination" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Folder" }));

    expect(onSubmit).toHaveBeenCalledWith("destination");
  });

  it("keeps the project root as a valid destination", async () => {
    const folder = makeFolder({ id: "moving", name: "Moving", parentId: "destination" });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MoveFolderDialog open folder={folder} folders={[folder, makeFolder({ id: "destination", name: "Destination" })]} onClose={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Folder: Destination" }));
    await userEvent.click(within(screen.getByRole("menu", { name: "Folder" })).getByRole("menuitemradio", { name: "Project Root" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Folder" }));

    expect(onSubmit).toHaveBeenCalledWith(null);
  });
});
