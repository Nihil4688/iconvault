// The row of buttons at the bottom of a form inside a Dialog. Stays visible at the bottom when the form scrolls.
import type { ReactNode } from "react";

export default function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 -mb-4 mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">{children}</div>;
}
