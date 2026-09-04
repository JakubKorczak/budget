import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import {
  evaluateLinearExpression,
  formatDecimalDotsToCommas,
  parsePriceInput,
} from "@/lib/budgetExpression";
import { getCategoryBudgetProgress } from "@/lib/categoryBudget";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import {
  Banknote,
  CalendarDays,
  Loader2,
  ReceiptText,
  RefreshCw,
  Save,
  Tags,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  getCategories,
  getSalaryCategories,
  getCurrentMonth,
  getCachedCategoriesSnapshot,
  getCachedSalaryCategoriesSnapshot,
  getDayAmounts,
  getCachedDayAmountsSnapshot,
  getCategoryBudgetStatus,
  clearCategoriesCache,
  clearSalaryCategoriesCache,
  clearAllDayAmountCaches,
} from "@/services/googleSheets";
import type { DayAmountsMap, BudgetEntryType } from "@/services/googleSheets";
import {
  discardBudgetQueueRecord,
  enqueueBudgetEntry,
  overwriteBudgetQueueConflict,
  retryBudgetQueueRecord,
  type BudgetQueueSnapshot,
} from "@/services/budgetQueue";
import {
  dayAmountToCanonical,
  type CanonicalCellValue,
} from "@/services/budgetDb";
import { MONTHS, type Category } from "@/types/expense";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AppTheme } from "@/lib/theme";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import {
  clearBudgetEntryDraft,
  readBudgetEntryDraft,
  writeBudgetEntryDraft,
} from "@/lib/expenseDraft";

const currencyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentageFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const configuredLiveSyncInterval = Number(
  import.meta.env.VITE_DAY_SYNC_INTERVAL_MS ?? 10_000
);
const LIVE_SYNC_INTERVAL_MS =
  Number.isFinite(configuredLiveSyncInterval) && configuredLiveSyncInterval > 0
    ? configuredLiveSyncInterval
    : 10_000;

function usePreventPullToRefresh(isActive: boolean) {
  useEffect(() => {
    if (!isActive || typeof window === "undefined") {
      return;
    }

    const root = document.getElementById("root");
    if (!root) {
      return;
    }

    const previousOverflow = root.style.overflow;
    const previousTouchAction = root.style.touchAction;

    root.style.overflow = "hidden";
    root.style.touchAction = "none";

    return () => {
      root.style.overflow = previousOverflow;
      root.style.touchAction = previousTouchAction;
    };
  }, [isActive]);
}

type CalculatorRibbonProps = {
  onInsertSymbol: (symbol: "=" | "+" | "-") => void;
  disabled?: boolean;
  className?: string;
};

