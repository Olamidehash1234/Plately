import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Plately input field: 14px radius, white surface, 1px hairline border,
 * herb-green focus ring, slate placeholder text.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "w-full h-14 px-stack-md bg-surface-container-lowest border border-outline-variant rounded-[14px] font-body-md text-body-md text-on-surface",
          "placeholder:text-outline outline-none transition-all",
          "focus:border-primary focus:ring-1 focus:ring-primary",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
