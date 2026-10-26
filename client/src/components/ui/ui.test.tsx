// Tests for the shared interface pieces: Button, Dialog, ConfirmDialog, ActionMenu and SvgPreview.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import ActionMenu from "./ActionMenu";
import { Button, IconButton } from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import Dialog from "./Dialog";
import SvgPreview from "./SvgPreview";

describe("Button", () => {
  it("shows a spinner and refuses clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is a plain button by default, so it never submits a form by accident", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("IconButton is named by its label", () => {
    render(<IconButton label="Delete icon">x</IconButton>);
    expect(screen.getByRole("button", { name: "Delete icon" })).toBeInTheDocument();
  });
});

function Harness({ dismissOnBackdrop = true }: { dismissOnBackdrop?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Rename" description="Pick a new name" dismissOnBackdrop={dismissOnBackdrop} footer={<button type="button">Save</button>}>
        <label>
          Name
          <input />
        </label>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("is not in the page until opened, then is labelled by its title and description", async () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    const dialog = screen.getByRole("dialog", { name: "Rename" });
    expect(dialog).toHaveAccessibleDescription("Pick a new name");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("puts the cursor in the first text field when it opens, so typing and Enter work at once", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("does not steal focus for a checkbox or file input", async () => {
    render(
      <Dialog open onClose={() => undefined} title="Options">
        <label>
          Optimize <input type="checkbox" />
        </label>
        <input type="file" aria-label="Pick a file" />
      </Dialog>,
    );
    expect(screen.getByLabelText("Optimize")).not.toHaveFocus();
    expect(screen.getByLabelText("Pick a file")).not.toHaveFocus();
  });

  it("closes with the Close button, Escape and a backdrop click", async () => {
    render(<Harness />);
    const open = () => userEvent.click(screen.getByRole("button", { name: "Open it" }));

    await open();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await open();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await open();
    await userEvent.click(document.querySelector("dialog") as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open on a backdrop click when told not to, but still closes with Escape", async () => {
    render(<Harness dismissOnBackdrop={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    await userEvent.click(document.querySelector("dialog") as HTMLElement);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close when the click is inside the content", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    await userEvent.click(screen.getByLabelText("Name"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  function Confirm({ onConfirm }: { onConfirm: () => Promise<void> | void }) {
    const [open, setOpen] = useState(true);
    return <>{open ? <ConfirmDialog open title="Delete project?" message="This cannot be undone." confirmLabel="Delete" destructive onConfirm={onConfirm} onClose={() => setOpen(false)} /> : <p>closed</p>}</>;
  }

  it("runs the action and closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Confirm onConfirm={onConfirm} />);
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("closed")).toBeInTheDocument();
  });

  it("shows a failure inside the dialog and stays open", async () => {
    render(<Confirm onConfirm={() => Promise.reject(new Error("Server said no."))} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server said no.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("cannot be cancelled while the action runs", async () => {
    let finish!: () => void;
    render(<Confirm onConfirm={() => new Promise<void>((resolve) => (finish = resolve))} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.getByText("closed")).toBeInTheDocument());
  });

  it("Cancel closes without running the action", async () => {
    const onConfirm = vi.fn();
    render(<Confirm onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });
});

describe("ActionMenu", () => {
  function setup() {
    const edit = vi.fn();
    const remove = vi.fn();
    const hidden = vi.fn();
    render(
      <>
        <ActionMenu
          label="Actions for Feather"
          actions={[
            { label: "Edit", onSelect: edit },
            { label: "Locked", onSelect: hidden, disabled: true },
            { label: "Delete", onSelect: remove, destructive: true },
          ]}
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    return { edit, remove, hidden };
  }

  it("opens with focus on the first action and runs the chosen one", async () => {
    const { edit } = setup();
    const trigger = screen.getByRole("button", { name: "Actions for Feather" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves with the arrow keys, wraps, skips disabled actions, and jumps with Home and End", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Feather" }));
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("closes on Escape (focus returns to the button), on an outside click and when tabbing away", async () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Actions for Feather" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.tab(); // to the next action, still inside
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.tab(); // out of the menu
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks a disabled action as disabled", async () => {
    const { hidden } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Feather" }));
    expect(screen.getByRole("menuitem", { name: "Locked" })).toBeDisabled();
    expect(hidden).not.toHaveBeenCalled();
  });
});

describe("SvgPreview", () => {
  it("lets shapes without a fill follow the text colour, so they stay visible in dark mode", () => {
    const { container } = render(<SvgPreview svg='<svg viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>' />);
    expect(container.firstElementChild).toHaveClass("fill-current", "text-foreground");
  });

  const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>';

  it("renders the markup at the given size and hides it from screen readers by default", () => {
    const { container } = render(<SvgPreview svg={svg} size={48} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.querySelector("svg path")).toBeInTheDocument();
    expect(wrapper).toHaveStyle({ width: "48px", height: "48px" });
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
  });

  it("gives each preview its own ids, so two icons with the same id cannot take each other's gradients", () => {
    const gradient = '<svg viewBox="0 0 24 24"><defs><linearGradient id="a"><stop offset="0"/></linearGradient></defs><path fill="url(#a)" d="M0 0h24v24z"/></svg>';
    const { container } = render(
      <>
        <SvgPreview svg={gradient} />
        <SvgPreview svg={gradient} />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("linearGradient")).map((el) => el.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const fills = Array.from(container.querySelectorAll("path")).map((el) => el.getAttribute("fill"));
    expect(fills).toEqual(ids.map((id) => `url(#${id})`));
  });

  it("clips and contains its content to its own box", () => {
    const { container } = render(<SvgPreview svg={svg} />);
    expect(container.firstElementChild).toHaveClass("overflow-hidden");
  });

  it("becomes an image with a name when given a label", () => {
    render(<SvgPreview svg={svg} label="Arrow left" />);
    expect(screen.getByRole("img", { name: "Arrow left" })).toBeInTheDocument();
  });
});
