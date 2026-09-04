import axios from "axios";
import type { CategoryBudgetAmounts } from "@/lib/categoryBudget";
import type { Category } from "@/types/expense";
import { MONTHS } from "@/types/expense";
import {
  applyPendingQueueOverlay,
  clearBudgetDaySnapshots,
  getBudgetDaySnapshot,
  putBudgetDaySnapshot,
  type BudgetQueueRecord,
  type CanonicalCellValue,
} from "./budgetDb";

const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SPREADSHEET_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
let postTransportUnavailable = false;

type SheetRowData = {
  values?: Array<{
    formattedValue?: string;
    userEnteredValue?: {
      numberValue?: number;
      stringValue?: string;
      formulaValue?: string;
    };
    effectiveValue?: { numberValue?: number; stringValue?: string };
  }>;
};

interface CategoryGridCacheEntry {
  startRow: number;
  rowData: SheetRowData[];
  snapshot: Array<{ row: number; value: string | null }>;
}

export type DayAmountEntry = {
  amount: number;
  formula: string | null;
  isEmpty?: boolean;
};

export type DayAmountsMap = Record<string, DayAmountEntry>;
export type BudgetEntryType = "expense" | "salary";
export type AddBudgetEntryResult =
  | { mode: "value"; amount: number }
  | { mode: "formula"; formula: string };
export type AddExpenseResult = AddBudgetEntryResult;
export type ApplyBudgetEntryStatus =
  | "applied"
  | "alreadyApplied"
  | "conflict"
  | "invalid"
  | "retryable";
export interface ApplyBudgetEntryResult {
  commandId: string;
  status: ApplyBudgetEntryStatus;
  current: CanonicalCellValue;
  message?: string;
}

interface DayAmountsCacheEntry {
  timestamp: number;
  month: string;
  day: number;
  data: DayAmountsMap;
}

const categoryGridCache = new Map<string, CategoryGridCacheEntry>();
const categoryRowValuesCache = new Map<string, (string | number | null)[]>();
const daySnapshotRequests = new Map<
  string,
  Promise<{ expense: DayAmountsMap; salary: DayAmountsMap }>
>();

const CATEGORY_CACHE_KEY = "budget:categories:v2";
const SALARY_CATEGORIES_CACHE_PREFIX = "budget:salary-categories:v1";
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

function buildDayAmountsCacheKey(
  month: string,
  day: number,
  entryType: BudgetEntryType
): string {
  return `${DAY_AMOUNTS_CACHE_PREFIX}:${entryType}:${month}:${day}`;
}

function readDayAmountsCache(
  month: string,
  day: number,
  entryType: BudgetEntryType = "expense"
): DayAmountsCacheEntry | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = buildDayAmountsCacheKey(month, day, entryType);
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
      const keepSuffix = keepKey.split(":").slice(-2).join(":");
      if (
        key &&
        key.startsWith(DAY_AMOUNTS_CACHE_PREFIX) &&
        !key.endsWith(keepSuffix)
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.warn("[Sheets] Nie udało się wyczyścić starych cache dnia", error);
  }
}

export async function clearAllDayAmountCaches(): Promise<void> {
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
    await clearBudgetDaySnapshots();
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
  data: DayAmountsMap,
  entryType: BudgetEntryType = "expense"
): void {
  if (typeof window === "undefined") {
    return;
  }

  const key = buildDayAmountsCacheKey(month, day, entryType);
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
  data: DayAmountsMap,
  entryType: BudgetEntryType = "expense"
): void {
  writeDayAmountsCache(month, day, data, entryType);
}

export function removeDayAmountsCache(
  month: string,
  day: number,
  entryType: BudgetEntryType = "expense"
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const key = buildDayAmountsCacheKey(month, day, entryType);
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("[Sheets] Nie udało się usunąć cache dnia", error);
  }
}

