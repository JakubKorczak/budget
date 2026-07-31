import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  dayAmountToCanonical,
  getBudgetDatabase,
  getBudgetDaySnapshot,
  patchBudgetDayCell,
  type BudgetQueueRecord,
} from "./budgetDb";
import {
  discardBudgetQueueRecord,
  enqueueBudgetEntry,
  getBudgetQueueSnapshot,
  overwriteBudgetQueueConflict,
} from "./budgetQueue";

describe("persistent budget outbox", () => {
  beforeEach(async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const database = await getBudgetDatabase();
    await database.clear("queue");
    await database.clear("daySnapshots");
  });

  it("normalizes cached values into compare-and-set values", () => {
    expect(dayAmountToCanonical(undefined)).toEqual({ mode: "empty" });
    expect(dayAmountToCanonical({ amount: 12.5, formula: null })).toEqual({
      mode: "value",
      amount: 12.5,
    });
    expect(
      dayAmountToCanonical({ amount: 0, formula: null, isEmpty: false })
    ).toEqual({ mode: "value", amount: 0 });
    expect(dayAmountToCanonical({ amount: 15, formula: "=10+5" })).toEqual({
      mode: "formula",
      formula: "=10+5",
      amount: 15,
    });
  });

  it("coalesces pending writes to one cell and preserves the oldest base", async () => {
    await enqueueBudgetEntry({
      entryType: "expense",
      month: "Lipiec",
      day: 31,
      category: "Zakupy",
      desired: { mode: "value", amount: 10 },
    });
    await enqueueBudgetEntry({
      entryType: "expense",
      month: "Lipiec",
      day: 31,
      category: "Zakupy",
      desired: { mode: "value", amount: 25 },
    });

    const database = await getBudgetDatabase();
    const records = await database.getAll("queue");
    expect(records).toHaveLength(1);
    expect(records[0]?.expected).toEqual({ mode: "empty" });
    expect(records[0]?.desired).toEqual({ mode: "value", amount: 25 });
    expect((await getBudgetDaySnapshot("Lipiec", 31, true))?.expense.Zakupy).toEqual({
      amount: 25,
      formula: null,
      isEmpty: false,
    });
  });

  it("restores the server value when a conflicted record is discarded", async () => {
    const database = await getBudgetDatabase();
    await patchBudgetDayCell("salary", "Lipiec", 10, "Pensja", {
      mode: "value",
      amount: 5000,
    });
    const record: BudgetQueueRecord = {
      commandId: "conflict-1",
      cellKey: "salary:Lipiec:10:pensja",
      entryType: "salary",
      month: "Lipiec",
      day: 10,
      category: "Pensja",
      expected: { mode: "value", amount: 4000 },
      desired: { mode: "value", amount: 5000 },
      current: { mode: "value", amount: 4500 },
      state: "conflict",
      attempts: 1,
      createdAt: 1,
      updatedAt: 1,
      nextAttemptAt: 1,
    };
    await database.put("queue", record);

    await discardBudgetQueueRecord(record.commandId);

    expect((await getBudgetDaySnapshot("Lipiec", 10, true))?.salary.Pensja).toEqual({
      amount: 4500,
      formula: null,
      isEmpty: false,
    });
    expect((await getBudgetQueueSnapshot()).problems).toHaveLength(0);
  });

  it("turns an explicit conflict overwrite into a new compare-and-set attempt", async () => {
    const database = await getBudgetDatabase();
    const record: BudgetQueueRecord = {
      commandId: "conflict-overwrite",
      cellKey: "expense:Lipiec:12:zakupy",
      entryType: "expense",
      month: "Lipiec",
      day: 12,
      category: "Zakupy",
      expected: { mode: "value", amount: 10 },
      desired: { mode: "value", amount: 30 },
      current: { mode: "value", amount: 20 },
      state: "conflict",
      attempts: 1,
      createdAt: 1,
      updatedAt: 1,
      nextAttemptAt: 1,
    };
    await database.put("queue", record);

    await overwriteBudgetQueueConflict(record.commandId);

    const updated = await database.get("queue", record.commandId);
    expect(updated?.state).toBe("pending");
    expect(updated?.expected).toEqual({ mode: "value", amount: 20 });
    expect(updated?.desired).toEqual({ mode: "value", amount: 30 });
  });
});
