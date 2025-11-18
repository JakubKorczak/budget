# Calculator Entry Plan

## Goal

- Allow mobile users to enter simple expressions right above the numeric keyboard, supporting only addition, subtraction, and the equals sign.
- Ensure Enter submits either a computed numeric result or the literal spreadsheet formula string when the entry begins with `=`.

## Current State (ExpenseForm)

- `sanitizePriceInput` allows digits, separators, and `+ - * / ( )` which are later evaluated.
- Validation in `expenseFormSchema.price` accepts any math expression and executes it via `new Function` before form submission.
- Submission always evaluates the expression and sends the numeric result to Google Sheets through `addExpense`.

## Functional Requirements

1. **Operator Ribbon**: Display a compact control bar above the keyboard with buttons `+`, `-`, `=` and possibly backspace/clear shortcuts.
2. **Expression Editing**: Tapping a button appends the corresponding symbol to the active price input while preserving cursor focus.
3. **Execution Rules**:
   - If the string does **not** start with `=`, Enter should evaluate the expression using addition/subtraction only, then send the computed numeric value.
   - If the string **does** start with `=`, Enter should skip evaluation and submit the literal formula (e.g. `"=98+43-9"`).
4. **Validation**: Block unsupported characters/operators and surface an error message if the expression cannot be parsed or resolves to more than two decimal places.
5. **Accessibility**: Buttons must be reachable via keyboard focus, announce descriptive labels, and respect disabled states while loading cached amounts.

## UX / UI Details

- Reuse the existing `Input` wrapper in `ExpenseForm` and insert a new `CalculatorRibbon` component just above it (inside the same `FormItem`).
- Ribbon layout: horizontal flex, equal-width buttons, subtle border, contrasting background to differentiate it from the numeric field.
- Provide haptic feedback hook (optional) or at least click animation to mirror native keypad buttons.
- When the price field is disabled (spinner state), buttons should also be disabled.

## Technical Plan

1. **Input Sanitization**
   - Update `sanitizePriceInput` to strip all characters except digits, decimal separators, whitespace, `+`, `-`, and leading `=`.
   - Normalize commas to dots immediately so validation operates on a single decimal separator.
2. **Schema Validation**
   - Modify `expenseFormSchema.price` to use a dedicated parser:
     - Case A (`value.startsWith("=")`): validate that the remainder only contains digits, optional decimals, and `+`/`-` with optional spaces.
     - Case B: ensure the expression matches the same character set but without the leading `=`; evaluate using a safe parser (see next step).
3. **Expression Evaluator**
   - Replace `new Function` calls with a deterministic evaluator that tokenizes numbers (`/\d+(?:\.\d{0,2})?/`) and operators `+` or `-`.
   - Accumulate the result sequentially; reject consecutive operators or trailing operators.
4. **Form Submission Flow**
   - During `onSubmit`, branch on leading `=`:
     - Case A: pass the raw string to `addExpense` and skip optimistic numeric cache updates.
     - Case B: compute numeric result (rounded to two decimals) and pass it down.
   - Adjust optimistic cache logic to handle formula strings (no numeric delta available).
5. **CalculatorRibbon Component**
   - New file under `src/components/CalculatorRibbon.tsx` (or inside `ExpenseForm` if scoped): props include `onInsert(symbol: string)` and `disabled`.
   - Buttons call `onInsert("+")`, `onInsert("-")`, `onInsert("=")`; optionally include `onSubmit` trigger for Enter key.
   - Integrate with `FormControl` by forwarding refs to the input so button clicks can manage focus/caret (e.g., via `inputRef.current?.focus()`).
6. **Keyboard Handling**
   - Listen for the dedicated Enter key: if the user presses Enter while the input is focused, run the same branch logic as the submit handler (possibly via `form.handleSubmit`).
   - Prevent default when necessary to avoid duplicate submissions.
7. **Testing & QA Hooks**
   - Add unit tests for the evaluator (e.g., `evaluateLinearExpression("12+3-4") === 11`).
   - Consider lightweight E2E or RTL tests to ensure the ribbon injects symbols correctly.

## Validation & QA Checklist

- Typing `12+8-3` and pressing Enter submits `17.00` to Sheets.
- Typing `=56+4-10` and pressing Enter submits the literal string and does not alter the optimistic cache.
- Attempting to enter `*` or `/` results in immediate sanitization and a visible validation error if submitted.
- Ribbon buttons respect the disabled state and are reachable via screen readers.
- Cached amount hydration still works and does not overwrite formula entries unexpectedly.

## Open Questions

- Should Enter on external keyboards behave identically to tapping the on-screen checkmark? (Assumed yes.)
- Do we need a visible hint informing users that starting with `=` sends the full formula? (Recommended to add helper text under the input.)
- Should formulas update aggregated day caches, or remain transparent until Sheets recalculates? (Current plan: skip optimistic updates.)
