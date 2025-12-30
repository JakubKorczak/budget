import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ChevronsUpDown, Check, Search } from "lucide-react";

import type { Category } from "@/types/expense";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/lib/utils";

interface CategoryComboboxProps {
  categories: Category[];
  value?: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface CategorySection {
  groupName: string;
  items: string[];
}

function buildSections(
  categories: Category[],
  query: string
): CategorySection[] {
  const normalizedQuery = query.trim().toLowerCase();

  return categories
    .map((categoryGroup) => {
      const groupName = Object.keys(categoryGroup)[0];
      const items = categoryGroup[groupName] ?? [];

      const filteredItems = items.filter((item) => {
        if (!normalizedQuery) return true;
        return item.toLowerCase().includes(normalizedQuery);
      });

      return { groupName, items: filteredItems } as CategorySection;
    })
    .filter((section) => section.items.length > 0);
}

export function CategoryCombobox({
  categories,
  value,
  onChange,
  placeholder = "Wybierz kategorię...",
  disabled,
  onOpenChange,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const sections = useMemo(
    () => buildSections(categories, search),
    [categories, search]
  );
  const selectedLabel = value?.trim().length ? value : placeholder;
  const hasResults = sections.length > 0;

  const syncContentWidth = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const triggerWidth = triggerRef.current?.offsetWidth ?? 0;
    if (!triggerWidth) {
      setContentWidth(null);
      return;
    }
    const maxWidth = Math.max(0, window.innerWidth - 32);
    setContentWidth(Math.min(triggerWidth, maxWidth));
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(syncContentWidth);
    window.addEventListener("resize", syncContentWidth);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncContentWidth);
    };
  }, [syncContentWidth]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(syncContentWidth);
    }
  }, [open, syncContentWidth]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        setSearch("");
      }
    },
    [onOpenChange]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          className="w-full h-12 justify-between font-normal"
          disabled={disabled}
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {selectedLabel}
          </span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        side="bottom"
        avoidCollisions={false}
        style={{
          width: contentWidth ?? undefined,
          maxWidth: contentWidth ?? undefined,
        }}
      >
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <Search className="size-4 text-gray-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj kategorii..."
            className="border-0 shadow-none focus-visible:ring-0 h-10 p-0"
          />
        </div>
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {hasResults ? (
            sections.map((section) => (
              <div key={section.groupName}>
                <div className="px-3 py-2 text-xs font-bold text-gray-500 bg-gray-50 uppercase tracking-wide">
                  {section.groupName}
                </div>
                {section.items.map((item) => (
                  <button
                    key={`${section.groupName}-${item}`}
                    type="button"
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-3 text-left text-base",
                      "hover:bg-blue-50 focus-visible:outline-none",
                      value === item
                        ? "text-blue-600 font-semibold"
                        : "text-gray-900"
                    )}
                    onClick={() => {
                      onChange(item);
                      handleOpenChange(false);
                      setSearch("");
                    }}
                  >
                    <span>{item}</span>
                    {value === item && <Check className="size-4" />}
                  </button>
                ))}
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Brak kategorii dla tego filtra
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
