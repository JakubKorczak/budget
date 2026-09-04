export type CategoryBudgetAmounts = {
  planned: number;
  actual: number;
  difference: number;
};

export type CategoryBudgetProgress = CategoryBudgetAmounts & {
  percentage: number | null;
  state: "under" | "met" | "over" | "unplanned";
};

const CURRENCY_TOLERANCE = 0.005;

export function getCategoryBudgetProgress(
  amounts: CategoryBudgetAmounts
): CategoryBudgetProgress {
  const percentage =
    amounts.planned > 0 ? (amounts.actual / amounts.planned) * 100 : null;

  if (amounts.difference < -CURRENCY_TOLERANCE) {
    return { ...amounts, percentage, state: "over" };
  }

  if (amounts.planned <= 0 && Math.abs(amounts.actual) < CURRENCY_TOLERANCE) {
    return { ...amounts, percentage: null, state: "unplanned" };
  }

  if (amounts.difference > CURRENCY_TOLERANCE) {
    return { ...amounts, percentage, state: "under" };
  }

  return { ...amounts, percentage, state: "met" };
}
