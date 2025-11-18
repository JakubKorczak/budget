import axios from "axios";
import type { Category } from "@/types/expense";
import { MONTHS } from "@/types/expense";

const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SPREADSHEET_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

type SheetRowData = {
  values?: Array<{ formattedValue?: string }>;
};

interface CategoryGridCacheEntry {
  startRow: number;
  rowData: SheetRowData[];
  snapshot: Array<{ row: number; value: string | null }>;
}

export type DayAmountEntry = {
  amount: number;
  formula: string | null;
};

export type DayAmountsMap = Record<string, DayAmountEntry>;
export type AddExpenseResult =
  | { mode: "value"; amount: number }
  | { mode: "formula"; formula: string };

interface DayAmountsCacheEntry {
  timestamp: number;
  month: string;
  day: number;
  data: DayAmountsMap;
}

const categoryGridCache = new Map<string, CategoryGridCacheEntry>();
const categoryRowValuesCache = new Map<string, (string | number | null)[]>();

const CATEGORY_CACHE_KEY = "budget:categories:v2";
const CATEGORY_CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

const DAY_AMOUNTS_CACHE_PREFIX = "budget:day-amounts";
const DAY_AMOUNTS_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 godzin

function isValidCategoryCache(data: Category[] | null | undefined): boolean {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  return data.every((group) => {
    if (!group || typeof group !== "object") {
      return false;
    }
    const keys = Object.keys(group);
    if (keys.length !== 1) {
      return false;
    }
    const subcategories = group[keys[0]];
    return Array.isArray(subcategories);
  });
}

function readCategoriesCache(): Category[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const payload = window.localStorage.getItem(CATEGORY_CACHE_KEY);
    if (!payload) {
      return null;
    }

    const parsed = JSON.parse(payload) as {
      timestamp?: number;
      data?: Category[];
    } | null;

    if (!parsed || typeof parsed.timestamp !== "number" || !parsed.data) {
      return null;
    }

    if (Date.now() - parsed.timestamp > CATEGORY_CACHE_TTL) {
      window.localStorage.removeItem(CATEGORY_CACHE_KEY);
      return null;
    }

    if (!isValidCategoryCache(parsed.data)) {
      window.localStorage.removeItem(CATEGORY_CACHE_KEY);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.warn("[Sheets] Nie udało się odczytać cache kategorii", error);
    return null;
  }
}

function writeCategoriesCache(data: Category[]): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!isValidCategoryCache(data)) {
    return;
  }

  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      data,
    });
    window.localStorage.setItem(CATEGORY_CACHE_KEY, payload);
  } catch (error) {
    console.warn("[Sheets] Nie udało się zapisać cache kategorii", error);
  }
}

export function getCachedCategoriesSnapshot(): Category[] | null {
  return readCategoriesCache();
}

export function clearCategoriesCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(CATEGORY_CACHE_KEY);
  } catch (error) {
    console.warn("[Sheets] Nie udało się wyczyścić cache kategorii", error);
  }
}

function buildDayAmountsCacheKey(month: string, day: number): string {
  return `${DAY_AMOUNTS_CACHE_PREFIX}:${month}:${day}`;
}

function readDayAmountsCache(
  month: string,
  day: number
): DayAmountsCacheEntry | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = buildDayAmountsCacheKey(month, day);
  try {
    const payload = window.localStorage.getItem(key);
    if (!payload) {
      return null;
    }
    const parsed = JSON.parse(payload) as DayAmountsCacheEntry | null;
    if (!parsed || typeof parsed.timestamp !== "number" || !parsed.data) {
      window.localStorage.removeItem(key);
      return null;
    }

    if (Date.now() - parsed.timestamp > DAY_AMOUNTS_CACHE_TTL) {
      window.localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("[Sheets] Nie udało się odczytać cache dziennych kwot", error);
    return null;
  }
}

function purgeOtherDayAmountCaches(keepKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(DAY_AMOUNTS_CACHE_PREFIX) && key !== keepKey) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.warn("[Sheets] Nie udało się wyczyścić starych cache dnia", error);
  }
}

export function clearAllDayAmountCaches(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(DAY_AMOUNTS_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.warn(
      "[Sheets] Nie udało się wyczyścić cache dziennych kwot",
      error
    );
  }
}

function writeDayAmountsCache(
  month: string,
  day: number,
  data: DayAmountsMap
): void {
  if (typeof window === "undefined") {
    return;
  }

  const key = buildDayAmountsCacheKey(month, day);
  try {
    const payload: DayAmountsCacheEntry = {
      timestamp: Date.now(),
      month,
      day,
      data,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
    purgeOtherDayAmountCaches(key);
  } catch (error) {
    console.warn("[Sheets] Nie udało się zapisać cache dziennych kwot", error);
  }
}

export function setDayAmountsCache(
  month: string,
  day: number,
  data: DayAmountsMap
): void {
  writeDayAmountsCache(month, day, data);
}

export function removeDayAmountsCache(month: string, day: number): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const key = buildDayAmountsCacheKey(month, day);
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("[Sheets] Nie udało się usunąć cache dnia", error);
  }
}

