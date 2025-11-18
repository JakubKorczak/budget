import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import { Loader2 } from "lucide-react";
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
  addExpense,
  getCurrentMonth,
  getCachedCategoriesSnapshot,
  getDayAmounts,
  getCachedDayAmountsSnapshot,
  clearCategoriesCache,
  clearAllDayAmountCaches,
  setDayAmountsCache,
  removeDayAmountsCache,
} from "@/services/googleSheets";
import type { DayAmountsMap, AddExpenseResult } from "@/services/googleSheets";
import type { Category } from "@/types/expense";
import { CategoryCombobox } from "@/components/CategoryCombobox";

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

function usePullToRefresh(
  handler: () => void | Promise<void>,
  enabled: boolean,
  threshold = 80
) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let isExecuting = false;

    const handleTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || isExecuting) {
        return;
      }
      startY = event.touches[0]?.clientY ?? 0;
      currentY = startY;
      isPulling = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isPulling || isExecuting) {
        return;
      }
      currentY = event.touches[0]?.clientY ?? 0;
      const delta = currentY - startY;
      if (delta > 0 && window.scrollY <= 0) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling || isExecuting) {
        isPulling = false;
        return;
      }

      const delta = currentY - startY;
      isPulling = false;

      if (delta < threshold || window.scrollY > 0) {
        return;
      }

      isExecuting = true;
      Promise.resolve(handler()).finally(() => {
        isExecuting = false;
      });
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handler, threshold]);
}

const NUMBER_SEGMENT_REGEX = /^\d+(?:\.\d{0,2})?$/;

function tokenizeLinearExpression(
  expression: string
): Array<{ operator: "+" | "-"; value: string }> | null {
  if (!expression?.length) {
    return null;
  }

  const normalized = expression.replace(/,/g, ".").replace(/\s+/g, "");
  if (!/^[0-9.+-]+$/.test(normalized)) {
    return null;
  }

  const tokens: Array<{ operator: "+" | "-"; value: string }> = [];
  let currentNumber = "";
  let operator: "+" | "-" = "+";

  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    if (char === "+" || char === "-") {
      if (currentNumber === "") {
        if (index === 0) {
          operator = char === "+" ? "+" : "-";
          continue;
        }
        return null; // Disallow consecutive operators
      }

      if (!NUMBER_SEGMENT_REGEX.test(currentNumber)) {
        return null;
      }

      tokens.push({ operator, value: currentNumber });
      operator = char === "+" ? "+" : "-";
      currentNumber = "";
      continue;
    }

    if (char === "." && currentNumber.includes(".")) {
      return null;
    }

    currentNumber += char;
  }

  if (currentNumber === "") {
    return null;
  }

  if (!NUMBER_SEGMENT_REGEX.test(currentNumber)) {
    return null;
  }

  tokens.push({ operator, value: currentNumber });
  return tokens;
}

function evaluateLinearExpression(expression: string): number | null {
  const tokens = tokenizeLinearExpression(expression);
  if (!tokens) {
    return null;
  }

  let total = 0;
  for (const token of tokens) {
    const numericValue = parseFloat(token.value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }
    total =
      token.operator === "+" ? total + numericValue : total - numericValue;
  }

  const rounded = Math.round(total * 100) / 100;
  return parseFloat(rounded.toFixed(2));
}

function serializeLinearExpression(expression: string): string | null {
  const tokens = tokenizeLinearExpression(expression);
  if (!tokens) {
    return null;
  }

  return tokens
    .map((token, index) => {
      const prefix =
        index === 0 ? (token.operator === "-" ? "-" : "") : token.operator;
      return `${prefix}${token.value}`;
    })
    .join("");
}

type ParsedPriceInput =
  | { mode: "formula"; formula: string }
  | { mode: "value"; amount: number };

function parsePriceInput(value: string): ParsedPriceInput | null {
  if (!value?.trim().length) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("=")) {
    const expression = trimmed.slice(1);
    const serialized = serializeLinearExpression(expression);
    if (!serialized) {
      return null;
    }
    return { mode: "formula", formula: `=${serialized}` };
  }

  const amount = evaluateLinearExpression(trimmed);
  if (amount === null) {
    return null;
  }

  return { mode: "value", amount };
}

type CalculatorRibbonProps = {
  onInsertSymbol: (symbol: "=" | "+" | "-") => void;
  disabled?: boolean;
};

