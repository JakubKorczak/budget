# 🚀 Szybki Start - Budżet Domowy

## Krok 1: Konfiguracja Google Cloud (5 min)

1. **Utwórz projekt**:

   - Idź na: https://console.cloud.google.com/
   - Kliknij "New Project" > Nadaj nazwę "Budżet Domowy"

2. **Włącz Google Sheets API**:

   - W menu bocznym: APIs & Services > Library
   - Wyszukaj: "Google Sheets API"
   - Kliknij: Enable

3. **Utwórz API Key**:
   - APIs & Services > Credentials
   - Create Credentials > API Key
   - Skopiuj klucz (zapisz go bezpiecznie!)

## Krok 2: Przygotuj arkusz Google (2 min)

1. **Otwórz swój arkusz budżetu**
2. **Udostępnij publicznie**:
   - Kliknij przycisk "Share"
   - Zmień na "Anyone with the link"
   - Ustaw uprawnienia: "Viewer" (tylko odczyt)
3. **Skopiuj ID arkusza** z URL:
   - URL: `https://docs.google.com/spreadsheets/d/ABC123xyz/edit`
   - ID: `ABC123xyz`

## Krok 3: Apps Script dla zapisu (3 min)

1. **W arkuszu Google**:
   - Extensions > Apps Script
2. **Wklej kod**:
   - Usuń domyślny kod
   - Skopiuj cały kod z `google-apps-script/Code.gs`
   - Wklej i zapisz (Ctrl+S)
3. **Wdróż**:
   - Deploy > New deployment
   - Ikona koła zębatego > Web app
   - Execute as: "Me"
   - Who has access: "Anyone"
   - Deploy
   - **SKOPIUJ URL** (kończy się na `/exec`)

## Krok 4: Konfiguracja aplikacji (1 min)

1. **Uzupełnij plik `.env`**:

```bash
VITE_GOOGLE_API_KEY=tu_wklej_api_key
VITE_GOOGLE_SPREADSHEET_ID=tu_wklej_id_arkusza
VITE_APPS_SCRIPT_URL=tu_wklej_url_apps_script
```

## Krok 5: Uruchom aplikację (30 sek)

```bash
npm install
npm run dev
```

Otwórz: http://localhost:5173

## ✅ Gotowe!

Teraz możesz:

- Wybrać kategorię z listy
- Wybrać dzień
- Wpisać koszt (lub wyrażenie matematyczne: 20+30)
- Kliknąć "Dodaj wydatek"

Dane automatycznie zapisują się w Google Sheets! 🎉

## 🆘 Problemy?

### "Nie udało się pobrać kategorii"

- Sprawdź API Key
- Sprawdź czy arkusz jest udostępniony publicznie
- Sprawdź czy Spreadsheet ID jest poprawny

### "Nie udało się dodać wydatku"

- Sprawdź Apps Script URL
- Sprawdź czy Apps Script jest wdrożony jako Web App
- Sprawdź czy masz uprawnienia do edycji arkusza

### Otwórz konsolę przeglądarki (F12)

- Zakładka "Console" pokaże szczegóły błędu
