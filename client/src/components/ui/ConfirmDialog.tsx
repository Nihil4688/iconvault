// Asks the user to confirm an action, usually a destructive one. The confirm button shows a spinner while the action runs and the dialog cannot be dismissed meanwhile; a failure is shown inside the dialog and nothing closes.
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import Dialog from "./Dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  size?: "sm" | "md" | "lg";
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export default function ConfirmDialog({ open, title, message, confirmLabel, destructive = false, size = "sm", onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      size={size}
      dismissOnBackdrop={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof message === "string" ? <p className="text-sm text-foreground">{message}</p> : <div className="text-sm text-foreground">{message}</div>}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}
