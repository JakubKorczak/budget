import type { BudgetEntryType } from "@/services/googleSheets";
import { MONTHS } from "@/types/expense";

export type BudgetEntryDraft = {
  category: string;
  day: string;
  price: string;
  month: string;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DRAFT_STORAGE_PREFIX = "budget:entry-draft:v1";

export function getBudgetEntryDraftStorageKey(
  entryType: BudgetEntryType
): string {
  return `${DRAFT_STORAGE_PREFIX}:${entryType}`;
}

export function parseBudgetEntryDraft(
  serializedDraft: string | null
): BudgetEntryDraft | null {
  if (!serializedDraft) {
    return null;
  }

  try {
    const draft = JSON.parse(serializedDraft) as Partial<BudgetEntryDraft>;
    const dayNumber = Number(draft.day);

    if (
      typeof draft.category !== "string" ||
      typeof draft.day !== "string" ||
      typeof draft.price !== "string" ||
      typeof draft.month !== "string" ||
      !Number.isInteger(dayNumber) ||
      dayNumber < 1 ||
      dayNumber > 31 ||
      !MONTHS.some((month) => month === draft.month)
    ) {
      return null;
    }

    return {
      category: draft.category,
      day: draft.day,
      price: draft.price,
      month: draft.month,
    };
  } catch {
    return null;
  }
}

export function readBudgetEntryDraft(
  entryType: BudgetEntryType,
  storage?: DraftStorage
): BudgetEntryDraft | null {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!targetStorage) {
    return null;
  }

  const storageKey = getBudgetEntryDraftStorageKey(entryType);
  try {
    const draft = parseBudgetEntryDraft(targetStorage.getItem(storageKey));
    if (!draft) {
      targetStorage.removeItem(storageKey);
    }
    return draft;
  } catch (error) {
    console.warn("Nie udało się odczytać szkicu wpisu", error);
    return null;
  }
}

export function writeBudgetEntryDraft(
  entryType: BudgetEntryType,
  draft: BudgetEntryDraft,
  storage?: DraftStorage
): void {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!targetStorage) {
    return;
  }

  try {
    targetStorage.setItem(
      getBudgetEntryDraftStorageKey(entryType),
      JSON.stringify(draft)
    );
  } catch (error) {
    console.warn("Nie udało się zapisać szkicu wpisu", error);
  }
}

export function clearBudgetEntryDraft(
  entryType: BudgetEntryType,
  storage?: DraftStorage
): void {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!targetStorage) {
    return;
  }

  try {
    targetStorage.removeItem(getBudgetEntryDraftStorageKey(entryType));
  } catch (error) {
    console.warn("Nie udało się usunąć szkicu wpisu", error);
  }
}
