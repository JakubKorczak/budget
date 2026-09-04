import type { Category } from "@/types/expense";
import type { BudgetQueueRecord, CanonicalCellValue } from "@/services/budgetDb";

const CURRENCY_TOLERANCE = 0.005;

export type MonthlyBudgetRow = {
  row: number;
  label: string;
  group: string | null;
  isGroup: boolean;
  planned: number;
  actual: number;
  difference: number;
};

export type MonthlyDashboardSnapshot = {
  month: string;
  periodLabel: string;
  plannedIncome: number;
  actualIncome: number;
  plannedExpenses: number;
  actualExpenses: number;
  expenseRows: MonthlyBudgetRow[];
  fetchedAt: number;
};

export type MonthlyDashboardModel = MonthlyDashboardSnapshot & {
  remaining: number;
  safeDaily: number;
  daysRemaining: number;
  timeProgress: number;
  spendingProgress: number | null;
  paceState: "safe" | "warning" | "danger" | "no-plan";
  overBudgetCategories: MonthlyBudgetRow[];
  unplannedExpenses: MonthlyBudgetRow[];
  unplannedTotal: number;
  pendingCount: number;
  problemCount: number;
  isOptimistic: boolean;
};

type ParseMonthlyDashboardInput = {
  month: string;
  periodLabel: string;
  incomeValues: unknown[][];
  expenseValues: unknown[][];
  categoryValues: unknown[][];
  fetchedAt?: number;
};

export function parseMonthlyDashboardSnapshot({
  month,
  periodLabel,
  incomeValues,
  expenseValues,
  categoryValues,
  fetchedAt = Date.now(),
}: ParseMonthlyDashboardInput): MonthlyDashboardSnapshot {
  const categories = parseCategoryGroups(categoryValues);
  const groupNames = new Set(categories.map((group) => Object.keys(group)[0]));
  const incomeSummary = findSummaryRow(incomeValues);
  const expenseSummary = findSummaryRow(expenseValues);
  let currentGroup: string | null = null;

  const expenseRows = expenseValues.flatMap<MonthlyBudgetRow>((row, index) => {
    const label = String(row[0] ?? "").trim();
    if (!label || label === "." || label === "Kategoria" || label === "SUMA:") {
      return [];
    }

    const isGroup = groupNames.has(label);
    if (isGroup) {
      currentGroup = label;
    }
    const planned = normalizeAmount(row[1]);
    const actual = normalizeAmount(row[2]);
    const difference = normalizeAmount(row[3] ?? planned - actual);
    return [
      {
        row: 76 + index,
        label,
        group: isGroup ? label : currentGroup,
        isGroup,
        planned,
        actual,
        difference,
      },
    ];
  });

  return {
    month,
    periodLabel,
    plannedIncome: normalizeAmount(incomeSummary[1]),
    actualIncome: normalizeAmount(incomeSummary[2]),
    plannedExpenses: normalizeAmount(expenseSummary[1]),
    actualExpenses: normalizeAmount(expenseSummary[2]),
    expenseRows,
    fetchedAt,
  };
}

