import { describe, expect, it } from "vitest";

import {
  clearBudgetEntryDraft,
  getBudgetEntryDraftStorageKey,
  parseBudgetEntryDraft,
  readBudgetEntryDraft,
  writeBudgetEntryDraft,
  type BudgetEntryDraft,
} from "./expenseDraft";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("budget entry draft", () => {
  const draft: BudgetEntryDraft = {
    category: "Zakupy",
    day: "3",
    price: "100+20",
    month: "Wrzesień",
  };

  it("stores expense and salary drafts separately", () => {
    const storage = createStorage();

    writeBudgetEntryDraft("expense", draft, storage);
    writeBudgetEntryDraft("salary", { ...draft, category: "Pensja" }, storage);

    expect(readBudgetEntryDraft("expense", storage)).toEqual(draft);
    expect(readBudgetEntryDraft("salary", storage)).toEqual({
      ...draft,
      category: "Pensja",
    });
  });

  it("rejects malformed or out-of-range drafts", () => {
    expect(parseBudgetEntryDraft("not-json")).toBeNull();
    expect(parseBudgetEntryDraft(JSON.stringify({ ...draft, day: "32" }))).toBeNull();
    expect(
      parseBudgetEntryDraft(JSON.stringify({ ...draft, month: "Nie-miesiąc" }))
    ).toBeNull();
  });

  it("clears only the selected entry type", () => {
    const storage = createStorage();
    writeBudgetEntryDraft("expense", draft, storage);
    writeBudgetEntryDraft("salary", draft, storage);

    clearBudgetEntryDraft("expense", storage);

    expect(storage.getItem(getBudgetEntryDraftStorageKey("expense"))).toBeNull();
    expect(readBudgetEntryDraft("salary", storage)).toEqual(draft);
  });
});
