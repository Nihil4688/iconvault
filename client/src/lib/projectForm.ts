// Rules and defaults for the create and edit project form.

// Accent colours offered when creating a project (name, #rrggbb).
export const PROJECT_COLORS: Array<{ name: string; value: string }> = [
  { name: "Blue", value: "#2563eb" },
  { name: "Emerald", value: "#047857" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Amber", value: "#b45309" },
  { name: "Red", value: "#dc2626" },
  { name: "Pink", value: "#be185d" },
  { name: "Cyan", value: "#0e7490" },
  { name: "Slate", value: "#475569" },
];

export const PREFIX_PATTERN = /^[a-z0-9_-]{1,20}$/;

// "Feather Core Icons" -> "feather-co" (up to 10 characters), "icon" when nothing usable is left.
export function suggestPrefix(name: string): string {
  const prefix = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10)
    .replace(/-+$/g, "");
  return prefix || "icon";
}

export type ProjectFormErrors = { name?: string; prefix?: string };

export function validateProjectForm(values: { name: string; prefix: string }): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = "Enter a name.";
  else if (name.length > 100) errors.name = "Use 100 characters or fewer.";
  if (!PREFIX_PATTERN.test(values.prefix.trim().toLowerCase())) errors.prefix = "Use 1 to 20 lowercase letters, digits, - or _.";
  return errors;
}
