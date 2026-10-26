// The spot in the middle of the top bar where a screen can put its breadcrumb (the project page shows "Dashboard / <project>" there). Provided by App; null when there is no top bar around the screen (as in most tests), and screens then show the breadcrumb themselves.
import { createContext } from "react";

export const HeaderSlotContext = createContext<HTMLElement | null>(null);
