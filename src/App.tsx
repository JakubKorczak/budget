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
    <div className="flex items-center h-full overflow-y-auto bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-3 py-3 sm:px-4 sm:py-4 max-w-md">
        <main>
          <ExpenseForm />
        </main>
      </div>
    </div>
  );
}

export default App;
