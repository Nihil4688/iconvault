// Modal dialog built on the browser's native <dialog> element, which supplies the parts that are hard to get right by hand: the page behind becomes inert, focus stays inside, and focus returns to the opener on close. Escape closes it, and so does a click on the dimmed backdrop (unless dismissOnBackdrop is false). The content is only mounted while the dialog is open.
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { IconButton } from "./Button";
import { DIALOG_FOOTER_CLASS } from "./DialogFooter";
import { DialogFooterContext } from "./DialogFooterContext";

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" } as const;

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: keyof typeof SIZES;
  // "drawer" docks the panel to the right edge at full height instead of centering it.
  placement?: "center" | "drawer";
  dismissOnBackdrop?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

export default function Dialog({ open, onClose, title, description, size = "md", placement = "center", dismissOnBackdrop = true, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [layout, setLayout] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus runs while the dialog is still closed, so it does nothing here and the browser would focus the Close button. Put the cursor in the first text field instead, when there is one.
      dialog.querySelector<HTMLElement>("input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=password], textarea")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape: let the owner decide, so a busy dialog can refuse to close.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // The dialog element itself is only the target when the backdrop is clicked.
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "overflow-hidden border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        placement === "drawer"
          ? "m-0 ml-auto h-dvh max-h-none w-full max-w-xl rounded-l-2xl"
          : cn("m-auto w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] rounded-2xl sm:w-[calc(100vw-2rem)] sm:max-h-[calc(100dvh-2rem)]", SIZES[size]),
      )}
    >
      {open && (
        <div
          ref={setLayout}
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            placement === "drawer" ? "h-dvh" : "max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]",
          )}
        >
          <DialogFooterContext.Provider value={{ layout, content }}>
            <header data-slot="dialog-header" className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 shrink-0">
                <X aria-hidden="true" className="h-5 w-5" />
              </IconButton>
            </header>
            <section ref={setContent} data-slot="dialog-content" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </section>
            {footer && <footer data-slot="dialog-footer" className={DIALOG_FOOTER_CLASS}>{footer}</footer>}
          </DialogFooterContext.Provider>
        </div>
      )}
    </dialog>
  );
}
