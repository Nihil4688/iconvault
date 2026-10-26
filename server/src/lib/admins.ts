// Admin allowlist. ADMIN_EMAILS (comma-separated) in server/.env decides who is an admin. It is read on every call and never stored, so the role always reflects the current setting.

export type Role = "admin" | "user";

export type AdminCandidate = {
  email: string;
  emailVerified?: boolean | null | undefined;
  provider?: string | undefined;
};

// Tenant ids that accept any Microsoft account; an email claim from those is not trustworthy for granting admin.
const SHARED_TENANTS = new Set(["common", "organizations", "consumers"]);

// Parses ADMIN_EMAILS into a lower-cased set, ignoring blanks and spaces.
export function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

// True when the Microsoft app is locked to one organization's tenant, whose directory controls the email claim.
function isSingleTenantMicrosoft(): boolean {
  const tenant = (process.env.MS_TENANT_ID ?? "").trim().toLowerCase();
  return tenant !== "" && !SHARED_TENANTS.has(tenant);
}

// An email on the list is only trusted if the provider verified it, or if it came through a single-tenant Microsoft sign-in.
export function isAdminUser(user: AdminCandidate | null | undefined): boolean {
  if (!user || typeof user.email !== "string") return false;
  if (!getAdminEmails().has(user.email.trim().toLowerCase())) return false;
  if (user.emailVerified === true) return true;
  return user.provider === "microsoft" && isSingleTenantMicrosoft();
}

export function roleFor(user: AdminCandidate | null | undefined): Role {
  return isAdminUser(user) ? "admin" : "user";
}

// Logs a warning at startup when nobody can be an admin, so a missing setting is noticed.
export function warnIfNoAdmins(): void {
  if (getAdminEmails().size === 0) {
    console.warn(
      "[admin] ADMIN_EMAILS is empty: nobody has admin rights. Set it in server/.env (comma-separated emails).",
    );
  }
}
