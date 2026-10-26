// Personal API tokens for the command line and scripts: create one (the secret is shown once, with a copy button), see when each was last used, and revoke. A revoked token stops working at once.
import { Copy, KeyRound, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createToken, listTokens, revokeToken, signOutEverywhere } from "../api/tokens";
import type { ApiTokenItem, ApiTokenScope, CreatedApiToken } from "../api/types";
import { Button } from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Dialog from "../components/ui/Dialog";
import DialogFooter from "../components/ui/DialogFooter";
import { SelectField, TextField } from "../components/ui/Fields";
import Badge from "../components/ui/Badge";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { copyText } from "../lib/clipboard";
import { formatDate, formatRelative } from "../lib/format";
import { replaceSessionToken } from "../lib/sessionToken";

export default function AccountTokensPage() {
  const { showToast } = useToast();
  const tokens = useResource("api-tokens", listTokens);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [revoking, setRevoking] = useState<ApiTokenItem | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const list = tokens.data?.tokens ?? [];
  const active = list.filter((token) => !token.revokedAt).length;
  const max = tokens.data?.maxActive ?? 10;

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(57px+2rem)] outline-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">API tokens</h1>
        <Button variant="primary" icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={() => setCreating(true)} disabled={active >= max}>
          New token
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        A token lets the command line or a script act as you. A read-only token can list and download; a read and write token can also change your projects. It expires after the time you choose, never has admin rights and cannot create other tokens. Treat it like a password, and revoke it if it leaks.
      </p>

      {tokens.error && !tokens.data ? (
        <div role="alert" className="mt-4 rounded-xl border border-destructive/40 p-6 text-center">
          <p className="font-medium text-destructive">{tokens.error.message}</p>
          <Button className="mt-3" onClick={tokens.reload}>
            Try again
          </Button>
        </div>
      ) : !tokens.data ? (
        <div aria-busy="true" aria-label="Loading tokens" className="mt-4 h-32 animate-pulse rounded-xl bg-muted" />
      ) : list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <KeyRound aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-base font-semibold">No tokens yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one to use the command line.</p>
        </div>
      ) : (
        <>
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {active} of {max} active tokens in use
          </p>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {list.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {token.name}
                    {token.revokedAt ? <Badge>Revoked</Badge> : isExpired(token) ? <Badge>Expired</Badge> : null}
                    <Badge>{token.scope === "read" ? "Read-only" : "Read and write"}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{token.prefix}…</span> · created {formatDate(token.createdAt)} · {token.lastUsedAt ? `last used ${formatRelative(token.lastUsedAt)}` : "never used"} · {token.expiresAt ? `${isExpired(token) ? "expired" : "expires"} ${formatDate(token.expiresAt)}` : "never expires"}
                  </p>
                </div>
                {!token.revokedAt && (
                  <Button size="sm" variant="destructive" onClick={() => setRevoking(token)} aria-label={`Revoke ${token.name}`}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="mt-10 rounded-xl border border-border p-4">
        <h2 className="text-base font-semibold">Sign out everywhere</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ends every browser session of your account on all devices, for example after losing a laptop. This device stays signed in. API tokens are not affected; revoke them above.</p>
        <Button className="mt-3" variant="destructive" onClick={() => setSigningOut(true)}>
          Sign out of all other devices
        </Button>
      </section>

      <CreateTokenDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(token) => {
          setCreated(token);
          tokens.reload();
        }}
      />
      <ShownOnceDialog token={created} onClose={() => setCreated(null)} />
      <ConfirmDialog
        open={signingOut}
        title="Sign out of all other devices?"
        message="Every other browser session of your account ends immediately. You stay signed in here."
        confirmLabel="Sign out other devices"
        destructive
        onClose={() => setSigningOut(false)}
        onConfirm={async () => {
          replaceSessionToken(await signOutEverywhere());
          showToast("Signed out of all other devices.", "success");
        }}
      />
      <ConfirmDialog
        open={revoking !== null}
        title={`Revoke “${revoking?.name ?? ""}”?`}
        message="Anything using this token stops working immediately. This cannot be undone; you can create a new token."
        confirmLabel="Revoke token"
        destructive
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          await revokeToken(revoking.id);
          tokens.reload();
          showToast(`Revoked “${revoking.name}”.`, "success");
        }}
      />
    </main>
  );
}

function isExpired(token: ApiTokenItem): boolean {
  return token.expiresAt !== null && new Date(token.expiresAt).getTime() <= Date.now();
}

const EXPIRY_CHOICES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];

function CreateTokenDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (token: CreatedApiToken) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="New API token" size="sm">
      <CreateForm onClose={onClose} onCreated={onCreated} />
    </Dialog>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (token: CreatedApiToken) => void }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [expiry, setExpiry] = useState("90");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a name, for example the machine or script that will use it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await createToken(name.trim(), scope, expiry === "never" ? null : Number(expiry)));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField label="Name" value={name} maxLength={60} autoComplete="off" autoFocus onChange={(event) => setName(event.target.value)} hint="Helps you recognise it later, e.g. “CI server”." />
      <SelectField label="Access" value={scope} onChange={(event) => setScope(event.target.value as ApiTokenScope)} hint="Uploading and importing from the command line need read and write.">
        <option value="read">Read-only</option>
        <option value="write">Read and write</option>
      </SelectField>
      <SelectField label="Expires after" value={expiry} onChange={(event) => setExpiry(event.target.value)} hint="A token that expires limits the damage if it leaks.">
        {EXPIRY_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </SelectField>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Create token
        </Button>
      </DialogFooter>
    </form>
  );
}

// The secret is only available now; closing this dialog is the last chance to copy it.
function ShownOnceDialog({ token, onClose }: { token: CreatedApiToken | null; onClose: () => void }) {
  const { showToast } = useToast();
  return (
    <Dialog open={token !== null} onClose={onClose} title="Copy your new token" description="This is the only time it is shown." size="md">
      {token && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input readOnly aria-label="Your new token" value={token.token} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-input bg-muted px-3 py-2 font-mono text-xs" />
            <Button
              icon={<Copy aria-hidden="true" className="h-4 w-4" />}
              onClick={async () => showToast((await copyText(token.token)) ? "Copied the token." : "Could not copy. Select it and copy by hand.", "success")}
            >
              Copy
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Use it with the command line: <code className="rounded bg-muted px-1 py-0.5 text-xs">iconvault login</code> and paste it when asked, or set <code className="rounded bg-muted px-1 py-0.5 text-xs">ICONVAULT_TOKEN</code>.
          </p>
          <DialogFooter>
            <Button variant="primary" onClick={onClose}>
              I have copied it
            </Button>
          </DialogFooter>
        </div>
      )}
    </Dialog>
  );
}