function CalculatorRibbon({ onInsertSymbol, disabled }: CalculatorRibbonProps) {
  const buttons: Array<{ label: string; value: "=" | "+" | "-" }> = [
    { label: "=", value: "=" },
    { label: "+", value: "+" },
    { label: "-", value: "-" },
  ];

  return (
    <div className="mb-3 flex gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-2">
      {buttons.map((button) => (
        <button
          key={button.value}
          type="button"
          className="flex-1 rounded-xl bg-white py-2 text-lg font-semibold shadow-sm transition hover:bg-gray-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
  price: z
    .string()
    .min(1, "Podaj koszt")
    .superRefine((val, ctx) => {
      if (parsePriceInput(val)) {
        return;
      }

      const isFormula = val.trim().startsWith("=");
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: isFormula
          ? "Formuła może zawierać tylko liczby oraz znaki + lub - (maks. 2 miejsca po przecinku)."
          : "Wpisz poprawne działanie używając cyfr oraz znaków + lub - (maks. 2 miejsca po przecinku).",
      });
    }),
});

const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) =>
  (index + 1).toString()
);

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export function ExpenseForm() {
  const [isLoadingAmount, setIsLoadingAmount] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [dayCacheVersion, setDayCacheVersion] = useState(0);
  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const queryClient = useQueryClient();

  const cachedCategories = useMemo(() => getCachedCategoriesSnapshot(), []);

  const { data: categories = [], error: categoriesError } = useQuery<
    Category[]
  >({
    queryKey: ["categories"],
    queryFn: getCategories,
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
      category: "",
      day: new Date().getDate().toString(),
      price: "",
    },
  });

  const priceInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedCategory, selectedDay] = useWatch({
    control: form.control,
    name: ["category", "day"],
  });

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

  usePreventPullToRefresh(isCategoryPickerOpen || isDayPickerOpen);

  const handlePullRefresh = useCallback(async () => {
    if (isPullRefreshing) {
      return;
    }

    setIsPullRefreshing(true);

    try {
      clearCategoriesCache();
      clearAllDayAmountCaches();

      const parsedDay = selectedDay ? parseInt(selectedDay, 10) : NaN;
      const refreshDayAmounts = Number.isFinite(parsedDay)
        ? (async () => {
            const dayNumber = parsedDay;
            const amounts = await getDayAmounts(currentMonth, dayNumber, {
              forceRefresh: true,
            });

            if (selectedCategory) {
              const entry = amounts[selectedCategory];
              if (entry?.formula) {
                form.setValue("price", entry.formula);
              } else if (entry && entry.amount !== 0) {
                form.setValue("price", entry.amount.toString());
              } else {
                form.setValue("price", "");
              }
            }
          })()
        : Promise.resolve();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
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
    currentMonth,
    form,
    isPullRefreshing,
    queryClient,
    selectedCategory,
    selectedDay,
  ]);

  // TanStack Query mutation dla dodawania wydatków
  const addExpenseMutation = useMutation<
    AddExpenseResult,
    Error,
    {
      category: string;
      day: number;
      price: string;
      month: string;
      rawPrice: string;
      formulaResult: number | null;
    },
    {
      previousCategory: string;
      previousDay: string;
      previousPrice: string;
      previousDaySnapshot: DayAmountsMap | null;
      optimisticDay: number;
      optimisticCategory: string;
      optimisticApplied: boolean;
    }
  >({
    mutationFn: async (data) => {
      return addExpense(data.category, data.day, data.price, data.month);
    },
    onMutate: async (variables) => {
      // Optimistic update - natychmiastowy reset formularza (bez czekania na API)
      form.reset({
        category: "",
        day: new Date().getDate().toString(),
        price: "",
      });

      const dayNumber = variables.day;
      const previousDaySnapshot = getCachedDayAmountsSnapshot(
        currentMonth,
        dayNumber
      );
      const optimisticParse = parsePriceInput(variables.rawPrice);
      const optimisticDelta =
        optimisticParse && optimisticParse.mode === "value"
          ? optimisticParse.amount
          : null;
      let optimisticApplied = false;

      if (optimisticDelta !== null) {
        const nextSnapshot: DayAmountsMap = {
          ...(previousDaySnapshot ?? {}),
        };
        const currentEntry = nextSnapshot[variables.category];
        const currentValue = currentEntry?.amount ?? 0;
        nextSnapshot[variables.category] = {
          amount: parseFloat((currentValue + optimisticDelta).toFixed(2)),
          formula: null,
        };
        setDayAmountsCache(currentMonth, dayNumber, nextSnapshot);
        setDayCacheVersion((version) => version + 1);
        optimisticApplied = true;
      }

      // Zwróć poprzednie dane na wypadek błędu (rollback)
      return {
        previousCategory: variables.category,
        previousDay: variables.day.toString(),
        previousPrice: variables.rawPrice,
        previousDaySnapshot,
        optimisticDay: dayNumber,
        optimisticCategory: variables.category,
        optimisticApplied,
      };
    },
    onSuccess: (result, variables) => {
      if (result.mode === "formula") {
        const computedValue = variables.formulaResult;
        const formattedResult =
          typeof computedValue === "number"
            ? ` (wynik ${computedValue.toFixed(2)} zł)`
            : "";
        toast.success(
          `Dodano formułę ${result.formula} do kategorii ${variables.category}${formattedResult}`
        );
      } else {
        const formattedAmount = result.amount.toFixed(2);
        toast.success(
          `Dodano ${formattedAmount} zł do kategorii ${variables.category}`
        );
      }
      void getDayAmounts(currentMonth, variables.day, { forceRefresh: true });
      setDayCacheVersion((version) => version + 1);
    },
    onError: (error: Error, _variables, context) => {
      // Rollback - przywróć dane w razie błędu
      if (context) {
        form.setValue("category", context.previousCategory);
        form.setValue("day", context.previousDay);
        form.setValue("price", context.previousPrice);
      }
      if (context?.optimisticApplied) {
        if (context.previousDaySnapshot) {
          setDayAmountsCache(
            currentMonth,
            context.optimisticDay,
            context.previousDaySnapshot
          );
        } else {
          removeDayAmountsCache(currentMonth, context.optimisticDay);
        }
        setDayCacheVersion((version) => version + 1);
      }
      toast.error(error.message || "Nie udało się dodać wydatku");
    },
    retry: 3,
    retryDelay: (attemptIndex) => {
      toast.loading(`Ponowna próba... (${attemptIndex + 1}/3)`, {
        id: "retry",
      });
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
  });

  const { mutate: mutateExpense, isPending: isAddExpensePending } =
    addExpenseMutation;

  usePullToRefresh(
    handlePullRefresh,
    !isCategoryPickerOpen && !isDayPickerOpen && !isAddExpensePending
  );

  const onSubmit = useCallback(
    async (data: ExpenseFormValues) => {
      if (isAddExpensePending) {
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

      const normalizedPrice =
        parsed.mode === "value" ? parsed.amount.toFixed(2) : parsed.formula;

      const formulaResult =
        parsed.mode === "formula"
          ? evaluateLinearExpression(parsed.formula.slice(1))
          : null;

      mutateExpense({
        category: data.category,
        day: parseInt(data.day, 10),
        price: normalizedPrice,
        rawPrice: data.price,
        month: currentMonth,
        formulaResult,
      });
    },
    [currentMonth, form, isAddExpensePending, mutateExpense]
  );

  useEffect(() => {
    let isActive = true;

    const hydrateAmount = async () => {
      if (!selectedDay) {
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
        currentMonth,
        dayNumber
      );

      const applyAmount = (amounts: DayAmountsMap | null) => {
        if (!amounts || !selectedCategory) {
          return;
        }
        const entry = amounts[selectedCategory];
        if (!entry) {
          form.setValue("price", "");
          return;
        }

        if (entry.formula) {
          form.setValue("price", entry.formula);
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
        const dayAmounts = await getDayAmounts(currentMonth, dayNumber);
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
  }, [selectedCategory, selectedDay, currentMonth, form, dayCacheVersion]);

  return (
    <>
      <Card className="w-full shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl">💸 Dodaj wydatek</CardTitle>
          <CardDescription>
            {currentMonth} {new Date().getFullYear()}
          </CardDescription>
          {isPullRefreshing && (
            <div className="mt-2 flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Odświeżanie danych...
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
              <div className="flex items-start">
                <span className="text-red-500 text-xl mr-3">⚠️</span>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">
                    Błąd konfiguracji
                  </h3>
                  <p className="text-sm text-red-700 whitespace-pre-line">
                    {errorMessage}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-2 text-sm text-red-700 underline hover:no-underline"
                  >
                    🔄 Odśwież stronę
                  </button>
                </div>
              </div>
            </div>
          )}

          {!categories.length ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-3" />
              <span className="text-sm text-gray-600">
                Ładowanie kategorii...
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
                        <span className="text-lg">🏷️</span>
                        <span>Kategoria</span>
                      </FormLabel>
                      <CategoryCombobox
                        categories={normalizedCategories}
                        value={field.value}
                        onChange={field.onChange}
                        onOpenChange={setIsCategoryPickerOpen}
                      />
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <span className="text-lg">📅</span>
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
                              {day}. {currentMonth.substring(0, 3)}
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
                          <span className="text-lg">💵</span>
                          <span>Kwota (PLN)</span>
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <CalculatorRibbon
                              onInsertSymbol={handleInsertSymbol}
                              disabled={isLoadingAmount || isAddExpensePending}
                            />
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
                                  fieldProps.onChange(sanitized);
                                }}
                                disabled={isLoadingAmount}
                                className="h-12 text-base pl-4 pr-12 font-medium"
                              />
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
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
                    className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                  >
                    <span className="text-lg mr-2">💾</span>
                    Zapisz wydatek
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
