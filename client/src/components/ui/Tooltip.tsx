// A responsive tooltip that appears on hover. Automatically adjusts position to avoid overflow.
// Used for showing contextual help information next to icons or interactive elements.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type TooltipPosition = "top" | "bottom" | "left" | "right";

type TooltipProps = {
  content: string | ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  delayMs?: number;
  className?: string;
};

export default function Tooltip({ content, children, position = "top", delayMs = 300, className }: TooltipProps) {
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
    const padding = 8;

    let newPosition = position;

    // Check if tooltip would overflow
    if (position === "top" || position === "bottom") {
      if (position === "top" && triggerRect.top - tooltipRect.height - padding < 0) {
        newPosition = "bottom";
      } else if (position === "bottom" && triggerRect.bottom + tooltipRect.height + padding > viewportHeight) {
        newPosition = "top";
      }
    }

    if (position === "left" || position === "right") {
      if (position === "left" && triggerRect.left - tooltipRect.width - padding < 0) {
        newPosition = "right";
      } else if (position === "right" && triggerRect.right + tooltipRect.width + padding > viewportWidth) {
        newPosition = "left";
      }
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
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  };

  const arrowClasses = {
    top: "top-full border-l-transparent border-r-transparent border-b-transparent -translate-x-1/2 left-1/2",
    bottom: "bottom-full border-l-transparent border-r-transparent border-t-transparent -translate-x-1/2 left-1/2",
    left: "left-full border-t-transparent border-b-transparent border-r-transparent -translate-y-1/2 top-1/2",
    right: "right-full border-t-transparent border-b-transparent border-l-transparent -translate-y-1/2 top-1/2",
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
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-md",
            positionClasses[calculatedPosition],
            className,
          )}
        >
          {content}
          {/* Arrow pointer */}
          <div
            className={cn(
              "absolute h-0 w-0 border-4 border-border",
              arrowClasses[calculatedPosition],
            )}
          />
        </div>
      )}
    </div>
  );
}
