// The visibility and project-type badges, each with its own colour so they can be told apart at a glance (Private violet, Public green, Icon Font indigo, Sprite amber). The words are always shown too, so colour is never the only signal.
import { Globe, Lock, Shapes, Type } from "lucide-react";
import type { ProjectDetail } from "../../api/types";
import Badge from "../ui/Badge";

const TONES = {
  private: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  public: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  font: "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  sprite: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function VisibilityBadge({ visibility }: { visibility: ProjectDetail["visibility"] }) {
  const isPublic = visibility === "public";
  return (
    <Badge className={isPublic ? TONES.public : TONES.private} icon={isPublic ? <Globe aria-hidden="true" className="h-3 w-3" /> : <Lock aria-hidden="true" className="h-3 w-3" />}>
      {isPublic ? "Public" : "Private"}
    </Badge>
  );
}

// `long` gives "Icon Font Project" / "Sprite Project" (project page); otherwise "Font" / "Sprite" (cards).
export function PurposeBadge({ purpose, long = false }: { purpose: ProjectDetail["purpose"]; long?: boolean }) {
  const isFont = purpose === "font";
  const Icon = isFont ? Type : Shapes;
  const label = isFont ? (long ? "Icon Font Project" : "Font") : long ? "Sprite Project" : "Sprite";
  return (
    <Badge className={isFont ? TONES.font : TONES.sprite} icon={<Icon aria-hidden="true" className="h-3 w-3" />}>
      {label}
    </Badge>
  );
}