export function getCachedDayAmountsSnapshot(
  month: string,
  day: number,
  entryType: BudgetEntryType = "expense"
): DayAmountsMap | null {
  return readDayAmountsCache(month, day, entryType)?.data ?? null;
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

interface GoogleGridData {
  startRow?: number;
  rowData?: SheetRowData[];
}

async function fetchBudgetDaySnapshotFromSheet(
  month: string,
  day: number
): Promise<{ expense: DayAmountsMap; salary: DayAmountsMap }> {
  const dayIndex = Math.max(1, Math.min(31, day));
  const dayColumnIndex = 8 + (dayIndex - 1);
  const columnLetter = getColumnLetter(dayColumnIndex);
  const ranges = [
    `${month}!B58:${columnLetter}70`,
    `${month}!B79:${columnLetter}257`,
  ];
  const params = new URLSearchParams({
    includeGridData: "true",
    fields:
      "sheets(properties(title),data(startRow,rowData(values(formattedValue,userEnteredValue,effectiveValue))))",
    key: API_KEY,
  });
  ranges.forEach((range) => params.append("ranges", range));

  const response = await axios.get(`${BASE_URL}/${SPREADSHEET_ID}?${params}`);
  const sheet = (response.data.sheets || []).find(
    (candidate: { properties?: { title?: string } }) =>
      candidate.properties?.title === month
  );
  const gridData: GoogleGridData[] = sheet?.data || [];
  const salaryGrid = gridData.find((grid) => grid.startRow === 57);
  const expenseGrid = gridData.find((grid) => grid.startRow === 78);
  const valueOffset = dayColumnIndex - 1;

  return {
    salary: parseDayGrid(salaryGrid?.rowData ?? [], valueOffset),
    expense: parseDayGrid(expenseGrid?.rowData ?? [], valueOffset),
  };
}

async function fetchAndCacheBudgetDaySnapshot(
  month: string,
  day: number
): Promise<{ expense: DayAmountsMap; salary: DayAmountsMap }> {
  const key = `${month}:${day}`;
  const inFlight = daySnapshotRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const fetched = await fetchBudgetDaySnapshotFromSheet(month, day);
    const withPendingWrites = await applyPendingQueueOverlay({
      month,
      day,
      ...fetched,
    });
    await putBudgetDaySnapshot(withPendingWrites);
    writeDayAmountsCache(month, day, withPendingWrites.expense, "expense");
    writeDayAmountsCache(month, day, withPendingWrites.salary, "salary");
    return {
      expense: withPendingWrites.expense,
      salary: withPendingWrites.salary,
    };
  })().finally(() => {
    daySnapshotRequests.delete(key);
  });
  daySnapshotRequests.set(key, request);
  return request;
}

function parseDayGrid(
  rowData: SheetRowData[],
  valueOffset: number
): DayAmountsMap {
  const amounts: DayAmountsMap = {};
  for (const row of rowData) {
    const label = row.values?.[0]?.formattedValue?.trim();
    if (!label || label === ".") {
      continue;
    }
    const valueCell = row.values?.[valueOffset];
    const formula = valueCell?.userEnteredValue?.formulaValue ?? null;
    const effectiveAmount =
      valueCell?.effectiveValue?.numberValue ?? valueCell?.formattedValue ?? 0;
    amounts[label] = {
      amount: normalizeAmountValue(effectiveAmount),
      formula,
      isEmpty: !valueCell?.userEnteredValue,
    };
  }
  return amounts;
}

export async function getDayAmounts(
  month: string,
  day: number,
  options?: { forceRefresh?: boolean; entryType?: BudgetEntryType }
): Promise<DayAmountsMap> {
  if (!Number.isFinite(day)) {
    return {};
  }

  const entryType = options?.entryType ?? "expense";

  if (!options?.forceRefresh) {
    const cached = readDayAmountsCache(month, day, entryType);
    if (cached) {
      return cached.data;
    }

    const persisted = await getBudgetDaySnapshot(month, day);
    if (persisted) {
      writeDayAmountsCache(month, day, persisted.expense, "expense");
      writeDayAmountsCache(month, day, persisted.salary, "salary");
      return persisted[entryType];
    }
  }

  const fetched = await fetchAndCacheBudgetDaySnapshot(month, day);
  return fetched[entryType];
}