function CalculatorRibbon({
  onInsertSymbol,
  disabled,
  className,
}: CalculatorRibbonProps) {
  const buttons: Array<{ label: string; value: "=" | "+" | "-" }> = [
    { label: "=", value: "=" },
    { label: "+", value: "+" },
    { label: "-", value: "-" },
  ];

  return (
    <div
      className={cn(
        "mb-3 flex gap-2 rounded-2xl border border-border bg-muted p-2",
        className
      )}
    >
      {buttons.map((button) => (
        <button
          key={button.value}
          type="button"
          className="flex-1 rounded-xl bg-background py-2 text-lg font-semibold text-foreground shadow-sm transition hover:bg-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onInsertSymbol(button.value)}
          onMouseDown={(event) => event.preventDefault()}
          onTouchStart={(event) => event.preventDefault()}
          disabled={disabled}
          aria-label={`Wstaw znak ${button.label}`}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

// Schemat walidacji formularza
const expenseFormSchema = z.object({
  category: z.string().min(1, "Wybierz kategorię"),
  day: z.string().min(1, "Wybierz dzień"),
  price: z.string().min(1, "Podaj koszt"),
});

const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) =>
  (index + 1).toString()
);

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

type ExpenseFormProps = {
  entryType?: BudgetEntryType;
  onEntryTypeToggle: () => void;
  theme: AppTheme;
  onThemeToggle: () => void;
  queueSnapshot: BudgetQueueSnapshot;
  scrollContainerRef: RefObject<HTMLElement | null>;
};

export function ExpenseForm({
  entryType = "expense",
  onEntryTypeToggle,
  theme,
  onThemeToggle,
  queueSnapshot,
  scrollContainerRef,
}: ExpenseFormProps) {
  const [initialDraft] = useState(() => readBudgetEntryDraft(entryType));
  const [isLoadingAmount, setIsLoadingAmount] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [dayCacheVersion, setDayCacheVersion] = useState(0);
  const [isPriceFocused, setIsPriceFocused] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isEnqueueing, setIsEnqueueing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    () => initialDraft?.month ?? getCurrentMonth()
  );
  const queryClient = useQueryClient();
  const isSalary = entryType === "salary";
  const restoredSelectionRef = useRef(
    initialDraft
      ? `${initialDraft.month}\u0000${initialDraft.day}\u0000${initialDraft.category}`
      : null
  );
  const hydratedSelectionRef = useRef<string | null>(null);
  const loadedCellBaseRef = useRef<CanonicalCellValue | null>(null);
  const userEditedPriceRef = useRef(Boolean(initialDraft?.price));

  useEffect(() => {
    setDayCacheVersion((version) => version + 1);
  }, [queueSnapshot]);

  const cachedCategories = useMemo(
    () =>
      isSalary
        ? getCachedSalaryCategoriesSnapshot(selectedMonth)
        : getCachedCategoriesSnapshot(),
    [isSalary, selectedMonth]
  );

  const { data: categories = [], error: categoriesError } = useQuery<
    Category[]
  >({
    queryKey: isSalary
      ? ["salary-categories", selectedMonth]
      : ["categories"],
    queryFn: () =>
      isSalary ? getSalaryCategories(selectedMonth) : getCategories(),
    initialData: cachedCategories ?? undefined,
    placeholderData: cachedCategories ?? undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: cachedCategories ? true : false,
  });

  const normalizedCategories = useMemo(() => {
    return categories.map((group) => {
      const groupName = Object.keys(group)[0];
      const subcategories = [...group[groupName]];
      return { [groupName]: subcategories } as Category;
    });
  }, [categories]);

  const errorMessage = categoriesError?.message ?? "";

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    shouldUnregister: true,
    defaultValues: {
      category: initialDraft?.category ?? "",
      day: initialDraft?.day ?? new Date().getDate().toString(),
      price: initialDraft?.price ?? "",
    },
  });

  const priceInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedCategory, selectedDay, enteredPrice] = useWatch({
    control: form.control,
    name: ["category", "day", "price"],
  });

  const {
    data: categoryBudgetAmounts,
    error: categoryBudgetError,
    isFetching: isCategoryBudgetLoading,
  } = useQuery({
    queryKey: [
      "category-budget-status",
      selectedMonth,
      selectedCategory,
    ],
    queryFn: ({ signal }) =>
      getCategoryBudgetStatus(selectedCategory ?? "", selectedMonth, signal),
    enabled: !isSalary && Boolean(selectedCategory),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: LIVE_SYNC_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const categoryBudgetProgress = useMemo(
    () =>
      categoryBudgetAmounts
        ? getCategoryBudgetProgress(categoryBudgetAmounts)
        : null,
    [categoryBudgetAmounts]
  );

  const persistCurrentDraft = useCallback(() => {
    const values = form.getValues();
    const isEmptyCurrentDraft =
      !values.category &&
      !values.price &&
      values.day === new Date().getDate().toString() &&
      selectedMonth === getCurrentMonth();

    if (isEmptyCurrentDraft) {
      clearBudgetEntryDraft(entryType);
      return;
    }

    writeBudgetEntryDraft(entryType, {
      category: values.category,
      day: values.day,
      price: values.price,
      month: selectedMonth,
    });
  }, [entryType, form, selectedMonth]);

  useEffect(() => {
    persistCurrentDraft();
  }, [enteredPrice, persistCurrentDraft, selectedCategory, selectedDay]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistCurrentDraft();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", persistCurrentDraft);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", persistCurrentDraft);
    };
  }, [persistCurrentDraft]);

  useEffect(() => {
    if (!selectedCategory || !selectedDay || typeof window === "undefined") {
      return;
    }

    const requestLiveRefresh = () => {
      if (
        document.visibilityState === "visible" &&
        (typeof navigator === "undefined" || navigator.onLine)
      ) {
        setDayCacheVersion((version) => version + 1);
      }
    };

    const intervalId = window.setInterval(
      requestLiveRefresh,
      LIVE_SYNC_INTERVAL_MS
    );
    window.addEventListener("focus", requestLiveRefresh);
    document.addEventListener("visibilitychange", requestLiveRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", requestLiveRefresh);
      document.removeEventListener("visibilitychange", requestLiveRefresh);
    };
  }, [selectedCategory, selectedDay, selectedMonth]);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }
    setIsIosDevice(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isIosDevice) {
      setKeyboardOffset(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      setKeyboardOffset(0);
      return;
    }

    const updateKeyboardOffset = () => {
      const fullHeight = window.innerHeight;
      const overlap = Math.max(0, fullHeight - viewport.height);
      setKeyboardOffset(overlap);
    };

    updateKeyboardOffset();
    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
    };
  }, [isIosDevice]);

  const sanitizePriceInput = useCallback((value: string) => {
    if (!value) {
      return "";
    }

    const trimmedValue = value.trimStart();
    const hasLeadingEquals = trimmedValue.startsWith("=");
    let sanitized = value.replace(/[^0-9.,+\-=\s]/g, "");
    sanitized = sanitized.replace(/=/g, "");

    if (hasLeadingEquals) {
      sanitized = "=" + sanitized.trimStart();
    }

    return sanitized;
  }, []);

  const handleInsertSymbol = useCallback(
    (symbol: "=" | "+" | "-") => {
      const currentValue = form.getValues("price") ?? "";
      let nextValue: string;

      if (symbol === "=") {
        const withoutEquals = currentValue.replace(/=/g, "").trimStart();
        nextValue = sanitizePriceInput(`=${withoutEquals}`);
      } else {
        nextValue = sanitizePriceInput(`${currentValue}${symbol}`);
      }

      form.setValue("price", nextValue, {
        shouldDirty: true,
        shouldValidate: true,
      });
      userEditedPriceRef.current = true;

      requestAnimationFrame(() => {
        const input = priceInputRef.current;
        if (!input) {
          return;
        }
        const caretPos = nextValue.length;
        input.focus();
        input.setSelectionRange(caretPos, caretPos);
      });
    },
    [form, sanitizePriceInput]
  );

  const handlePriceFocus = useCallback(() => {
    setIsPriceFocused(true);
  }, []);

  const handlePriceBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const input = priceInputRef.current;
      if (!input) {
        setIsPriceFocused(false);
        return;
      }

      if (typeof document !== "undefined" && document.activeElement !== input) {
        setIsPriceFocused(false);
      }
    });
  }, []);

  usePreventPullToRefresh(
    isCategoryPickerOpen || isDayPickerOpen || isMonthPickerOpen
  );

  const handleMonthChange = useCallback(
    (month: string) => {
      setSelectedMonth(month);
      if (isSalary) {
        form.setValue("category", "");
      }
      form.setValue("price", "");
    },
    [form, isSalary]
  );

  const handlePullRefresh = useCallback(async () => {
    if (isPullRefreshing) {
      return;
    }

    setIsPullRefreshing(true);

    try {
      if (isSalary) {
        clearSalaryCategoriesCache(selectedMonth);
      } else {
        clearCategoriesCache();
      }
      await clearAllDayAmountCaches();

      const parsedDay = selectedDay ? parseInt(selectedDay, 10) : NaN;
      const refreshDayAmounts = Number.isFinite(parsedDay)
        ? (async () => {
            const dayNumber = parsedDay;
            const amounts = await getDayAmounts(selectedMonth, dayNumber, {
              forceRefresh: true,
              entryType,
            });

            if (selectedCategory) {
              const entry = amounts[selectedCategory];
              loadedCellBaseRef.current = dayAmountToCanonical(entry);
              userEditedPriceRef.current = false;
              if (entry?.formula) {
                form.setValue(
                  "price",
                  formatDecimalDotsToCommas(entry.formula)
                );
              } else if (entry && entry.amount !== 0) {
                form.setValue("price", entry.amount.toString());
              } else {
                form.setValue("price", "");
              }
            }
          })()
        : Promise.resolve();

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: isSalary
            ? ["salary-categories", selectedMonth]
            : ["categories"],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "category-budget-status",
            selectedMonth,
            selectedCategory,
          ],
        }),
        refreshDayAmounts,
      ]);

      setDayCacheVersion((version) => version + 1);
      toast.success("Dane zostały odświeżone");
    } catch (error) {
      console.error("Błąd podczas odświeżania danych:", error);
      toast.error("Nie udało się odświeżyć danych");
    } finally {
      setIsPullRefreshing(false);
    }
  }, [
    entryType,
    form,
    isSalary,
    isPullRefreshing,
    queryClient,
    selectedCategory,
    selectedDay,
    selectedMonth,
  ]);

  usePullToRefresh(
    handlePullRefresh,
    !isCategoryPickerOpen &&
      !isDayPickerOpen &&
      !isMonthPickerOpen &&
      !isEnqueueing,
    scrollContainerRef
  );

  const onSubmit = useCallback(
    async (data: ExpenseFormValues) => {
      if (isEnqueueing) {
        return;
      }
      const parsed = parsePriceInput(data.price);
      if (!parsed) {
        form.setError("price", {
          type: "manual",
          message:
            "Wpisz poprawne działanie (cyfry oraz znaki +, - lub rozpocznij od = aby wysłać formułę)",
        });
        return;
      }

      const formulaResult =
        parsed.mode === "formula"
          ? evaluateLinearExpression(parsed.formula.slice(1))
          : null;

      setIsEnqueueing(true);
      try {
        await enqueueBudgetEntry({
          entryType,
          category: data.category,
          day: parseInt(data.day, 10),
          month: selectedMonth,
          expected: loadedCellBaseRef.current ?? undefined,
          desired:
            parsed.mode === "value"
              ? { mode: "value", amount: parsed.amount }
              : {
                  mode: "formula",
                  formula: formatDecimalDotsToCommas(parsed.formula),
                  amount: formulaResult ?? 0,
                },
        });
        form.reset({
          category: "",
          day: new Date().getDate().toString(),
          price: "",
        });
        clearBudgetEntryDraft(entryType);
        restoredSelectionRef.current = null;
        hydratedSelectionRef.current = null;
        loadedCellBaseRef.current = null;
        userEditedPriceRef.current = false;
        setDayCacheVersion((version) => version + 1);
        if (navigator.onLine) {
          toast.success(
            isSalary
              ? "Wynagrodzenie przyjęte do zapisu"
              : "Wydatek przyjęty do zapisu"
          );
        } else {
          toast.info("Zapisano lokalnie — oczekuje na internet");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Nie udało się zapisać lokalnie"
        );
      } finally {
        setIsEnqueueing(false);
      }
    },
    [entryType, form, isEnqueueing, isSalary, selectedMonth]
  );

  useEffect(() => {
    let isActive = true;

    const hydrateAmount = async () => {
      const selectionKey = `${selectedMonth}\u0000${selectedDay ?? ""}\u0000${selectedCategory ?? ""}`;
      if (restoredSelectionRef.current === selectionKey) {
        return;
      }
      restoredSelectionRef.current = null;

      if (hydratedSelectionRef.current !== selectionKey) {
        hydratedSelectionRef.current = selectionKey;
        loadedCellBaseRef.current = null;
        userEditedPriceRef.current = false;
      }

      if (!selectedDay || !selectedCategory) {
        if (isActive) {
          setIsLoadingAmount(false);
        }
        return;
      }

      const dayNumber = parseInt(selectedDay, 10);
      if (!Number.isFinite(dayNumber)) {
        if (isActive) {
          setIsLoadingAmount(false);
        }
        return;
      }

      const cachedDayAmounts = getCachedDayAmountsSnapshot(
        selectedMonth,
        dayNumber,
        entryType
      );

      const applyAmount = (amounts: DayAmountsMap | null) => {
        if (!amounts || userEditedPriceRef.current) {
          return;
        }
        const entry = amounts[selectedCategory];
        loadedCellBaseRef.current = dayAmountToCanonical(entry);
        if (!entry) {
          form.setValue("price", "");
          return;
        }

        if (entry.formula) {
          form.setValue("price", formatDecimalDotsToCommas(entry.formula));
          return;
        }

        form.setValue(
          "price",
          entry.amount !== 0 ? entry.amount.toString() : ""
        );
      };

      if (cachedDayAmounts) {
        applyAmount(cachedDayAmounts);
      }

      const shouldShowSpinner = Boolean(selectedCategory) && !cachedDayAmounts;
      if (shouldShowSpinner && isActive) {
        setIsLoadingAmount(true);
      }

      try {
        const dayAmounts = await getDayAmounts(selectedMonth, dayNumber, {
          entryType,
          forceRefresh:
            typeof navigator === "undefined" ? false : navigator.onLine,
        });
        if (!isActive) {
          return;
        }
        applyAmount(dayAmounts);
      } catch (error) {
        if (isActive) {
          console.error("Błąd podczas pobierania kwot dnia:", error);
        }
      } finally {
        if (shouldShowSpinner && isActive) {
          setIsLoadingAmount(false);
        }
      }
    };

    void hydrateAmount();

    return () => {
      isActive = false;
    };
  }, [
    selectedCategory,
    selectedDay,
    selectedMonth,
    form,
    dayCacheVersion,
    entryType,
  ]);

  const showDesktopRibbon = !isIosDevice;
  const showMobileRibbon = isIosDevice && isPriceFocused;
  const keyboardAwareBottom = Math.max(-22, keyboardOffset - 22);

  return (
    <>
      <Card className="w-full shadow-lg">
        <CardHeader className="mb-3 pb-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-xl sm:text-2xl">
              {isSalary ? (
                <Banknote className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ReceiptText className="size-6 shrink-0 text-blue-600 dark:text-blue-400" />
              )}
              <span>
                {isSalary ? "Wynagrodzenie" : "Wydatek"}
              </span>
            </CardTitle>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full border-border/80 bg-background/80 shadow-sm"
                onClick={onEntryTypeToggle}
                disabled={isEnqueueing}
                aria-label={
                  isSalary
                    ? "Przejdź do wydatków"
                    : "Przejdź do wynagrodzeń"
                }
                title={
                  isSalary
                    ? "Przejdź do wydatków"
                    : "Przejdź do wynagrodzeń"
                }
              >
                {isSalary ? (
                  <ReceiptText className="size-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Banknote className="size-5 text-emerald-600 dark:text-emerald-400" />
                )}
              </Button>
              <ThemeToggle theme={theme} onToggle={onThemeToggle} />
            </div>
          </div>
          <CardDescription className="flex items-center gap-0.5">
            <Select
              value={selectedMonth}
              onValueChange={handleMonthChange}
              onOpenChange={setIsMonthPickerOpen}
              disabled={isEnqueueing}
            >
              <SelectTrigger
                aria-label="Zmień miesiąc"
                className="h-auto w-auto gap-1 rounded-md border-0 bg-transparent px-1.5 py-0.5 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground focus:border-0 focus:ring-1 [&_svg]:size-3.5"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                className="max-h-88"
                style={{
                  width: "min(calc(100vw - 4.5rem), 23rem)",
                  maxWidth: "min(calc(100vw - 4.5rem), 23rem)",
                }}
              >
                {MONTHS.map((month) => (
                  <SelectItem
                    key={month}
                    value={month}
                    className="py-3 text-base"
                  >
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>{new Date().getFullYear()}</span>
          </CardDescription>
          {isPullRefreshing && (
            <div className="mt-2 flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Odświeżanie danych...
            </div>
          )}
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="mb-4 rounded-r-lg border-l-4 border-red-500 bg-red-50 p-3 dark:bg-red-950/50">
              <div className="flex items-start">
                <TriangleAlert className="mr-3 mt-0.5 size-5 shrink-0 text-red-500" />
                <div className="flex-1">
                  <h3 className="mb-1 text-sm font-semibold text-red-800 dark:text-red-200">
                    Błąd konfiguracji
                  </h3>
                  <p className="whitespace-pre-line text-sm text-red-700 dark:text-red-300">
                    {errorMessage}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-700 underline hover:no-underline dark:text-red-300"
                  >
                    <RefreshCw className="size-4" />
                    Odśwież stronę
                  </button>
                </div>
              </div>
            </div>
          )}

          {queueSnapshot.offline && queueSnapshot.pending > 0 && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              Zapisano lokalnie — {queueSnapshot.pending}{" "}
              {queueSnapshot.pending === 1 ? "wpis oczekuje" : "wpisy oczekują"}{" "}
              na internet.
            </div>
          )}

          {queueSnapshot.problems.map((problem) => (
            <div
              key={problem.commandId}
              className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/50"
            >
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-red-900 dark:text-red-100">
                    {problem.state === "conflict"
                      ? "Wartość w arkuszu została zmieniona"
                      : "Nie udało się zsynchronizować wpisu"}
                  </p>
                  <p className="mt-1 text-red-800 dark:text-red-200">
                    {problem.category}, {problem.day}. {problem.month}: {problem.lastError}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {problem.state === "conflict" ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          void overwriteBudgetQueueConflict(problem.commandId)
                        }
                      >
                        Zastąp wartością z kolejki
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void retryBudgetQueueRecord(problem.commandId)}
                      >
                        Spróbuj ponownie
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void discardBudgetQueueRecord(problem.commandId)}
                    >
                      Zachowaj wartość z arkusza
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!categories.length ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-3" />
              <span className="text-sm text-muted-foreground">
                {isSalary
                  ? "Ładowanie wynagrodzeń..."
                  : "Ładowanie kategorii..."}
              </span>
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Tags className="size-5" aria-hidden="true" />
                        <span>{isSalary ? "Wynagrodzenie" : "Kategoria"}</span>
                      </FormLabel>
                      <CategoryCombobox
                        categories={normalizedCategories}
                        value={field.value}
                        onChange={field.onChange}
                        onOpenChange={setIsCategoryPickerOpen}
                        placeholder={
                          isSalary
                            ? "Wybierz wynagrodzenie..."
                            : "Wybierz kategorię..."
                        }
                        searchPlaceholder={
                          isSalary
                            ? "Szukaj wynagrodzenia..."
                            : "Szukaj kategorii..."
                        }
                        emptyMessage={
                          isSalary
                            ? "Brak wynagrodzeń dla tego filtra"
                            : "Brak kategorii dla tego filtra"
                        }
                      />
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {!isSalary && selectedCategory && (
                  <div
                    className="rounded-xl border border-border/80 bg-muted/45 p-3"
                    role="region"
                    aria-label="Realizacja planu kategorii"
                    aria-live="polite"
                  >
                    {isCategoryBudgetLoading && !categoryBudgetProgress ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Pobieranie realizacji planu...
                      </div>
                    ) : categoryBudgetProgress ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">
                            Realizacja planu kategorii
                          </p>
                          <p className="shrink-0 text-sm font-semibold tabular-nums">
                            {categoryBudgetProgress.percentage === null
                              ? "Brak planu"
                              : `${percentageFormatter.format(categoryBudgetProgress.percentage)}%`}
                          </p>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Plan</p>
                            <p className="font-medium tabular-nums">
                              {currencyFormatter.format(
                                categoryBudgetProgress.planned
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Wydano
                            </p>
                            <p className="font-medium tabular-nums">
                              {currencyFormatter.format(
                                categoryBudgetProgress.actual
                              )}
                            </p>
                          </div>
                        </div>
                        {categoryBudgetProgress.percentage !== null && (
                          <div
                            className="mt-3 h-2 overflow-hidden rounded-full bg-background"
                            aria-hidden="true"
                          >
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width]",
                                categoryBudgetProgress.state === "over"
                                  ? "bg-red-500"
                                  : categoryBudgetProgress.state === "met"
                                    ? "bg-emerald-500"
                                    : "bg-blue-500"
                              )}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    categoryBudgetProgress.percentage
                                  )
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                        <p
                          className={cn(
                            "mt-2 text-sm font-medium",
                            categoryBudgetProgress.state === "over"
                              ? "text-red-700 dark:text-red-300"
                              : categoryBudgetProgress.state === "under"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-foreground"
                          )}
                        >
                          {categoryBudgetProgress.state === "over"
                            ? `Przekroczono o ${currencyFormatter.format(
                                Math.abs(categoryBudgetProgress.difference)
                              )}`
                            : categoryBudgetProgress.state === "under"
                              ? `Pozostało ${currencyFormatter.format(
                                  categoryBudgetProgress.difference
                                )}`
                              : categoryBudgetProgress.state === "met"
                                ? "Plan wykorzystany w całości"
                                : "Nie zaplanowano wydatków w tej kategorii"}
                        </p>
                      </>
                    ) : categoryBudgetError ? (
                      <p className="text-sm text-red-700 dark:text-red-300">
                        Nie udało się pobrać realizacji planu.
                      </p>
                    ) : null}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <CalendarDays className="size-5" aria-hidden="true" />
                        <span>Dzień</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        onOpenChange={setIsDayPickerOpen}
                      >
                        <FormControl>
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder="Wybierz dzień..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-88 overscroll-contain">
                          {DAY_OPTIONS.map((day) => (
                            <SelectItem
                              key={day}
                              value={day.toString()}
                              className="py-3 text-base"
                            >
                              {day}. {selectedMonth.substring(0, 3)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => {
                    const { ref: fieldRef, ...fieldProps } = field;
                    return (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Banknote className="size-5" aria-hidden="true" />
                          <span>Kwota (PLN)</span>
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            {showDesktopRibbon && (
                              <CalculatorRibbon
                                onInsertSymbol={handleInsertSymbol}
                                disabled={
                                  isLoadingAmount || isEnqueueing
                                }
                              />
                            )}
                            <div className="relative">
                              <Input
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9.,+\-= ]*"
                                placeholder="0.00"
                                enterKeyHint="done"
                                autoComplete="off"
                                autoCorrect="off"
                                ref={(node) => {
                                  priceInputRef.current = node;
                                  fieldRef(node);
                                }}
                                {...fieldProps}
                                onChange={(e) => {
                                  const sanitized = sanitizePriceInput(
                                    e.target.value
                                  );
                                  userEditedPriceRef.current = true;
                                  fieldProps.onChange(sanitized);
                                }}
                                onFocus={() => {
                                  handlePriceFocus();
                                }}
                                onBlur={() => {
                                  fieldProps.onBlur();
                                  handlePriceBlur();
                                }}
                                disabled={isLoadingAmount}
                                className="h-12 text-base pl-4 pr-12 font-medium"
                              />
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                                zł
                              </div>
                              {isLoadingAmount && (
                                <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-blue-500" />
                              )}
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    );
                  }}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isEnqueueing}
                    className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                  >
                    <Save className="size-5" aria-hidden="true" />
                    {isSalary ? "Zapisz wynagrodzenie" : "Zapisz wydatek"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      {showMobileRibbon && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 z-50 px-4"
              style={{
                bottom: `calc(env(safe-area-inset-bottom) + ${keyboardAwareBottom}px)`,
              }}
            >
              <div className="pointer-events-auto mx-auto w-full max-w-md">
                <CalculatorRibbon
                  onInsertSymbol={handleInsertSymbol}
                  disabled={isLoadingAmount || isEnqueueing}
                  className="mb-0 shadow-xl"
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
