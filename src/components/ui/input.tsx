import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "w-full h-12 px-4 py-3 text-base bg-background border-2 border-input rounded-xl shadow-sm",
          "placeholder:text-muted-foreground text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
          "disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          "touch-manipulation", // Better touch on mobile
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
