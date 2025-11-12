/**
 * PROSTY KOD TESTOWY - Użyj tego aby sprawdzić czy deployment działa
 *
 * INSTRUKCJA:
 * 1. Skopiuj CAŁY ten kod
 * 2. Otwórz Apps Script (Extensions > Apps Script)
 * 3. ZASTĄP CAŁĄ zawartość Code.gs tym kodem
 * 4. Kliknij "Deploy" > "Test deployments" > kliknij "COPY URL"
 * 5. Otwórz ten URL w przeglądarce - powinieneś zobaczyć JSON
 * 6. Jeśli działa, przejdź do nowego deploymenta
 */

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: true,
      message: "Test OK - Apps Script działa!",
      timestamp: new Date().toISOString(),
      parameters: e.parameter,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}
