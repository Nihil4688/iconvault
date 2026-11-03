import { Download } from "lucide-react";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";

type SaveBuildVersionDialogProps = {
  open: boolean;
  kind: "Font" | "Sprite";
  iconCount: number;
  busyAction: "download" | "save" | null;
  onDownloadOnly: () => void;
  onSaveVersion: () => void;
  onClose: () => void;
};

export default function SaveBuildVersionDialog({ open, kind, iconCount, busyAction, onDownloadOnly, onSaveVersion, onClose }: SaveBuildVersionDialogProps) {
  const noun = iconCount === 1 ? "icon" : "icons";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Save this ${kind} Build as a Version?`}
      dismissOnBackdrop={busyAction === null}
      footer={
        <div className="grid w-full gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-auto min-h-9 whitespace-normal px-2" onClick={onClose} disabled={busyAction !== null}>
              Cancel
            </Button>
            <Button variant="primary" className="h-auto min-h-9 whitespace-normal px-2" icon={<Download aria-hidden="true" className="h-4 w-4 shrink-0" />} onClick={onSaveVersion} loading={busyAction === "save"} disabled={busyAction !== null}>
              Save Version &amp; Download
            </Button>
          </div>
          <Button variant="ghost" className="mx-auto h-8 text-primary" onClick={onDownloadOnly} loading={busyAction === "download"} disabled={busyAction !== null}>
            Download Only
          </Button>
        </div>
      }
    >
      <p className="text-sm text-foreground">This build contains {iconCount} selected {noun}.</p>
      <p className="mt-2 text-sm text-muted-foreground">Save a version to keep this package in {kind} build history and download it again later.</p>
    </Dialog>
  );
}
