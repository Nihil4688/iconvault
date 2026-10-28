// A responsive tooltip that appears on hover with a dark background and white text.
// Automatically adjusts position to avoid overflow.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type TooltipPosition = "top" | "bottom" | "left" | "right";

type TooltipProps = {
  content: string | ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  delayMs?: number;
};

export default function Tooltip({ content, children, position = "top", delayMs = 200 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [calculatedPosition, setCalculatedPosition] = useState<TooltipPosition>(position);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipId = useId();

  // Calculate optimal position to avoid overflow
  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 12;

    let newPosition = position;

    // Check if tooltip would overflow vertically
    if (position === "top" && triggerRect.top - tooltipRect.height - padding < 0) {
      newPosition = "bottom";
    } else if (position === "bottom" && triggerRect.bottom + tooltipRect.height + padding > viewportHeight) {
      newPosition = "top";
    }

    // Check if tooltip would overflow horizontally
    if (position === "left" && triggerRect.left - tooltipRect.width - padding < 0) {
      newPosition = "right";
    } else if (position === "right" && triggerRect.right + tooltipRect.width + padding > viewportWidth) {
      newPosition = "left";
    }

    if (newPosition !== calculatedPosition) {
      setCalculatedPosition(newPosition);
    }
  }, [isVisible, position, calculatedPosition]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const positionClasses = {
    top: "bottom-full mb-3 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-3 left-1/2 -translate-x-1/2",
    left: "right-full mr-3 top-1/2 -translate-y-1/2",
    right: "left-full ml-3 top-1/2 -translate-y-1/2",
  };

  const arrowClasses = {
    top: "bottom-0 translate-y-full border-t-8 border-x-4 border-x-transparent border-b-0",
    bottom: "top-0 -translate-y-full border-b-8 border-x-4 border-x-transparent border-t-0",
    left: "right-0 translate-x-full border-l-8 border-y-4 border-y-transparent border-r-0",
    right: "left-0 -translate-x-full border-r-8 border-y-4 border-y-transparent border-l-0",
  };

  const arrowAlignment = {
    top: "left-1/2 -translate-x-1/2",
    bottom: "left-1/2 -translate-x-1/2",
    left: "top-1/2 -translate-y-1/2",
    right: "top-1/2 -translate-y-1/2",
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative inline-flex items-center"
    >
      {children}

      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          id={tooltipId}
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-black px-2.5 py-1.5 text-xs font-medium text-white shadow-lg",
            positionClasses[calculatedPosition],
          )}
        >
          {content}
          {/* Arrow pointer */}
          <div
            className={cn(
              "absolute h-0 w-0",
              arrowClasses[calculatedPosition],
              arrowAlignment[calculatedPosition],
              "border-black",
            )}
          />
        </div>
      )}
    </div>
  );
}
