import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ExpenseForm } from "./components/ExpenseForm";
import { Login } from "./components/Login";
import "./App.css";

// Hasło można zmienić w pliku .env
const CORRECT_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "budżet2025";
const SESSION_KEY = "budget_app_session";

// Konfiguracja React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minut
      retry: 2,
    },
    mutations: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

function App() {
  // Inicjalizuj state na podstawie localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const session = localStorage.getItem(SESSION_KEY);
    return session === CORRECT_PASSWORD;
  });

  // Pull to refresh - odśwież stronę przez przeciągnięcie w dół
  useEffect(() => {
    let startY = 0;
    let isPulling = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Sprawdź czy scroll jest na samej górze
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop === 0) {
        startY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop === 0) {
        const currentY = e.touches[0].clientY;
        const distance = currentY - startY;

        // Jeśli przeciągnięto w dół o więcej niż 80px
        if (distance > 80 && !isPulling) {
          isPulling = true;
          toast.loading("Odświeżanie...", { id: "refresh" });
        }
      }
    };

    const handleTouchEnd = () => {
      if (isPulling) {
        setTimeout(() => {
          window.location.reload();
        }, 300);
      }
      isPulling = false;
      startY = 0;
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const handleLogin = (password: string) => {
    if (password === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      // Zapisz sesję permanentnie w localStorage
      localStorage.setItem(SESSION_KEY, password);
      toast.success("Zalogowano pomyślnie! 🎉");
    } else {
      toast.error("Nieprawidłowe hasło! Spróbuj ponownie.");
    }
  };

  // Ekran logowania
  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <Toaster position="bottom-center" richColors />
        <Login onLogin={handleLogin} />
      </QueryClientProvider>
    );
  }

  // Główna aplikacja
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="bottom-center" richColors />
      <div className="h-full overflow-y-auto bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div
          className="container mx-auto px-3 sm:px-4 max-w-md"
          style={{
            paddingTop: "max(0.75rem, env(safe-area-inset-top))",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <main>
            <ExpenseForm />
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;
