# 🔧 DIAGNOZA PROBLEMU 302 - KROK PO KROKU

## Problem: 302 Redirect zamiast JSON

### Krok 1: Test podstawowego działania

1. **Otwórz Google Apps Script**:

   - Przejdź do swojego arkusza Google Sheets
   - Extensions > Apps Script

2. **Wklej prosty kod testowy**:

   - Skopiuj CAŁY kod z pliku `Code-SIMPLE-TEST.gs`
   - ZASTĄP całą zawartość pliku Code.gs
   - Zapisz (Ctrl+S / Cmd+S)

3. **Przetestuj deployment**:

   - Kliknij "Deploy" (w prawym górnym rogu)
   - Wybierz "Test deployments"
   - Skopiuj URL który się pojawi
   - **Otwórz ten URL w przeglądarce**

4. **Co powinieneś zobaczyć**:

   ```json
   {
     "success": true,
     "message": "Test OK - Apps Script działa!",
     "timestamp": "2025-11-12T...",
     "parameters": {}
   }
   ```

5. **Jeśli widzisz 302 redirect**:
   - ❌ Deployment NIE działa poprawnie
   - Możliwe przyczyny:
     - Nie zapisałeś pliku przed deploymentem
     - Deployment jest nieautoryzowany
     - Musisz autoryzować skrypt

### Krok 2: Autoryzacja skryptu

Jeśli widzisz 302, Apps Script może wymagać autoryzacji:

1. W edytorze Apps Script kliknij "Run" (▶️) przy funkcji `doGet`
2. Pojawi się prośba o autoryzację
3. Kliknij "Review permissions"
4. Wybierz swoje konto Google
5. Kliknij "Advanced" > "Go to [nazwa projektu]"
6. Kliknij "Allow"
7. **Teraz spróbuj ponownie test deployment**

### Krok 3: Nowy deployment produkcyjny

Dopiero jak test deployment działa:

1. Kliknij "Deploy" > "New deployment"
2. Kliknij ikonę ⚙️ obok "Select type"
3. Wybierz "Web app"
4. Ustaw:
   - **Description**: "Budget App v1" (lub inna nazwa)
   - **Execute as**: **Me** (twój email)
   - **Who has access**: **Anyone**
5. Kliknij "Deploy"
6. **Skopiuj Web App URL** - będzie wyglądał jak:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
7. **Wklej ten URL do pliku `.env`** jako `VITE_APPS_SCRIPT_URL`

### Krok 4: Test z parametrami

Otwórz w przeglądarce:

```
TWÓJ_URL?action=test&category=Test&day=12
```

Powinieneś zobaczyć:

```json
{
  "success": true,
  "message": "Test OK - Apps Script działa!",
  "timestamp": "...",
  "parameters": {
    "action": "test",
    "category": "Test",
    "day": "12"
  }
}
```

### Krok 5: Pełny kod

Dopiero jak prosty test działa, zamień kod na pełny z pliku `Code.gs`

---

## Częste problemy

### Problem: 302 po kliknięciu URL

**Rozwiązanie**: Musisz autoryzować skrypt (Krok 2)

### Problem: "Authorization required"

**Rozwiązanie**:

1. Kliknij link autoryzacji
2. Wybierz konto
3. Kliknij "Advanced" > "Go to..."
4. Kliknij "Allow"

### Problem: Deployment nie aktualizuje się

**Rozwiązanie**:

- NIE edytuj istniejącego deploymentu
- Zawsze rób "New deployment" dla nowej wersji

### Problem: URL zwraca stary kod

**Rozwiązanie**:

- Upewnij się że używasz URL z NOWEGO deploymentu
- Stary URL zawsze będzie używał starego kodu

---

## ✅ Checklist

- [ ] Kod testowy wklejony do Apps Script
- [ ] Plik zapisany (Ctrl+S)
- [ ] Test deployment wykonany
- [ ] URL testowy otwarty w przeglądarce
- [ ] Widzę JSON (nie 302)
- [ ] Skrypt autoryzowany
- [ ] Nowy production deployment utworzony
- [ ] URL skopiowany do .env
- [ ] Test z parametrami wykonany
- [ ] Pełny kod Code.gs wklejony
- [ ] Kolejny nowy deployment wykonany
- [ ] URL zaktualizowany w .env
