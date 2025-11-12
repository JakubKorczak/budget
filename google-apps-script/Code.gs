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

    if (action === "addExpense") {
      const category = params.category;
      const day = parseInt(params.day);
      const amount = parseFloat(params.amount);
      const month = params.month;

      return handleAddExpense(category, day, amount, month);
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
    const { action, category, day, amount, month } = data;

    if (action === "addExpense") {
      return handleAddExpense(category, day, amount, month);
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

/**
 * Główna funkcja dodająca wydatek do arkusza
 */
function handleAddExpense(category, day, amount, month) {
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

    // Zakres kategorii w arkuszu
    const categoryRange = sheet.getRange("B79:B257");
    const categoryValues = categoryRange.getValues().flat();

    // Znajdź wiersz kategorii (trim aby usunąć spacje)
    const categoryIndex = categoryValues.findIndex(
      (val) => val && val.toString().trim() === category.trim()
    );

    if (categoryIndex === -1) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          error: 'Kategoria nie znaleziona: "' + category + '"',
          availableCategories: categoryValues.filter((v) => v).slice(0, 5),
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const categoryRowIndex = categoryIndex + 79;

    // Oblicz kolumnę na podstawie dnia (kolumna I = dzień 1, indeks 9)
    const dayColumnIndex = 8 + parseInt(day);

    // Zapisz wartość
    const cell = sheet.getRange(categoryRowIndex, dayColumnIndex);
    cell.setValue(amount);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message: "Wydatek dodany pomyślnie",
        data: {
          category: category,
          day: day,
          amount: amount,
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
