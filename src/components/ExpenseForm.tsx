import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  getAmount,
  getCurrentMonth,
} from "@/services/googleSheets";
import type { Category } from "@/types/expense";

// Schemat walidacji formularza
const expenseFormSchema = z.object({
  category: z.string().min(1, "Wybierz kategorię"),
  day: z.string().min(1, "Wybierz dzień"),
  price: z
    .string()
    .min(1, "Podaj koszt")
    .refine(
      (val) => {
        // Usuń spacje i zamień przecinek na kropkę
        const cleaned = val.replace(/\s/g, "").replace(/,/g, ".");
        // Sprawdź czy to poprawna liczba lub wyrażenie matematyczne
        return /^[\d.+\-*/()]+$/.test(cleaned);
      },
      { message: "Nieprawidłowy format kwoty" }
    )
    .refine(
      (val) => {
        try {
          // Oblicz wynik wyrażenia
          const cleaned = val.replace(/\s/g, "").replace(/,/g, ".");
          const result = new Function("return " + cleaned)();
          const numResult = parseFloat(result);

          // Sprawdź czy wynik ma maksymalnie 2 miejsca po przecinku
          if (isNaN(numResult)) return false;

          const rounded = Math.round(numResult * 100) / 100;
          return Math.abs(numResult - rounded) < 0.0001; // tolerancja dla błędów zmiennoprzecinkowych
        } catch {
          return false;
        }
      },
      { message: "Wynik obliczeń może mieć maksymalnie 2 miejsca po przecinku" }
    ),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseFormProps {
  onLogout?: () => void;
}

export function ExpenseForm({ onLogout }: ExpenseFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingAmount, setIsLoadingAmount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentMonth] = useState(getCurrentMonth());

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      category: "",
      day: new Date().getDate().toString(),
      price: "",
    },
  });

  // Pobierz kategorie przy montowaniu komponentu (tylko raz!)
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
        setErrorMessage("");
      } catch (error) {
        console.error("Błąd podczas pobierania kategorii:", error);
        const message =
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać kategorii";
        setErrorMessage(message);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []); // Pusty array dependency - wykonaj tylko raz!

  // Pobierz kwotę TYLKO gdy zmieni się kategoria lub dzień (NIE przy wpisywaniu ceny!)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    // Monitoruj TYLKO pola category i day
    const subscription = form.watch((value, { name }) => {
      // Reaguj TYLKO gdy zmienia się category lub day (NIE price!)
      if (name !== "category" && name !== "day") {
        return;
      }

      // Wyczyść poprzedni timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Tylko jeśli kategoria i dzień są wybrane
      if (value.category && value.day) {
        // Opóźnij zapytanie (debouncing)
        timeoutId = setTimeout(async () => {
          setIsLoadingAmount(true);
          try {
            const amount = await getAmount(
              value.category!,
              parseInt(value.day!),
              currentMonth
            );
            // Jeśli jest wartość (> 0), ustaw ją; jeśli 0, wyczyść pole
            if (amount > 0) {
              form.setValue("price", amount.toString());
            } else {
              form.setValue("price", "");
            }
          } catch (error) {
            console.error("Błąd podczas pobierania kwoty:", error);
            // Nie pokazuj błędu użytkownikowi - to opcjonalna funkcja
          } finally {
            setIsLoadingAmount(false);
          }
        }, 300);
      }
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, [form, currentMonth]); // Reaguj TYLKO na kategorie i dzień!

  const onSubmit = async (data: ExpenseFormValues) => {
    setIsSubmitting(true);

    try {
      await addExpense(
        data.category,
        parseInt(data.day),
        data.price,
        currentMonth
      );

      toast.success("Wydatek został dodany pomyślnie! ✓");

      // Resetuj formularz po 1 sekundzie
      setTimeout(() => {
        form.reset({
          category: "",
          day: new Date().getDate().toString(),
          price: "",
        });
      }, 1000);
    } catch (error) {
      console.error("Błąd podczas dodawania wydatku:", error);

      // Wyświetl szczegółowy komunikat błędu
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Nie udało się dodać wydatku. Sprawdź konfigurację.";

      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generuj opcje dni (1-31)
  const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <>
      {onLogout && (
        <header className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              💰 Budżet
            </h1>
            <button
              onClick={onLogout}
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-white/50 transition-all active:scale-95 touch-manipulation"
              title="Wyloguj się"
            >
              🚪 Wyloguj
            </button>
          </div>
          <p className="text-sm text-gray-600 text-center">
            Zarządzaj wydatkami
          </p>
        </header>
      )}
      <Card className="w-full shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-2xl">💸 Dodaj wydatek</CardTitle>
          <CardDescription>
            {currentMonth} {new Date().getFullYear()}
          </CardDescription>
        </CardHeader>
      <CardContent className="pt-3">
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

        {isLoadingCategories ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-3" />
            <span className="text-sm text-gray-600">
              Ładowanie kategorii...
            </span>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <span className="text-lg">🏷️</span>
                      <span>Kategoria</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Wybierz kategorię..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[400px]">
                        {categories.map((categoryGroup) => {
                          const categoryName = Object.keys(categoryGroup)[0];
                          const subcategories = categoryGroup[categoryName];

                          return (
                            <div key={categoryName}>
                              <div className="px-3 py-2 text-xs font-bold text-gray-500 bg-gray-50 uppercase tracking-wide sticky top-0">
                                {categoryName}
                              </div>
                              {subcategories.map((subcategory) => (
                                <SelectItem
                                  key={subcategory}
                                  value={subcategory}
                                  className="py-3"
                                >
                                  {subcategory}
                                </SelectItem>
                              ))}
                            </div>
                          );
                        })}
                      </SelectContent>
                    </Select>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Wybierz dzień..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[400px]">
                        {dayOptions.map((day) => (
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <span className="text-lg">💵</span>
                      <span>Kwota (PLN)</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="tel"
                          pattern="[0-9.,+\-*/()]*"
                          placeholder="0.00 lub 49.99+20"
                          {...field}
                          onChange={(e) => {
                            let value = e.target.value;
                            // Zamień przecinek na kropkę
                            value = value.replace(/,/g, ".");
                            // Zezwalaj na cyfry, kropkę, operatory matematyczne i nawiasy
                            value = value.replace(/[^\d.+\-*/()]/g, "");
                            field.onChange(value);
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
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Dodawanie...
                  </>
                ) : (
                  <>
                    <span className="text-lg mr-2">💾</span>
                    Zapisz wydatek
                  </>
                )}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
    </>
  );
}
