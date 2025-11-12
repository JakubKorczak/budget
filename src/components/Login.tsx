import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

interface LoginProps {
  onLogin: (password: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Podaj hasło");
      return;
    }
    onLogin(password);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            🔐 Budżet Domowy
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Zaloguj się, aby kontynuować
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-base font-semibold">
                🔑 Hasło
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="Wpisz hasło dostępu"
                className="h-12 text-base"
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                  <span>⚠️</span>
                  <span>{error}</span>
                </p>
              )}
            </div>
            <Button type="submit" className="w-full h-12 text-base">
              <span className="text-lg mr-2">🚀</span>
              Zaloguj się
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
