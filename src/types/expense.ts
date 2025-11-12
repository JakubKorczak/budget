export interface Category {
  [key: string]: string[];
}

export interface ExpenseFormData {
  category: string;
  day: number;
  price: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  apiKey: string;
}

export const MONTHS = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
] as const;

export type Month = (typeof MONTHS)[number];
