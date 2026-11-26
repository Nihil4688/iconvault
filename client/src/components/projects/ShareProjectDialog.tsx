// Shares a project: shows its address in a read-only field and copies it. It also says who can open the link, since a private or draft project only opens for its owner (and admins).
import { Check, Copy, Globe, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "../../api/types";
import { copyText } from "../../lib/clipboard";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import { TextField } from "../ui/Fields";

type ShareProjectDialogProps = {
  open: boolean;
  project: ProjectSummary | null;
  onClose: () => void;
};

export default function ShareProjectDialog({ open, project, onClose }: ShareProjectDialogProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const link = project ? `${window.location.origin}/projects/${project.id}` : "";
  const sharedWithOthers = project?.visibility === "public" && !project.isArchived;

  function close() {
    window.clearTimeout(timer.current);
    setCopied(false);
    setFailed(false);
    onClose();
  }

  async function copyLink() {
    const ok = await copyText(link);
    setCopied(ok);
    setFailed(!ok);
    window.clearTimeout(timer.current);
    if (ok) timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Share “${project?.name ?? ""}”`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={copyLink}
            icon={copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
          >
            {copied ? "Copied" : "Copy Link"}
          </Button>
        </>
      }
    >
      <TextField label="Project Link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} className="truncate" />
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        {sharedWithOthers ? (
          <>
            <Globe aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
            Anyone signed in to IconVault can open this link.
          </>
        ) : (
          <>
            <Lock aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
            {project?.visibility === "public"
              ? "This project is a draft, so only its owner can open this link. Mark it as active to share it with others."
              : "This project is private, so only its owner can open this link. Make it public to share it with others."}
          </>
        )}
      </p>
      <p role="status" aria-live="polite" className={failed ? "mt-3 text-sm font-medium text-destructive" : "sr-only"}>
        {failed ? "Could not copy to the clipboard. Select the link and copy it yourself." : copied ? "Link copied to the clipboard." : ""}
      </p>
    </Dialog>
  );
}
