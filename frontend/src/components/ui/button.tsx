import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-label-md text-label-md transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        // Primary: Herb Green background, white Inter Medium text, 14px radius
        primary:
          "bg-primary text-on-primary rounded-[14px] hover:opacity-90 shadow-sm",
        // Secondary outline button
        outline:
          "border border-outline text-on-surface rounded-[14px] hover:bg-surface-container",
        // Soft surface button (e.g. "Upload from gallery")
        surface:
          "bg-white border border-outline-variant text-on-surface rounded-[14px] hover:bg-surface-container-low",
        ghost: "text-on-surface-variant hover:text-primary rounded-[14px]",
        link: "text-primary hover:underline underline-offset-4",
      },
      size: {
        default: "px-6 py-3",
        sm: "px-4 py-2",
        lg: "px-10 py-4",
        block: "w-full h-14",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