export function buildMonthlyDashboardModel(
  snapshot: MonthlyDashboardSnapshot,
  queueRecords: BudgetQueueRecord[],
  now = new Date()
): MonthlyDashboardModel {
  const activeRecords = queueRecords.filter(
    (record) =>
      record.month === snapshot.month &&
      (record.state === "pending" || record.state === "syncing")
  );
  const problemCount = queueRecords.filter(
    (record) =>
      record.month === snapshot.month &&
      (record.state === "conflict" || record.state === "failed")
  ).length;
  const expenseRows = snapshot.expenseRows.map((row) => ({ ...row }));
  let actualIncome = snapshot.actualIncome;
  let actualExpenses = snapshot.actualExpenses;

  for (const record of activeRecords) {
    const delta = canonicalAmount(record.desired) - canonicalAmount(record.expected);
    if (record.entryType === "salary") {
      actualIncome = roundCurrency(actualIncome + delta);
      continue;
    }

    actualExpenses = roundCurrency(actualExpenses + delta);
    const row = expenseRows.find(
      (candidate) => normalizeLabel(candidate.label) === normalizeLabel(record.category)
    );
    if (!row) {
      continue;
    }
    applyRowDelta(row, delta);
    if (!row.isGroup && row.group) {
      const groupRow = expenseRows.find(
        (candidate) => candidate.isGroup && candidate.label === row.group
      );
      if (groupRow) {
        applyRowDelta(groupRow, delta);
      }
    }
  }

  const remaining = roundCurrency(actualIncome - actualExpenses);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
  const timeProgress = (now.getDate() / daysInMonth) * 100;
  const spendingProgress =
    snapshot.plannedExpenses > CURRENCY_TOLERANCE
      ? (actualExpenses / snapshot.plannedExpenses) * 100
      : null;
  const paceState = getPaceState(spendingProgress, timeProgress, remaining);
  const overBudgetCategories = expenseRows
    .filter((row) => row.isGroup && row.difference < -CURRENCY_TOLERANCE)
    .sort((left, right) => left.difference - right.difference)
    .slice(0, 3);
  const unplannedExpenses = expenseRows
    .filter(
      (row) =>
        !row.isGroup &&
        row.planned <= CURRENCY_TOLERANCE &&
        row.actual > CURRENCY_TOLERANCE
    )
    .sort((left, right) => right.actual - left.actual);

  return {
    ...snapshot,
    actualIncome,
    actualExpenses,
    expenseRows,
    remaining,
    safeDaily: roundCurrency(Math.max(remaining, 0) / daysRemaining),
    daysRemaining,
    timeProgress,
    spendingProgress,
    paceState,
    overBudgetCategories,
    unplannedExpenses,
    unplannedTotal: roundCurrency(
      unplannedExpenses.reduce((total, row) => total + row.actual, 0)
    ),
    pendingCount: activeRecords.length,
    problemCount,
    isOptimistic: activeRecords.length > 0,
  };
}

export function parseCategoryGroups(values: unknown[][]): Category[] {
  const result: Category[] = [];
  let currentCategory: Category | null = null;
  let expectCategoryName = false;

  for (const row of values) {
    const entry = String(row[0] ?? "").trim();
    if (!entry || entry === ".") continue;
    if (entry === "nazwa kategorii") {
      expectCategoryName = true;
      currentCategory = null;
      continue;
    }
    if (expectCategoryName) {
      currentCategory = { [entry]: [] };
      result.push(currentCategory);
      expectCategoryName = false;
      continue;
    }
    if (currentCategory) {
      currentCategory[Object.keys(currentCategory)[0]].push(entry);
    }
  }
  return result;
}

function findSummaryRow(values: unknown[][]): unknown[] {
  return values.find((row) => String(row[0] ?? "").trim() === "SUMA:") ?? [];
}

function getPaceState(
  spendingProgress: number | null,
  timeProgress: number,
  remaining: number
): MonthlyDashboardModel["paceState"] {
  if (spendingProgress === null) return "no-plan";
  if (spendingProgress > 100 || remaining < -CURRENCY_TOLERANCE) return "danger";
  if (spendingProgress > timeProgress + 5) return "warning";
  return "safe";
}

function applyRowDelta(row: MonthlyBudgetRow, delta: number): void {
  row.actual = roundCurrency(row.actual + delta);
  row.difference = roundCurrency(row.planned - row.actual);
}

function canonicalAmount(value: CanonicalCellValue): number {
  return value.mode === "empty" ? 0 : value.amount;
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase("pl-PL");
}

function normalizeAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const numeric = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundCurrency(value: number): number {
  return Number.parseFloat((Math.round(value * 100) / 100).toFixed(2));
}