export function incrementDayAmountCache(
  month: string,
  day: number,
  category: string,
  delta: number,
  entryType: BudgetEntryType = "expense"
): void {
  if (!Number.isFinite(delta) || !category) {
    return;
  }

  const existing = readDayAmountsCache(month, day, entryType);
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
  writeDayAmountsCache(month, day, nextData, entryType);
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

function buildSalaryCategoriesCacheKey(month: string): string {
  return `${SALARY_CATEGORIES_CACHE_PREFIX}:${month}`;
}

function readSalaryCategoriesCache(month: string): Category[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = buildSalaryCategoriesCacheKey(month);
  try {
    const payload = window.localStorage.getItem(key);
    if (!payload) {
      return null;
    }

    const parsed = JSON.parse(payload) as {
      timestamp?: number;
      data?: Category[];
    } | null;

    if (
      !parsed ||
      typeof parsed.timestamp !== "number" ||
      !isValidCategoryCache(parsed.data) ||
      Date.now() - parsed.timestamp > CATEGORY_CACHE_TTL
    ) {
      window.localStorage.removeItem(key);
      return null;
    }

    return parsed.data ?? null;
  } catch (error) {
    console.warn(
      "[Sheets] Nie udało się odczytać cache wynagrodzeń",
      error
    );
    return null;
  }
}

function writeSalaryCategoriesCache(month: string, data: Category[]): void {
  if (typeof window === "undefined" || !isValidCategoryCache(data)) {
    return;
  }

  try {
    window.localStorage.setItem(
      buildSalaryCategoriesCacheKey(month),
      JSON.stringify({ timestamp: Date.now(), data })
    );
  } catch (error) {
    console.warn(
      "[Sheets] Nie udało się zapisać cache wynagrodzeń",
      error
    );
  }
}

export function getCachedSalaryCategoriesSnapshot(
  month: string
): Category[] | null {
  return readSalaryCategoriesCache(month);
}

export function clearSalaryCategoriesCache(month?: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (month) {
      window.localStorage.removeItem(buildSalaryCategoriesCacheKey(month));
      return;
    }

    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(SALARY_CATEGORIES_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.warn(
      "[Sheets] Nie udało się wyczyścić cache wynagrodzeń",
      error
    );
  }
}

export async function getSalaryCategories(month: string): Promise<Category[]> {
  const cached = readSalaryCategoriesCache(month);
  if (cached) {
    return cached;
  }

  try {
    const range = `${month}!B58:B70`;
    const url = `${BASE_URL}/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
    const response = await axios.get(url);
    const values: string[][] = response.data.values || [];
    const salaries = values
      .map((row) => row[0]?.trim())
      .filter((value): value is string => Boolean(value && value !== "."));

    if (!salaries.length) {
      throw new Error("Nie znaleziono wynagrodzeń w wierszach 58–70");
    }

    const result: Category[] = [{ Wynagrodzenia: salaries }];
    writeSalaryCategoriesCache(month, result);
    return result;
  } catch (error) {
    console.error("Error fetching salary categories:", error);

    if (axios.isAxiosError(error) && error.response?.status === 429) {
      throw new Error(
        "Przekroczono limit zapytań do Google Sheets API. Odczekaj chwilę i odśwież stronę."
      );
    }

    if (error instanceof Error && error.message.includes("wierszach 58–70")) {
      throw error;
    }

    throw new Error("Nie udało się pobrać listy wynagrodzeń");
  }
}

async function getCategoryGrid(
  month: string,
  entryType: BudgetEntryType = "expense"
): Promise<CategoryGridCacheEntry> {
  const cacheKey = `${entryType}:${month}`;
  const cached = categoryGridCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const categoriesRange =
    entryType === "salary" ? `${month}!B58:B70` : `${month}!B79:B257`;
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
  const defaultStartRow = entryType === "salary" ? 58 : 79;
  const startRow = startRowMatch
    ? parseInt(startRowMatch[1], 10)
    : defaultStartRow;

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
  categoryGridCache.set(cacheKey, entry);
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
 * Pobiera plan, wykonanie i różnicę dla kategorii z kolumn C, D i E.
 */
export async function getCategoryBudgetStatus(
  category: string,
  month: string,
  signal?: AbortSignal
): Promise<CategoryBudgetAmounts> {
  try {
    const { rowData, startRow } = await getCategoryGrid(month, "expense");
    const normalizedCategory = category.trim().toLowerCase();

    let categoryRowIndex = -1;
    for (let index = 0; index < rowData.length; index++) {
      const cellValue = rowData[index]?.values?.[0]?.formattedValue?.trim();
      if (cellValue?.toLowerCase() === normalizedCategory) {
        categoryRowIndex = startRow + index;
        break;
      }
    }

    if (categoryRowIndex === -1) {
      throw new Error("Kategoria nie znaleziona");
    }

    const range = encodeURIComponent(
      `${month}!C${categoryRowIndex}:E${categoryRowIndex}`
    );
    const url = `${BASE_URL}/${SPREADSHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&key=${API_KEY}`;
    const response = await axios.get(url, { signal });
    const values: Array<string | number | null> =
      response.data.values?.[0] ?? [];

    return {
      planned: normalizeAmountValue(values[0]),
      actual: normalizeAmountValue(values[1]),
      difference: normalizeAmountValue(values[2]),
    };
  } catch (error) {
    console.error("Error fetching category budget status:", error);
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
export async function addBudgetEntry(
  category: string,
  day: number,
  price: string,
  month: string,
  entryType: BudgetEntryType = "expense"
): Promise<AddBudgetEntryResult> {
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
          "Aby zapisywać dane, musisz skonfigurować Google Apps Script:\n" +
          "1. Zobacz instrukcje w QUICK-START.md (Krok 3)\n" +
          "2. Dodaj VITE_APPS_SCRIPT_URL do pliku .env"
      );
    }

    // Używamy GET aby uniknąć problemów z CORS
    const params = new URLSearchParams({
      action: entryType === "salary" ? "addSalary" : "addExpense",
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
        response.data.error ||
          `Nieznany błąd podczas dodawania ${
            entryType === "salary" ? "wynagrodzenia" : "wydatku"
          }`
      );
    }

    if (entryType === "salary" && response.data.success !== true) {
      throw new Error(
        "Google Apps Script nie obsługuje jeszcze wynagrodzeń. Zaktualizuj kod Code.gs i utwórz nowe wdrożenie."
      );
    }

    // Jeśli nie ma success: true, ale też nie ma error, zakładamy sukces
    if (response.data.success !== true && !response.data.message) {
      console.warn("Nieoczekiwany format odpowiedzi:", response.data);
    }
    return isFormula && trimmedPrice
      ? { mode: "formula", formula: trimmedPrice }
      : { mode: "value", amount: roundedAmount ?? 0 };
  } catch (error) {
    console.error(`Error adding ${entryType}:`, error);
    if (error instanceof Error) {
      throw error; // Przekaż oryginalny błąd z opisem
    }
    throw new Error(
      `Nie udało się dodać ${
        entryType === "salary" ? "wynagrodzenia" : "wydatku"
      }`
    );
  }
}

export async function applyBudgetEntryCommands(
  commands: BudgetQueueRecord[]
): Promise<ApplyBudgetEntryResult[]> {
  const appsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL;
  if (!appsScriptUrl) {
    throw new Error("Brak konfiguracji Apps Script URL");
  }
  const batch = commands.slice(0, 10);
  if (!postTransportUnavailable) {
    let response: Response;
    try {
      response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "applyBudgetEntries",
          protocolVersion: 2,
          commands: batch.map(serializeQueueCommand),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      console.warn(
        "[Sheets] Transport POST niedostępny, używam zgodnego fallbacku GET",
        error
      );
      postTransportUnavailable = true;
    }
    if (!postTransportUnavailable) {
      if (!response!.ok) {
        if (response!.status === 404 || response!.status === 405) {
          postTransportUnavailable = true;
        } else if (response!.status >= 400 && response!.status < 500 && response!.status !== 429) {
          return batch.map((command) => ({
            commandId: command.commandId,
            status: "invalid",
            current: command.expected,
            message: `Apps Script odpowiedział kodem ${response!.status}`,
          }));
        } else {
          throw new Error(`Apps Script odpowiedział kodem ${response!.status}`);
        }
      } else {
        const payload = (await response!.json()) as {
          success?: boolean;
          results?: ApplyBudgetEntryResult[];
          error?: string;
        };
        if (payload.success && Array.isArray(payload.results)) {
          return payload.results;
        }
        if (
          payload.error === "Unknown action" ||
          payload.error === "Unsupported protocol version"
        ) {
          postTransportUnavailable = true;
        } else {
          throw new Error(payload.error || "Nieprawidłowa odpowiedź Apps Script v2");
        }
      }
    }
  }

  return Promise.all(batch.map((command) => applyLegacyQueueCommand(appsScriptUrl, command)));
}

function serializeQueueCommand(command: BudgetQueueRecord) {
  return {
    commandId: command.commandId,
    entryType: command.entryType,
    month: command.month,
    day: command.day,
    category: command.category,
    expected: command.expected,
    desired: command.desired,
  };
}

async function applyLegacyQueueCommand(
  appsScriptUrl: string,
  command: BudgetQueueRecord
): Promise<ApplyBudgetEntryResult> {
  const params = new URLSearchParams({
    action: command.entryType === "salary" ? "addSalary" : "addExpense",
    commandId: command.commandId,
    category: command.category,
    day: command.day.toString(),
    month: command.month,
    mode: command.desired.mode,
  });
  if (command.desired.mode === "formula") {
    params.set("formula", command.desired.formula);
  } else {
    params.set("amount", command.desired.amount.toFixed(2));
  }

  try {
    const response = await axios.get(`${appsScriptUrl}?${params}`, {
      timeout: 15_000,
    });
    if (response.data?.retryable) {
      return {
        commandId: command.commandId,
        status: "retryable",
        current: command.expected,
        message: response.data?.error || "Apps Script jest zajęty",
      };
    }
    if (response.data?.success === false || response.data?.error) {
      return {
        commandId: command.commandId,
        status: "invalid",
        current: command.expected,
        message: response.data?.error || "Apps Script odrzucił operację",
      };
    }
    if (response.data?.success !== true) {
      return {
        commandId: command.commandId,
        status: "invalid",
        current: command.expected,
        message: "Wdrożony Apps Script nie obsługuje tej operacji",
      };
    }
    return {
      commandId: command.commandId,
      status: "applied",
      current: command.desired,
    };
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response?.status &&
      error.response.status >= 400 &&
      error.response.status < 500 &&
      error.response.status !== 429
    ) {
      return {
        commandId: command.commandId,
        status: "invalid",
        current: command.expected,
        message: `Apps Script odpowiedział kodem ${error.response.status}`,
      };
    }
    throw error;
  }
}

export function addExpense(
  category: string,
  day: number,
  price: string,
  month: string
): Promise<AddExpenseResult> {
  return addBudgetEntry(category, day, price, month, "expense");
}

/**
 * Pobiera aktualny miesiąc (nazwa po polsku)
 */
export function getCurrentMonth(): string {
  const monthIndex = new Date().getMonth();
  return MONTHS[monthIndex];
}
