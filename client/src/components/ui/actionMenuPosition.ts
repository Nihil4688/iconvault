export type MenuPosition = {
  left: number;
  top: number;
  maxHeight: number;
  constrained: boolean;
};

type TriggerBounds = Pick<DOMRect, "top" | "bottom" | "right">;

export function calculateMenuPosition(
  trigger: TriggerBounds,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): MenuPosition {
  const margin = 8;
  const gap = 4;
  const spaceBelow = Math.max(0, viewport.height - trigger.bottom - margin);
  const spaceAbove = Math.max(0, trigger.top - margin);
  const opensAbove = menu.height > spaceBelow && spaceAbove > spaceBelow;
  const availableHeight = opensAbove ? spaceAbove : spaceBelow;
  const constrained = menu.height > availableHeight;
  const maxHeight = Math.min(menu.height, availableHeight);
  const left = Math.max(margin, Math.min(trigger.right - menu.width, viewport.width - menu.width - margin));
  const requestedTop = opensAbove
    ? trigger.top - maxHeight - gap
    : trigger.bottom + gap;
  const top = Math.max(margin, Math.min(requestedTop, viewport.height - maxHeight - margin));

  return { left, top, maxHeight, constrained };
}
