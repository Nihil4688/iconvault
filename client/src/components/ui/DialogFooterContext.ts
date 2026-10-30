import { createContext } from "react";

export type DialogFooterContextValue = {
  layout: HTMLDivElement | null;
  content: HTMLElement | null;
};

export const DialogFooterContext = createContext<DialogFooterContextValue | null>(null);
