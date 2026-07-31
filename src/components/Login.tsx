import { useState } from "react";
import { CircleAlert, KeyRound, LockKeyhole, LogIn } from "lucide-react";
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
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4 text-foreground transition-colors dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="mb-2 flex items-center justify-center gap-3 text-3xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400">
            <LockKeyhole
              className="size-8 shrink-0 text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            />
            <span>Budżet Domowy</span>
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Zaloguj się, aby kontynuować
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-base font-semibold">
                <span className="flex items-center gap-2">
                  <KeyRound className="size-5" aria-hidden="true" />
                  Hasło
                </span>
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
                <p className="text-sm text-destructive mt-1 flex items-center gap-2">
                  <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}
            </div>
            <Button type="submit" className="w-full h-12 text-base">
              <LogIn className="size-5" aria-hidden="true" />
              Zaloguj się
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