export function getCachedDayAmountsSnapshot(
  month: string,
  day: number
): DayAmountsMap | null {
  return readDayAmountsCache(month, day)?.data ?? null;
}

function normalizeAmountValue(
  value: string | number | null | undefined
): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const cleanValue =
    typeof value === "string"
      ? value.replace(/\s/g, "").replace(/,/g, ".")
      : value;

  const numeric =
    typeof cleanValue === "number" ? cleanValue : parseFloat(cleanValue);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return parseFloat(numeric.toFixed(2));
}

async function fetchDayAmountsFromSheet(
  month: string,
  day: number
): Promise<DayAmountsMap> {
  const { rowData, startRow } = await getCategoryGrid(month);
  if (!rowData.length) {
    return {};
  }

  const dayIndex = Math.max(1, Math.min(31, day));
  const dayColumnIndex = 8 + (dayIndex - 1);
  const columnLetter = getColumnLetter(dayColumnIndex);
  const endRow = startRow + rowData.length - 1;
  const dayRange = `${month}!${columnLetter}${startRow}:${columnLetter}${endRow}`;
  const valuesUrl = `${BASE_URL}/${SPREADSHEET_ID}/values/${dayRange}?valueRenderOption=UNFORMATTED_VALUE&key=${API_KEY}`;
  const formulaUrl = `${BASE_URL}/${SPREADSHEET_ID}/values/${dayRange}?valueRenderOption=FORMULA&key=${API_KEY}`;

  const [valuesResponse, formulaResponse] = await Promise.all([
    axios.get(valuesUrl),
    axios.get(formulaUrl),
  ]);

  const values: Array<Array<string | number>> =
    valuesResponse.data.values || [];
  const formulas: Array<Array<string | number>> =
    formulaResponse.data.values || [];
  const dayAmounts: DayAmountsMap = {};

  for (let idx = 0; idx < rowData.length; idx++) {
    const label = rowData[idx]?.values?.[0]?.formattedValue?.trim();
    if (!label) {
      continue;
    }
    const rawAmount = values[idx]?.[0] ?? 0;
    const rawFormula = formulas[idx]?.[0];
    const formulaString =
      typeof rawFormula === "string" && rawFormula.startsWith("=")
        ? rawFormula
        : null;
    dayAmounts[label] = {
      amount: normalizeAmountValue(rawAmount),
      formula: formulaString,
    };
  }

  return dayAmounts;
}

export async function getDayAmounts(
  month: string,
  day: number,
  options?: { forceRefresh?: boolean }
): Promise<DayAmountsMap> {
  if (!Number.isFinite(day)) {
    return {};
  }

  if (!options?.forceRefresh) {
    const cached = readDayAmountsCache(month, day);
    if (cached) {
      return cached.data;
    }
  }

  const fetched = await fetchDayAmountsFromSheet(month, day);
  writeDayAmountsCache(month, day, fetched);
  return fetched;
}

export function incrementDayAmountCache(
  month: string,
  day: number,
  category: string,
  delta: number
): void {
  if (!Number.isFinite(delta) || !category) {
    return;
  }

  const existing = readDayAmountsCache(month, day);
  if (!existing) {
    return;
  }

  const nextData: DayAmountsMap = { ...existing.data };
  const currentEntry = nextData[category];
  const currentValue = currentEntry?.amount ?? 0;
  const updatedValue = parseFloat((currentValue + delta).toFixed(2));
  nextData[category] = {
    amount: updatedValue,
    formula: null,
  };
  writeDayAmountsCache(month, day, nextData);
}

/**
 * Pobiera kategorie z arkusza "Wzorzec kategorii"
 */
