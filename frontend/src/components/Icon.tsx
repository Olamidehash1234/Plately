import { cn } from "@/lib/utils";

interface IconProps {
  name: string;
  className?: string;
  /** Render the filled variant of the Material Symbol */
  filled?: boolean;
  style?: React.CSSProperties;
}

/**
 * Material Symbols Outlined icon — the icon set used throughout the Plately
 * Stitch design. Sizing is controlled via `text-[..px]` utility classes.
 */
export function Icon({ name, className, filled, style }: IconProps) {
  return (
    <span
      className={cn("material-symbols-outlined", filled && "filled", className)}
      style={style}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
