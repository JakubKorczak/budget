import { describe, expect, it } from "vitest";

import { getCategoryBudgetProgress } from "./categoryBudget";

describe("category budget progress", () => {
  it("reports how much remains and the percentage used", () => {
    expect(
      getCategoryBudgetProgress({
        planned: 2_000,
        actual: 378.98,
        difference: 1_621.02,
      })
    ).toEqual({
      planned: 2_000,
      actual: 378.98,
      difference: 1_621.02,
      percentage: 18.949,
      state: "under",
    });
  });

  it("reports an exceeded plan", () => {
    const progress = getCategoryBudgetProgress({
      planned: 400,
      actual: 434.23,
      difference: -34.23,
    });

    expect(progress.state).toBe("over");
    expect(progress.percentage).toBeCloseTo(108.5575);
  });

  it("distinguishes an empty plan from a fully used plan", () => {
    expect(
      getCategoryBudgetProgress({ planned: 0, actual: 0, difference: 0 })
        .state
    ).toBe("unplanned");
    expect(
      getCategoryBudgetProgress({
        planned: 1_000,
        actual: 1_000,
        difference: 0,
      }).state
    ).toBe("met");
  });
});