export async function getCategories(): Promise<Category[]> {
  const cached = readCategoriesCache();
  if (cached) {
    return cached;
  }

  try {
    const range = "Wzorzec kategorii!B34:B213";
    const url = `${BASE_URL}/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;

    const response = await axios.get(url);
    const values = response.data.values || [];

    // Budujemy strukturę kategorii z podkategoriami
    const result: Category[] = [];
    let currentCategory: Category | null = null;
    let expectCategoryName = false;

    values.forEach((row: string[]) => {
      const entry = row[0]?.trim();

      if (!entry || entry === ".") {
        return;
      }

      if (entry === "nazwa kategorii") {
        expectCategoryName = true;
        currentCategory = null;
        return;
      }

      if (expectCategoryName) {
        currentCategory = { [entry]: [] };
        result.push(currentCategory);
        expectCategoryName = false;
        return;
      }

      if (!currentCategory) {
        return;
      }

      const categoryName = Object.keys(currentCategory)[0];
      currentCategory[categoryName].push(entry);
    });

    if (!result.length) {
      throw new Error("Nie znaleziono żadnych kategorii w arkuszu");
    }

    writeCategoriesCache(result);
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

async function getCategoryGrid(month: string): Promise<CategoryGridCacheEntry> {
  const cached = categoryGridCache.get(month);
  if (cached) {
    return cached;
  }

  const categoriesRange = `${month}!B79:B257`;
  const encodedRange = encodeURIComponent(categoriesRange);
  const gridUrl = `${BASE_URL}/${SPREADSHEET_ID}?ranges=${encodedRange}&includeGridData=true&fields=sheets(properties(title),data(rowData(values(formattedValue))))&key=${API_KEY}`;

  const response = await axios.get(gridUrl);
  const sheetData = (response.data.sheets || []).find(
    (sheet: { properties?: { title?: string } }) =>
      sheet?.properties?.title === month
  );
  const gridData = sheetData?.data?.[0];
  const rowData: SheetRowData[] = gridData?.rowData || [];

  if (!sheetData || !rowData.length) {
    throw new Error("Nie udało się pobrać kategorii dla wybranego miesiąca");
  }

  const startRowMatch = categoriesRange.match(/![A-Z]+(\d+)/i);
  const startRow = startRowMatch ? parseInt(startRowMatch[1], 10) : 79;

  const snapshot = rowData.map((row, idx) => ({
    row: startRow + idx,
    value: row?.values?.[0]?.formattedValue ?? null,
  }));

  console.log("[Sheets] Kategorie w zakresie", categoriesRange, snapshot);

  const entry: CategoryGridCacheEntry = {
    startRow,
    rowData,
    snapshot,
  };
  categoryGridCache.set(month, entry);
  return entry;
}

function buildRowCacheKey(month: string, rowIndex: number) {
  return `${month}:${rowIndex}`;
}

async function getCategoryRowValues(
  month: string,
  rowIndex: number,
  signal?: AbortSignal
): Promise<(string | number | null)[]> {
  const cacheKey = buildRowCacheKey(month, rowIndex);
  const cached = categoryRowValuesCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const dayColumns = 31;
  const startColumnIndex = 8; // kolumna I
  const endColumnIndex = startColumnIndex + dayColumns - 1; // kolumna dla dnia 31
  const startColumn = getColumnLetter(startColumnIndex);
  const endColumn = getColumnLetter(endColumnIndex);
  const rowRange = `${month}!${startColumn}${rowIndex}:${endColumn}${rowIndex}`;
  const url = `${BASE_URL}/${SPREADSHEET_ID}/values/${rowRange}?key=${API_KEY}`;
  const response = await axios.get(url, { signal });
  const values: (string | number | null)[] = response.data.values?.[0] || [];
  categoryRowValuesCache.set(cacheKey, values);
  return values;
}

function invalidateMonthCache(month: string) {
  categoryGridCache.delete(month);
  for (const key of categoryRowValuesCache.keys()) {
    if (key.startsWith(`${month}:`)) {
      categoryRowValuesCache.delete(key);
    }
  }
}

/**
 * Konwertuje indeks kolumny (0-based) na nazwę kolumny Excel (A, B, ..., Z, AA, AB, ...)
 * Przykład: 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB
 */
function getColumnLetter(index: number): string {
  let columnLetter = "";
  let tempIndex = index;

  while (tempIndex >= 0) {
    columnLetter = String.fromCharCode((tempIndex % 26) + 65) + columnLetter;
    tempIndex = Math.floor(tempIndex / 26) - 1;
  }

  return columnLetter;
}

/**
 * Pobiera aktualną wartość dla danej kategorii i dnia
 */
export async function getAmount(
  category: string,
  day: number,
  month: string,
  signal?: AbortSignal
): Promise<number> {
  try {
    const { rowData, startRow } = await getCategoryGrid(month);
    const normalizedCategory = category.trim().toLowerCase();

    let categoryRowIndex = -1;
    for (let i = 0; i < rowData.length; i++) {
      const cellValue = rowData[i]?.values?.[0]?.formattedValue?.trim();
      if (cellValue && cellValue.toLowerCase() === normalizedCategory) {
        categoryRowIndex = startRow + i;
        break;
      }
    }

    if (categoryRowIndex === -1) {
      throw new Error("Kategoria nie znaleziona");
    }

    const rowValues = await getCategoryRowValues(
      month,
      categoryRowIndex,
      signal
    );
    const dayOffset = day - 1;
    const amount = rowValues[dayOffset] ?? 0;
    return normalizeAmountValue(amount);
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
): Promise<AddExpenseResult> {
  try {
    const trimmedPrice = price.trim();
    const isFormula = trimmedPrice.startsWith("=");
    let roundedAmount: number | null = null;

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
      month,
    });

    if (isFormula) {
      params.set("mode", "formula");
      params.set("formula", trimmedPrice);
    } else {
      const amount = safeEval(trimmedPrice);
      roundedAmount = Math.round(amount * 100) / 100;
      params.set("mode", "value");
      params.set("amount", roundedAmount.toFixed(2));
    }

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
    invalidateMonthCache(month);
    return isFormula && trimmedPrice
      ? { mode: "formula", formula: trimmedPrice }
      : { mode: "value", amount: roundedAmount ?? 0 };
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
