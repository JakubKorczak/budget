import { describe, expect, it } from "vitest";

import type { BudgetQueueRecord } from "@/services/budgetDb";
import {
  buildMonthlyDashboardModel,
  parseMonthlyDashboardSnapshot,
  type MonthlyDashboardSnapshot,
} from "./monthlyDashboard";

describe("monthly dashboard", () => {
  it("parses summaries, groups and subcategories from monthly ranges", () => {
    const snapshot = parseMonthlyDashboardSnapshot({
      month: "Wrzesień",
      periodLabel: "Wrzesień 2026",
      incomeValues: [["SUMA:", 10_000, 8_000, -2_000]],
      expenseValues: [
        ["Kategoria", "Planowane", "Rzeczywiste", "Różnica"],
        ["SUMA:", 6_000, 3_000, 3_000],
        ["Dom", 4_000, 4_100, -100],
        ["Zakupy", 0, 500, -500],
      ],
      categoryValues: [["nazwa kategorii"], ["Dom"], ["Zakupy"]],
      fetchedAt: 100,
    });

    expect(snapshot).toMatchObject({
      periodLabel: "Wrzesień 2026",
      plannedIncome: 10_000,
      actualIncome: 8_000,
      plannedExpenses: 6_000,
      actualExpenses: 3_000,
    });
    expect(snapshot.expenseRows).toEqual([
      expect.objectContaining({ label: "Dom", group: "Dom", isGroup: true }),
      expect.objectContaining({ label: "Zakupy", group: "Dom", isGroup: false }),
    ]);
  });

  it("calculates remaining budget, daily limit and pace", () => {
    const model = buildMonthlyDashboardModel(
      snapshot(),
      [],
      new Date(2026, 8, 4, 12)
    );

    expect(model.remaining).toBe(3_000);
    expect(model.daysRemaining).toBe(27);
    expect(model.safeDaily).toBe(111.11);
    expect(model.timeProgress).toBeCloseTo(13.333);
    expect(model.spendingProgress).toBe(50);
    expect(model.paceState).toBe("warning");
  });

  it("uses one day on the last day and never suggests spending after exceeding plan", () => {
    const source = snapshot();
    source.actualExpenses = 6_500;
    const model = buildMonthlyDashboardModel(
      source,
      [],
      new Date(2026, 8, 30, 12)
    );

    expect(model.daysRemaining).toBe(1);
    expect(model.remaining).toBe(-500);
    expect(model.safeDaily).toBe(0);
    expect(model.paceState).toBe("danger");
  });

  it("applies pending salary and expense deltas to totals and category rows", () => {
    const records = [
      queueRecord("salary", "Pensja", 1_000, 1_500),
      queueRecord("expense", "Zakupy", 500, 700),
    ];
    const model = buildMonthlyDashboardModel(
      snapshot(),
      records,
      new Date(2026, 8, 4, 12)
    );

    expect(model.actualIncome).toBe(8_500);
    expect(model.actualExpenses).toBe(3_200);
    expect(model.expenseRows.find((row) => row.label === "Zakupy")?.actual).toBe(700);
    expect(model.expenseRows.find((row) => row.label === "Dom")?.actual).toBe(4_300);
    expect(model.pendingCount).toBe(2);
    expect(model.isOptimistic).toBe(true);
  });

  it("ranks exceeded groups and summarizes unplanned subcategories", () => {
    const model = buildMonthlyDashboardModel(
      snapshot(),
      [],
      new Date(2026, 8, 4, 12)
    );

    expect(model.overBudgetCategories.map((row) => row.label)).toEqual(["Dom"]);
    expect(model.unplannedExpenses.map((row) => row.label)).toEqual(["Zakupy"]);
    expect(model.unplannedTotal).toBe(500);
  });

  it("does not apply conflicts to displayed totals", () => {
    const conflict = queueRecord("expense", "Zakupy", 500, 900);
    conflict.state = "conflict";
    const model = buildMonthlyDashboardModel(
      snapshot(),
      [conflict],
      new Date(2026, 8, 4, 12)
    );

    expect(model.actualExpenses).toBe(3_000);
    expect(model.pendingCount).toBe(0);
    expect(model.problemCount).toBe(1);
  });
});

function snapshot(): MonthlyDashboardSnapshot {
  return {
    month: "Wrzesień",
    periodLabel: "Wrzesień 2026",
    plannedIncome: 10_000,
    actualIncome: 8_000,
    plannedExpenses: 6_000,
    actualExpenses: 3_000,
    fetchedAt: 100,
    expenseRows: [
      { row: 79, label: "Dom", group: "Dom", isGroup: true, planned: 4_000, actual: 4_100, difference: -100 },
      { row: 80, label: "Zakupy", group: "Dom", isGroup: false, planned: 0, actual: 500, difference: -500 },
    ],
  };
}

function queueRecord(
  entryType: "expense" | "salary",
  category: string,
  expected: number,
  desired: number
): BudgetQueueRecord {
  return {
    commandId: `${entryType}-${category}`,
    cellKey: `${entryType}:Wrzesień:4:${category}`,
    entryType,
    month: "Wrzesień",
    day: 4,
    category,
    expected: { mode: "value", amount: expected },
    desired: { mode: "value", amount: desired },
    state: "pending",
    attempts: 0,
    createdAt: 1,
    updatedAt: 1,
    nextAttemptAt: 1,
  };
}
