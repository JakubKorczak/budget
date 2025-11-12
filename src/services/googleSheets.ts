import axios from "axios";
import type { Category } from "@/types/expense";
import { MONTHS } from "@/types/expense";

const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SPREADSHEET_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

/**
 * Pobiera kategorie z arkusza "Wzorzec kategorii"
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const range = "Wzorzec kategorii!B34:B213";
    const url = `${BASE_URL}/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;

    const response = await axios.get(url);
    const values = response.data.values || [];

    // Spłaszczamy wartości
    const valuesFlat = values.flat();

    // Znajdujemy kategorie główne
    const categories: string[] = [];
    for (let i = 0; i < valuesFlat.length; i++) {
      if (valuesFlat[i] === "nazwa kategorii") {
        categories.push(valuesFlat[i + 1]);
      }
    }

    // Budujemy strukturę kategorii z podkategoriami
    const result: Category[] = [];
    let currentCategory: Category | null = null;

    values.forEach((item: string[]) => {
      const entry = item[0]?.trim();

      if (!entry || entry === "." || entry === "nazwa kategorii") return;

      if (categories.includes(entry)) {
        currentCategory = { [entry]: [] };
        result.push(currentCategory);
      } else if (currentCategory) {
        const categoryName = Object.keys(currentCategory)[0];
        currentCategory[categoryName].push(entry);
      }
    });

    return result;
  } catch (error) {
    console.error("Error fetching categories:", error);

    // Sprawdź czy to błąd 429 (rate limit)
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      throw new Error(
        "Przekroczono limit zapytań do Google Sheets API.\n\n" +
          "Odczekaj chwilę i odśwież stronę.\n" +
          "Limit: 100 zapytań / 100 sekund"
      );
    }

    throw new Error("Nie udało się pobrać kategorii");
  }
}

/**
 * Pobiera aktualną wartość dla danej kategorii i dnia
 */
export async function getAmount(
  category: string,
  day: number,
  month: string
): Promise<number> {
  try {
    // Najpierw pobieramy wszystkie kategorie z arkusza miesiąca
    const categoriesRange = `${month}!B79:B257`;
    const url = `${BASE_URL}/${SPREADSHEET_ID}/values/${categoriesRange}?key=${API_KEY}`;

    const response = await axios.get(url);
    const categoryValues = response.data.values?.flat() || [];

    // Znajdujemy wiersz kategorii
    const categoryRowIndex = categoryValues.indexOf(category.trim()) + 79;

    if (categoryRowIndex === 78) {
      throw new Error("Kategoria nie znaleziona");
    }

    // Obliczamy kolumnę na podstawie dnia (kolumna I = dzień 1, czyli indeks 9)
    const dayColumnLetter = String.fromCharCode(72 + day); // H=72, I=73 (dzień 1)
    const valueRange = `${month}!${dayColumnLetter}${categoryRowIndex}`;

    const valueUrl = `${BASE_URL}/${SPREADSHEET_ID}/values/${valueRange}?key=${API_KEY}`;
    const valueResponse = await axios.get(valueUrl);

    const amount = valueResponse.data.values?.[0]?.[0] || 0;
    // Zamień przecinek na kropkę przed parsowaniem (Google Sheets zwraca tekst z przecinkiem)
    const cleanAmount =
      typeof amount === "string" ? amount.replace(/,/g, ".") : amount;
    const numericAmount =
      typeof cleanAmount === "number"
        ? cleanAmount
        : parseFloat(cleanAmount) || 0;
    // Formatuj do 2 miejsc po przecinku
    return parseFloat(numericAmount.toFixed(2));
  } catch (error) {
    console.error("Error fetching amount:", error);
    throw error;
  }
}

/**
 * Bezpieczne obliczenie wyrażenia matematycznego
 * Obsługuje podstawowe operacje: +, -, *, /
 */
function safeEval(expression: string): number {
  // Usuń spacje i zamień przecinki na kropki
  const cleaned = expression.replace(/\s/g, "").replace(/,/g, ".");

  // Sprawdź czy to prosta liczba
  const simpleNumber = parseFloat(cleaned);
  if (!isNaN(simpleNumber) && cleaned === simpleNumber.toString()) {
    return simpleNumber;
  }

  // Sprawdź czy zawiera tylko dozwolone znaki (cyfry i operatory)
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) {
    throw new Error("Nieprawidłowe wyrażenie matematyczne");
  }

  try {
    // Bezpieczniejsza alternatywa dla eval - Function constructor
    const result = new Function("return " + cleaned)();
    return parseFloat(result);
  } catch {
    throw new Error("Błąd podczas obliczania wyrażenia");
  }
}

/**
 * Dodaje wydatek do arkusza
 * UWAGA: Google Sheets API w trybie read-only (z API key) nie pozwala na zapis.
 * Do zapisu potrzebny jest OAuth 2.0. Ta funkcja jest przygotowana,
 * ale wymaga implementacji backendu z OAuth lub użycia Google Apps Script.
 */
export async function addExpense(
  category: string,
  day: number,
  price: string,
  month: string
): Promise<void> {
  try {
    // Konwertujemy cenę (obsługujemy przecinki i wyrażenia matematyczne)
    const amount = safeEval(price);

    // Zaokrąglij do 2 miejsc po przecinku
    const roundedAmount = Math.round(amount * 100) / 100;

    // Ta funkcja wymaga OAuth 2.0 - należy zaimplementować backend
    // lub użyć Google Apps Script jako proxy

    // Przykładowa implementacja z Apps Script:
    const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

    if (!APPS_SCRIPT_URL) {
      console.warn("Apps Script URL nie jest skonfigurowany");
      throw new Error(
        "Brak konfiguracji Apps Script URL.\n\n" +
          "Aby zapisywać wydatki, musisz skonfigurować Google Apps Script:\n" +
          "1. Zobacz instrukcje w QUICK-START.md (Krok 3)\n" +
          "2. Dodaj VITE_APPS_SCRIPT_URL do pliku .env"
      );
    }

    // Używamy GET aby uniknąć problemów z CORS
    const params = new URLSearchParams({
      action: "addExpense",
      category,
      day: day.toString(),
      amount: roundedAmount.toFixed(2),
      month,
    });

    const response = await axios.get(`${APPS_SCRIPT_URL}?${params.toString()}`);

    // Sprawdź czy odpowiedź ma poprawny format
    if (!response.data) {
      throw new Error("Brak odpowiedzi z Apps Script");
    }

    // Sprawdź czy operacja się powiodła
    if (response.data.success === false || response.data.error) {
      throw new Error(
        response.data.error || "Nieznany błąd podczas dodawania wydatku"
      );
    }

    // Jeśli nie ma success: true, ale też nie ma error, zakładamy sukces
    if (response.data.success !== true && !response.data.message) {
      console.warn("Nieoczekiwany format odpowiedzi:", response.data);
    }
  } catch (error) {
    console.error("Error adding expense:", error);
    if (error instanceof Error) {
      throw error; // Przekaż oryginalny błąd z opisem
    }
    throw new Error("Nie udało się dodać wydatku");
  }
}

/**
 * Pobiera aktualny miesiąc (nazwa po polsku)
 */
export function getCurrentMonth(): string {
  const monthIndex = new Date().getMonth();
  return MONTHS[monthIndex];
}
