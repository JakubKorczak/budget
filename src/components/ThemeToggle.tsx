import { Moon, Sun } from "lucide-react";

import type { AppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  theme: AppTheme;
  onToggle: () => void;
  className?: string;
}

export function ThemeToggle({
  theme,
  onToggle,
  className,
}: ThemeToggleProps) {
  const isDark = theme === "dark";
  const label = isDark ? "Włącz jasny motyw" : "Włącz ciemny motyw";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn(
        "rounded-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-sm",
        className
      )}
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
