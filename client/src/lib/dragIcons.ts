// What is carried when icons are dragged onto a folder. Dragging is a convenience; every move also has a keyboard path (select icons, then Move in the bulk bar).

export const DRAG_TYPE = "application/x-svg-icon-ids";

export function setDraggedIcons(data: DataTransfer, iconIds: string[]): void {
  data.setData(DRAG_TYPE, JSON.stringify(iconIds));
  data.effectAllowed = "move";
}

export function hasDraggedIcons(data: DataTransfer | null): boolean {
  return Array.from(data?.types ?? []).includes(DRAG_TYPE);
}

export function getDraggedIcons(data: DataTransfer): string[] {
  try {
    const parsed: unknown = JSON.parse(data.getData(DRAG_TYPE));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
