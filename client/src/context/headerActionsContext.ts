// The spot in the right of the top bar where a screen can put its main buttons (the dashboard puts New Project and Import there). Provided by App; null when there is no top bar around the screen, and screens then show the buttons themselves.
import { createContext } from "react";

export const HeaderActionsContext = createContext<HTMLElement | null>(null);
