/**
 * Google Apps Script - Endpoint do zapisu wydatków
 *
 * INSTRUKCJA WDROŻENIA:
 * 1. Otwórz swój arkusz Google Sheets
 * 2. Przejdź do Extensions > Apps Script
 * 3. Wklej ten kod
 * 4. Kliknij Deploy > New deployment
 * 5. Wybierz typ: Web app
 * 6. Ustaw:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Skopiuj URL Web App i wklej go do .env jako VITE_APPS_SCRIPT_URL
 *
 * WAŻNE: Po każdej zmianie kodu musisz zrobić NEW DEPLOYMENT!
 */

/**
 * Obsługa żądań GET
 * Używane przez aplikację React do dodawania wydatków (obejście CORS)
 */
function doGet(e) {
  try {
    // Sprawdź czy parametry istnieją (gdy testujesz w edytorze, e może być undefined)
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action;

    if (action === "capabilities") {
      return jsonOutput({
        success: true,
        protocolVersion: 2,
        capabilities: ["batch", "compareAndSet", "validateOnly"],
      });
    }

    if (action === "addExpense" || action === "addSalary") {
      const category = params.category;
      const day = parseInt(params.day);
      const amount = params.amount ? parseFloat(params.amount) : null;
      const month = params.month;
      const formula = params.formula;
      const mode = params.mode;

      const entryType = action === "addSalary" ? "salary" : "expense";

      return handleLegacyEntryWithLock(
        category,
        day,
        amount,
        month,
        formula,
        mode,
        entryType
      );
    }

    // Endpoint testowy
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "OK",
        message: "Apps Script endpoint is working",
        timestamp: new Date().toISOString(),
        receivedParams: params,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.toString(),
        stack: error.stack || "No stack trace",
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Obsługa żądań POST (na przyszłość gdy CORS zostanie rozwiązany)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "applyBudgetEntries") {
      return handleApplyBudgetEntries(data);
    }
    const { action, category, day, amount, month, formula, mode } = data;

    if (action === "addExpense" || action === "addSalary") {
      const entryType = action === "addSalary" ? "salary" : "expense";
      return handleLegacyEntryWithLock(
        category,
        day,
        amount,
        month,
        formula,
        mode,
        entryType
      );
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: "Unknown action",
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

var BUDGET_MONTHS = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function handleApplyBudgetEntries(request) {
  var commands = Array.isArray(request.commands) ? request.commands : [];
  if (request.protocolVersion !== 2) {
    return jsonOutput({ success: false, error: "Unsupported protocol version" });
  }
  if (!commands.length || commands.length > 10) {
    return jsonOutput({
      success: false,
      error: "Batch musi zawierać od 1 do 10 operacji",
    });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonOutput({
      success: true,
      results: commands.map(function (command) {
        return {
          commandId: command.commandId || "unknown",
          status: "retryable",
          current: command.expected || { mode: "empty" },
          message: "busy",
        };
      }),
    });
  }

  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var results = commands.map(function (command) {
      return applyBudgetEntryCommand(
        spreadsheet,
        command,
        request.validateOnly === true
      );
    });
    if (request.validateOnly !== true) {
      SpreadsheetApp.flush();
    }
    return jsonOutput({ success: true, protocolVersion: 2, results: results });
  } catch (error) {
    return jsonOutput({ success: false, error: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function applyBudgetEntryCommand(spreadsheet, command, validateOnly) {
  var validationError = validateBudgetEntryCommand(command);
  if (validationError) {
    return {
      commandId: command && command.commandId ? command.commandId : "unknown",
      status: "invalid",
      current: command && command.expected ? command.expected : { mode: "empty" },
      message: validationError,
    };
  }

  var sheet = spreadsheet.getSheetByName(command.month);
  if (!sheet) {
    return invalidCommandResult(command, "Nie znaleziono arkusza miesiąca");
  }
  var row = resolveCategoryRow(sheet, command.month, command.entryType, command.category);
  if (row === -1) {
    return invalidCommandResult(command, "Nie znaleziono kategorii w arkuszu");
  }

  var column = 8 + Number(command.day);
  var cell = sheet.getRange(row, column);
  var current = readCanonicalCell(cell);
  var desired = normalizeCanonicalCell(command.desired);
  var expected = normalizeCanonicalCell(command.expected);

  if (canonicalCellsEqual(current, desired)) {
    return {
      commandId: command.commandId,
      status: "alreadyApplied",
      current: current,
    };
  }
  if (!canonicalCellsEqual(current, expected)) {
    return {
      commandId: command.commandId,
      status: "conflict",
      current: current,
      message: "Wartość w arkuszu różni się od wartości bazowej",
    };
  }
  if (validateOnly) {
    return {
      commandId: command.commandId,
      status: "applied",
      current: current,
      message: "validateOnly",
    };
  }

  if (desired.mode === "formula") {
    cell.setFormula(desired.formula);
  } else {
    cell.setValue(desired.amount);
  }
  return {
    commandId: command.commandId,
    status: "applied",
    current: desired,
  };
}

function validateBudgetEntryCommand(command) {
  if (!command || typeof command !== "object") return "Brak operacji";
  if (!command.commandId || typeof command.commandId !== "string") return "Brak commandId";
  if (command.entryType !== "expense" && command.entryType !== "salary") return "Nieprawidłowy typ wpisu";
  if (BUDGET_MONTHS.indexOf(command.month) === -1) return "Nieprawidłowy miesiąc";
  if (!Number.isInteger(Number(command.day)) || Number(command.day) < 1 || Number(command.day) > 31) return "Nieprawidłowy dzień";
  if (!command.category || typeof command.category !== "string" || command.category.length > 200) return "Nieprawidłowa kategoria";
  if (!command.expected || !command.desired) return "Brak wartości bazowej lub docelowej";
  if (!isValidCanonicalCell(command.expected, true)) return "Nieprawidłowa wartość bazowa";
  if (!isValidCanonicalCell(command.desired, false)) return "Nieprawidłowa wartość docelowa";
  return null;
}

function isValidCanonicalCell(value, allowEmpty) {
  if (!value || typeof value !== "object") return false;
  if (value.mode === "empty") return allowEmpty;
  if (value.mode === "value") return Number.isFinite(Number(value.amount));
  if (value.mode !== "formula") return false;
  return (
    typeof value.formula === "string" &&
    value.formula.length <= 100 &&
    /^=[0-9.,+\-\s]+$/.test(value.formula) &&
    Number.isFinite(Number(value.amount))
  );
}

function invalidCommandResult(command, message) {
  return {
    commandId: command.commandId,
    status: "invalid",
    current: command.expected || { mode: "empty" },
    message: message,
  };
}

function normalizeCanonicalCell(value) {
  if (!value || value.mode === "empty") return { mode: "empty" };
  if (value.mode === "formula") {
    return {
      mode: "formula",
      formula: String(value.formula).trim(),
      amount: roundBudgetAmount(value.amount),
    };
  }
  return { mode: "value", amount: roundBudgetAmount(value.amount) };
}

function readCanonicalCell(cell) {
  var formula = cell.getFormula();
  var value = cell.getValue();
  if (formula) {
    return {
      mode: "formula",
      formula: formula.trim(),
      amount: roundBudgetAmount(value),
    };
  }
  if (value === "" || value === null) return { mode: "empty" };
  return { mode: "value", amount: roundBudgetAmount(value) };
}

function roundBudgetAmount(value) {
  var numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function canonicalCellsEqual(left, right) {
  var a = normalizeCanonicalCell(left);
  var b = normalizeCanonicalCell(right);
  if (a.mode !== b.mode) return false;
  if (a.mode === "empty") return true;
  if (a.mode === "formula") {
    return a.formula === b.formula && a.amount === b.amount;
  }
  return a.amount === b.amount;
}

function resolveCategoryRow(sheet, month, entryType, category) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "budget-rows-v2:" + entryType + ":" + month;
  var cached = cache.get(cacheKey);
  var rows = cached ? JSON.parse(cached) : buildCategoryRowMap(sheet, entryType);
  if (!cached) {
    cache.put(cacheKey, JSON.stringify(rows), 21600);
  }
  var normalized = String(category).trim().toLowerCase();
  var row = rows[normalized];

  if (row && sheet.getRange(row, 2).getDisplayValue().trim().toLowerCase() === normalized) {
    return row;
  }
  rows = buildCategoryRowMap(sheet, entryType);
  cache.put(cacheKey, JSON.stringify(rows), 21600);
  return rows[normalized] || -1;
}

function buildCategoryRowMap(sheet, entryType) {
  var firstRow = entryType === "salary" ? 58 : 79;
  var lastRow = entryType === "salary" ? 70 : 257;
  var values = sheet.getRange(firstRow, 2, lastRow - firstRow + 1, 1).getDisplayValues();
  var result = {};
  values.forEach(function (row, index) {
    var label = row[0] ? row[0].trim().toLowerCase() : "";
    if (label && label !== "." && result[label] === undefined) {
      result[label] = firstRow + index;
    }
  });
  return result;
}

function handleLegacyEntryWithLock(
  category,
  day,
  amount,
  month,
  formula,
  mode,
  entryType
) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonOutput({ success: false, retryable: true, error: "busy" });
  }
  try {
    return handleAddExpense(
      category,
      day,
      amount,
      month,
      formula,
      mode,
      entryType
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Główna funkcja dodająca wydatek do arkusza
 */
function handleAddExpense(category, day, amount, month, formula, mode, entryType) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(month);

    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          error: "Nie znaleziono arkusza dla miesiąca: " + month,
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Zakres zależy od rodzaju wpisu: wynagrodzenia B58:B70, wydatki B79:B257.
    const isSalary = entryType === "salary";
    const categoryRowIndex = resolveCategoryRow(
      sheet,
      month,
      isSalary ? "salary" : "expense",
      category
    );

    if (categoryRowIndex === -1) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          error: 'Kategoria nie znaleziona: "' + category + '"',
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Oblicz kolumnę na podstawie dnia (kolumna I = dzień 1, indeks 9)
    const dayColumnIndex = 8 + parseInt(day);

    // Zapisz wartość lub formułę
    const cell = sheet.getRange(categoryRowIndex, dayColumnIndex);
    const hasFormula =
      (mode === "formula" && formula) ||
      (typeof formula === "string" && formula.trim().startsWith("="));

    if (hasFormula) {
      cell.setFormula(formula);
    } else {
      if (typeof amount !== "number" || isNaN(amount)) {
        throw new Error("Brak prawidłowej kwoty do zapisania");
      }
      cell.setValue(amount);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message: hasFormula
          ? "Formuła dodana pomyślnie"
          : isSalary
            ? "Wynagrodzenie dodane pomyślnie"
            : "Wydatek dodany pomyślnie",
        data: {
          category: category,
          day: day,
          amount: amount,
          formula: hasFormula ? formula : null,
          mode: hasFormula ? "formula" : "value",
          month: month,
          row: categoryRowIndex,
          column: dayColumnIndex,
        },
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.toString(),
        stack: error.stack,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
