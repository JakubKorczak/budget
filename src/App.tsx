import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { PlusCircle, WalletCards } from "lucide-react";
import "./App.css";

import { ExpenseForm } from "./components/ExpenseForm";
import { Login } from "./components/Login";
import { MonthDashboard } from "./components/MonthDashboard";
import { ThemeToggle } from "./components/ThemeToggle";
import type { BudgetEntryType } from "./services/googleSheets";
import {
  startBudgetQueueSync,
  subscribeBudgetQueue,
  type BudgetQueueSnapshot,
} from "./services/budgetQueue";
import {
  applyTheme,
  getPreferredTheme,
  getStoredTheme,
  THEME_STORAGE_KEY,
  type AppTheme,
} from "./lib/theme";

// Hasło można zmienić w pliku .env
const CORRECT_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "budżet2025";
const SESSION_KEY = "budget_app_session";
const EMPTY_QUEUE_SNAPSHOT: BudgetQueueSnapshot = {
  pending: 0,
  syncing: 0,
  problems: [],
  offline: typeof navigator !== "undefined" && !navigator.onLine,
};

// Konfiguracja React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minut
      retry: 3,
    },
  },
});

function App() {
  const [theme, setTheme] = useState<AppTheme>(getPreferredTheme);
  const [entryType, setEntryType] = useState<BudgetEntryType>("expense");
  const [activeView, setActiveView] = useState<"entry" | "month">("entry");
  const [queueSnapshot, setQueueSnapshot] = useState<BudgetQueueSnapshot>(
    EMPTY_QUEUE_SNAPSHOT
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Inicjalizuj state na podstawie localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const session = localStorage.getItem(SESSION_KEY);
    return session === CORRECT_PASSWORD;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    return startBudgetQueueSync();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribeBudgetQueue(setQueueSnapshot);
  }, [isAuthenticated]);

  useEffect(() => {
    if (getStoredTheme()) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (getStoredTheme()) {
        return;
      }
      setTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const handleThemeToggle = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      return nextTheme;
    });
  };

  const handleEntryTypeToggle = () => {
    setEntryType((currentType) =>
      currentType === "expense" ? "salary" : "expense"
    );
  };

  const handleLogin = (password: string) => {
    if (password === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      // Zapisz sesję permanentnie w localStorage
      localStorage.setItem(SESSION_KEY, password);
      toast.success("Zalogowano pomyślnie!");
    } else {
      toast.error("Nieprawidłowe hasło! Spróbuj ponownie.");
    }
  };

  // Ekran logowania
  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <Toaster position="bottom-center" richColors theme={theme} />
        <div className="relative h-full">
          <ThemeToggle
            theme={theme}
            onToggle={handleThemeToggle}
            className="fixed top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-20"
          />
          <Login onLogin={handleLogin} />
        </div>
      </QueryClientProvider>
    );
  }

  // Główna aplikacja
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="bottom-center" richColors theme={theme} />
      <div
        ref={scrollContainerRef}
        className="budget-app-shell h-full overflow-y-auto bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 text-foreground transition-colors dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950"
      >
        <div className="budget-app-viewport budget-app-viewport-with-nav mx-auto w-full max-w-[440px]">
          <main className="w-full">
            {activeView === "entry" ? (
              <ExpenseForm
                key={entryType}
                entryType={entryType}
                onEntryTypeToggle={handleEntryTypeToggle}
                theme={theme}
                onThemeToggle={handleThemeToggle}
                queueSnapshot={queueSnapshot}
                scrollContainerRef={scrollContainerRef}
              />
            ) : (
              <MonthDashboard
                theme={theme}
                onThemeToggle={handleThemeToggle}
                queueSnapshot={queueSnapshot}
                onOpenEntries={() => setActiveView("entry")}
                scrollContainerRef={scrollContainerRef}
              />
            )}
          </main>
          <nav
            aria-label="Główna nawigacja"
            className="budget-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 shadow-[0_-12px_32px_rgba(15,23,42,0.16)] backdrop-blur"
          >
            <div className="mx-auto flex w-full max-w-[440px] gap-1">
              <button
                type="button"
                aria-current={activeView === "entry" ? "page" : undefined}
                onClick={() => setActiveView("entry")}
                className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  activeView === "entry"
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <PlusCircle className="size-5" />
                Dodaj
              </button>
              <button
                type="button"
                aria-current={activeView === "month" ? "page" : undefined}
                onClick={() => setActiveView("month")}
                className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  activeView === "month"
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <WalletCards className="size-5" />
                Ten miesiąc
              </button>
            </div>
          </nav>
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;
