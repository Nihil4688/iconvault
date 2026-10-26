// Joins class names and resolves Tailwind conflicts, so a later class wins over an earlier one (cn("px-2", cond && "px-4") gives "px-4").
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
