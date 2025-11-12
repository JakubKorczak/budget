import { useState } from "react";
import { ExpenseForm } from "./components/ExpenseForm";
import { Login } from "./components/Login";
import "./App.css";

// Hasło można zmienić w pliku .env
const CORRECT_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "budżet2025";
const SESSION_KEY = "budget_app_session";

function App() {
  // Inicjalizuj state na podstawie sessionStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const session = sessionStorage.getItem(SESSION_KEY);
    return session === CORRECT_PASSWORD;
  });

  const handleLogin = (password: string) => {
    if (password === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      // Zapisz sesję (działa tylko do zamknięcia przeglądarki)
      sessionStorage.setItem(SESSION_KEY, password);
    } else {
      alert("❌ Nieprawidłowe hasło! Spróbuj ponownie.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem(SESSION_KEY);
  };

  // Ekran logowania
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Główna aplikacja
  return (
    <div className="h-screen overflow-auto bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 max-w-md">
        <header className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              💰 Budżet
            </h1>
            <button
              onClick={handleLogout}
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
        <main>
          <ExpenseForm />
        </main>
      </div>
    </div>
  );
}

export default App;
