import { useContext, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DialogFooterContext } from "./DialogFooterContext";

export const DIALOG_FOOTER_CLASS = "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3";

export default function DialogFooter({ children }: { children: ReactNode }) {
  const contextValue = useContext(DialogFooterContext);
  if (!contextValue) return null;
  const { layout, content } = contextValue;
  if (!layout) return null;

  function submitContainingForm(event: MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('button[type="submit"]')) return;

    const form = content?.querySelector("form");
    if (!form) return;

    event.preventDefault();
    form.requestSubmit();
  }

  return createPortal(
    <footer data-slot="dialog-footer" className={DIALOG_FOOTER_CLASS} onClick={submitContainingForm}>
      {children}
    </footer>,
    layout,
  );
}
