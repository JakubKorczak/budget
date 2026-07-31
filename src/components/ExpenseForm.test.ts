import { describe, expect, it } from "vitest";

import {
  evaluateLinearExpression,
  parsePriceInput,
  tokenizeLinearExpression,
} from "../lib/budgetExpression";

describe("budget expression parser", () => {
  it("calculates addition and subtraction without eval", () => {
    expect(evaluateLinearExpression("12,50+3-1,25")).toBe(14.25);
  });

  it("rejects repeated and unsupported operators", () => {
    expect(tokenizeLinearExpression("12++3")).toBeNull();
    expect(parsePriceInput("2*3")).toBeNull();
  });

  it("keeps a leading equals sign as a spreadsheet formula", () => {
    expect(parsePriceInput("=10,50+2")).toEqual({
      mode: "formula",
      formula: "=10.50+2",
    });
  });

  it("returns the final numeric value for a regular expression", () => {
    expect(parsePriceInput("100+20")).toEqual({ mode: "value", amount: 120 });
  });
});
