const NUMBER_SEGMENT_REGEX = /^\d+(?:\.\d{0,2})?$/;

export type ParsedPriceInput =
  | { mode: "formula"; formula: string }
  | { mode: "value"; amount: number };

export function tokenizeLinearExpression(
  expression: string
): Array<{ operator: "+" | "-"; value: string }> | null {
  if (!expression?.length) return null;
  const normalized = expression.replace(/,/g, ".").replace(/\s+/g, "");
  if (!/^[0-9.+-]+$/.test(normalized)) return null;

  const tokens: Array<{ operator: "+" | "-"; value: string }> = [];
  let currentNumber = "";
  let operator: "+" | "-" = "+";
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    if (char === "+" || char === "-") {
      if (currentNumber === "") {
        if (index === 0) {
          operator = char;
          continue;
        }
        return null;
      }
      if (!NUMBER_SEGMENT_REGEX.test(currentNumber)) return null;
      tokens.push({ operator, value: currentNumber });
      operator = char;
      currentNumber = "";
      continue;
    }
    if (char === "." && currentNumber.includes(".")) return null;
    currentNumber += char;
  }
  if (!NUMBER_SEGMENT_REGEX.test(currentNumber)) return null;
  tokens.push({ operator, value: currentNumber });
  return tokens;
}

export function evaluateLinearExpression(expression: string): number | null {
  const tokens = tokenizeLinearExpression(expression);
  if (!tokens) return null;
  let total = 0;
  for (const token of tokens) {
    const numericValue = Number.parseFloat(token.value);
    if (!Number.isFinite(numericValue)) return null;
    total = token.operator === "+" ? total + numericValue : total - numericValue;
  }
  return Number.parseFloat((Math.round(total * 100) / 100).toFixed(2));
}

export function parsePriceInput(value: string): ParsedPriceInput | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("=")) {
    const tokens = tokenizeLinearExpression(trimmed.slice(1));
    if (!tokens) return null;
    const serialized = tokens
      .map((token, index) => {
        const prefix =
          index === 0 ? (token.operator === "-" ? "-" : "") : token.operator;
        return `${prefix}${token.value}`;
      })
      .join("");
    return { mode: "formula", formula: `=${serialized}` };
  }
  const amount = evaluateLinearExpression(trimmed);
  return amount === null ? null : { mode: "value", amount };
}

export function formatDecimalDotsToCommas(value: string): string {
  return value.replace(/\.(?=\d)/g, ",");
}
