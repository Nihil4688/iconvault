// Tests for the codepoint mapping table: what it shows, saving by Enter or leaving the box, validation before anything is sent, the server's reason shown next to the box, clearing, Escape, and the read-only and busy states.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FontCodepoint } from "../../api/types";
import CodepointTable from "./CodepointTable";

const glyphs: FontCodepoint[] = [
  { id: "a", name: "Add square", slug: "add-square", codepoint: "E701", className: "m-add-square", isNew: false },
  { id: "b", name: "Home", slug: "home", codepoint: "E002", className: "m-home", isNew: true },
];

function setup(over: Partial<React.ComponentProps<typeof CodepointTable>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCopyClass = vi.fn();
  render(<CodepointTable glyphs={glyphs} family="fam" canEdit busy={false} onSave={onSave} onCopyClass={onCopyClass} {...over} />);
  return { onSave, onCopyClass };
}
const box = (name: string) => screen.getByRole("textbox", { name: `Codepoint for ${name}` }) as HTMLInputElement;

describe("what it shows", () => {
  it("is a table with a caption and named columns, one row per glyph", () => {
    setup();
    const table = screen.getByRole("table", { name: "Stable Unicode codepoints mapping" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Preview", "Icon name", "Slug", "Assigned hex codepoint", "CSS entity", "CSS class"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("add-square")).toBeInTheDocument();
  });

  it("shows each saved value and the CSS entity that draws it", () => {
    setup();
    expect(box("Add square").value).toBe("E701");
    expect(screen.getByText("\\e701")).toBeInTheDocument();
    expect(screen.getByText("\\e002")).toBeInTheDocument();
  });

  it("shows each CSS class with a button that copies it, and marks icons that just got a character", async () => {
    const { onCopyClass } = setup();
    expect(screen.getByText("m-add-square")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy class m-home" }));
    expect(onCopyClass).toHaveBeenCalledWith("m-home");
    const homeRow = screen.getByText("m-home").closest("tr") as HTMLElement;
    expect(within(homeRow).getByText("new")).toBeInTheDocument();
    expect(within(screen.getByText("m-add-square").closest("tr") as HTMLElement).queryByText("new")).not.toBeInTheDocument();
  });

  it("keeps the scroll box positioned, so its hidden caption cannot widen a phone page", () => {
    setup();
    expect(screen.getByRole("table").parentElement).toHaveClass("relative", "overflow-x-auto");
  });

  it("shows a placeholder instead of the glyph when the preview font did not load", () => {
    setup({ family: null });
    expect(screen.getAllByText("▢")).toHaveLength(2);
  });
});

describe("changing a character", () => {
  it("saves on Enter, with the value in capitals, and shows it as saved", async () => {
    const { onSave } = setup();
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "e800{Enter}");
    expect(onSave).toHaveBeenCalledWith(glyphs[1], "E800");
    await waitFor(() => expect(box("Home")).not.toBeDisabled());
  });

  it("saves when the box is left", async () => {
    const { onSave } = setup();
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "E810");
    await userEvent.tab();
    expect(onSave).toHaveBeenCalledWith(glyphs[1], "E810");
  });

  it("does nothing when the value is unchanged, even in lower case", async () => {
    const { onSave } = setup();
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "e002{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    expect(box("Home").value).toBe("E002");
  });

  it("accepts only hex digits and at most four", async () => {
    setup();
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "xyE8-1099");
    expect(box("Home").value).toBe("E810");
  });

  it("refuses values outside E000 to F8FF or with the wrong length, without asking the server", async () => {
    const { onSave } = setup();
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "0041{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("E000 to F8FF");
    expect(box("Home")).toHaveAttribute("aria-invalid", "true");
    expect(box("Home")).toHaveAccessibleDescription(/E000 to F8FF/);
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "E8{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("exactly 4 hex digits");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the server's reason next to the box and keeps what was typed", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Codepoint E701 is already used by "Add square".'));
    render(<CodepointTable glyphs={glyphs} family="fam" canEdit busy={false} onSave={onSave} onCopyClass={vi.fn()} />);
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "E701{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent('already used by "Add square"');
    expect(box("Home").value).toBe("E701");
    await userEvent.type(box("Home"), "{Backspace}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears a character when the box is emptied", async () => {
    const { onSave } = setup();
    await userEvent.clear(box("Add square"));
    await userEvent.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledWith(glyphs[0], null);
  });

  it("goes back to the saved value on Escape", async () => {
    const { onSave } = setup();
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "E8");
    await userEvent.keyboard("{Escape}");
    expect(box("Home").value).toBe("E002");
    await userEvent.tab();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("locks the box while it saves", async () => {
    let finish: () => void = () => undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<CodepointTable glyphs={glyphs} family="fam" canEdit busy={false} onSave={onSave} onCopyClass={vi.fn()} />);
    await userEvent.clear(box("Home"));
    await userEvent.type(box("Home"), "E811{Enter}");
    expect(box("Home")).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(box("Home")).not.toBeDisabled());
  });
});

describe("who can edit", () => {
  it("shows plain values, with no boxes, to people who cannot edit", () => {
    setup({ canEdit: false });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("U+E701")).toBeInTheDocument();
    expect(screen.getByText("\\e701")).toBeInTheDocument();
  });

  it("disables the boxes while a build is running", () => {
    setup({ busy: true });
    expect(box("Home")).toBeDisabled();
    expect(box("Add square")).toBeDisabled();
  });
});
