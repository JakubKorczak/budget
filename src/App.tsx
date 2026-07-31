import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import "./App.css";

import { ExpenseForm } from "./components/ExpenseForm";
import { Login } from "./components/Login";
import { ThemeToggle } from "./components/ThemeToggle";
import type { BudgetEntryType } from "./services/googleSheets";
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

// Konfiguracja React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minut
      retry: 3,
    },
    mutations: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

function App() {
  const [theme, setTheme] = useState<AppTheme>(getPreferredTheme);
  const [entryType, setEntryType] = useState<BudgetEntryType>("expense");

  // Inicjalizuj state na podstawie localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const session = localStorage.getItem(SESSION_KEY);
    return session === CORRECT_PASSWORD;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
      <div className="h-full overflow-y-auto bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 text-foreground transition-colors dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
        <div
          className="container mx-auto px-3 sm:px-4 max-w-md"
          style={{
            paddingTop: "8px",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <main>
            <ExpenseForm
              key={entryType}
              entryType={entryType}
              onEntryTypeToggle={handleEntryTypeToggle}
              theme={theme}
              onThemeToggle={handleThemeToggle}
            />
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;
