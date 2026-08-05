import { cn } from "@/lib/utils";

interface MacroBarProps {
  /** Fill percentage 0–100 */
  value: number;
  /** Tailwind bg-* class for the filled portion */
  fillClass?: string;
  /** Tailwind bg-* class for the track */
  trackClass?: string;
  /** Tailwind height class */
  heightClass?: string;
  className?: string;
}

/**
 * Thin, fully-rounded macro progress bar from the Plately design system.
 * Bars animate their width in on mount for the "restful" editorial feel.
 */
export function MacroBar({
  value,
  fillClass = "bg-primary",
  trackClass = "bg-surface-container-high",
  heightClass = "h-2",
  className,
}: MacroBarProps) {
  return (
    <div
      className={cn(
        "w-full rounded-full overflow-hidden",
        heightClass,
        trackClass,
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-1000 ease-out", fillClass)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
