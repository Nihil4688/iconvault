// The table view of icons: select, preview, name (opens it), project-specific identifier and folder. Rows can be dragged onto folders like cards.
import type { FolderItem, IconItem, ProjectPurpose } from "../../api/types";
import { setDraggedIcons } from "../../lib/dragIcons";
import { cn } from "../../lib/cn";
import { folderPath } from "../../lib/folderTree";
import type { IconAppearance } from "../../lib/iconAppearance";
import { iconWarnings } from "../../lib/iconInfo";
import { symbolId } from "../../lib/spriteBuild";
import { surfaceClass, surfaceStyle, type Surface } from "../../lib/previewSurface";
import SvgPreview from "../ui/SvgPreview";

type IconListProps = {
  icons: IconItem[];
  folders: FolderItem[];
  purpose: ProjectPurpose;
  idPrefix: string;
  isSelected: (id: string) => boolean;
  selectionDisabled?: boolean;
  surface: Surface;
  appearanceForFolder: (folderId: string | null) => IconAppearance;
  canDrag: boolean;
  dragIds: (id: string) => string[];
  onToggle: (id: string) => void;
  onOpen: (icon: IconItem) => void;
};

export default function IconList({ icons, folders, purpose, idPrefix, isSelected, selectionDisabled = false, surface, appearanceForFolder, canDrag, dragIds, onToggle, onOpen }: IconListProps) {
  return (
    // `relative` matters: the table holds visually hidden (absolutely positioned) text, which would otherwise escape this scroll box and widen the whole page on a phone.
    <div className="relative min-h-0 max-h-full w-full flex-none overflow-auto rounded-xl border border-border mb-6">
      <table className="w-full min-w-xl text-left text-sm">
        <caption className="sr-only">Icons</caption>
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="sticky top-0 z-10 w-10 bg-muted px-3 py-2">
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className="sticky top-0 z-10 w-14 bg-muted px-1 py-2">
              <span className="sr-only">Preview</span>
            </th>
            <th scope="col" className="sticky top-0 z-10 bg-muted px-3 py-2 font-medium">
              Name
            </th>
            <th scope="col" className="sticky top-0 z-10 bg-muted px-3 py-2 font-medium">
              {purpose === "sprite" ? "ID" : "Codepoint"}
            </th>
            <th scope="col" className="sticky top-0 z-10 bg-muted px-3 py-2 font-medium">
              Folder
            </th>
          </tr>
        </thead>
        <tbody>
          {icons.map((icon) => {
            const warnings = iconWarnings(icon).filter((warning) => warning !== "Stroke" && warning !== "Gradient");
            const appearance = appearanceForFolder(icon.folderId);
            return (
              <tr
                key={icon.id}
                draggable={canDrag}
                onDragStart={(event) => setDraggedIcons(event.dataTransfer, dragIds(icon.id))}
                className={cn("border-t border-border", isSelected(icon.id) ? "bg-primary/5" : "hover:bg-accent/50")}
              >
                <td className="px-3 py-2">
                  <input type="checkbox" checked={isSelected(icon.id)} disabled={selectionDisabled} onChange={() => onToggle(icon.id)} aria-label={`Select ${icon.name}`} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                </td>
                <td className="px-1 py-1.5">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-md", surfaceClass(surface))} style={surfaceStyle(surface)}>
                    <SvgPreview svg={icon.svg ?? ""} size={24} color={appearance.color} />
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onOpen(icon)} className="rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                    {icon.name}
                  </button>
                  {warnings.length > 0 && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">{warnings.join(", ")}</span>}
                </td>
                <td className="break-all px-3 py-2 font-mono text-xs text-muted-foreground">
                  {purpose === "sprite" ? symbolId(idPrefix, icon.slug) : icon.codepoint ? `U+${icon.codepoint}` : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{folderPath(folders, icon.folderId)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
