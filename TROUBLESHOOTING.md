# 🔧 Rozwiązywanie problemów

## Błąd 429 - Rate Limit Exceeded

### Objaw

```
Failed to load resource: the server responded with a status of 429
```

### Przyczyna

Przekroczono limit zapytań do Google Sheets API (100 zapytań / 100 sekund).

### Rozwiązanie

1. **Odczekaj 1-2 minuty** i odśwież stronę
2. Aplikacja ma teraz **debouncing** (500ms opóźnienia), więc problem powinien się nie powtarzać
3. Jeśli problem się powtarza, sprawdź czy nie masz otwartych wielu zakładek z aplikacją

### Zapobieganie

- Nie odświeżaj strony zbyt często
- Zamknij inne zakładki z aplikacją
- Debouncing (już zaimplementowany) opóźnia zapytania

---

## Błąd: "Brak konfiguracji Apps Script URL"

### Objaw

```
Error: Brak konfiguracji Apps Script URL
```

### Przyczyna

Nie skonfigurowałeś Google Apps Script do zapisu danych.

### Rozwiązanie

#### Krok 1: Utwórz Apps Script

1. Otwórz swój arkusz Google Sheets
2. **Extensions > Apps Script**
3. Usuń przykładowy kod
4. Skopiuj cały kod z `google-apps-script/Code.gs`
5. Wklej i zapisz (Ctrl+S lub Cmd+S)

#### Krok 2: Wdróż jako Web App

1. Kliknij **Deploy > New deployment**
2. Kliknij ikonę koła zębatego ⚙️
3. Wybierz **Web app**
4. Ustaw:
   - **Description**: Budget API
   - **Execute as**: **Me** (twój email)
   - **Who has access**: **Anyone**
5. Kliknij **Deploy**
6. Kliknij **Authorize access**
7. Wybierz swoje konto Google
8. Kliknij **Advanced** → **Go to [your project]**
9. Kliknij **Allow**
10. **Skopiuj Web app URL** (kończy się na `/exec`)

#### Krok 3: Dodaj do .env

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/TWOJ_ID/exec
```

#### Krok 4: Zrestartuj serwer

```bash
# Ctrl+C (zatrzymaj)
npm run dev  # Uruchom ponownie
```

---

## Błąd: "Nie udało się pobrać kategorii"

### Objaw

Aplikacja nie ładuje kategorii z arkusza.

### Możliwe przyczyny i rozwiązania

#### 1. Nieprawidłowy API Key

**Sprawdź:**

```bash
# W pliku .env
VITE_GOOGLE_API_KEY=...
```

**Rozwiązanie:**

1. Google Cloud Console → Credentials
2. Sprawdź czy API Key jest poprawny
3. Skopiuj ponownie do `.env`
4. Zrestartuj serwer

#### 2. Google Sheets API nie włączone

**Rozwiązanie:**

1. Google Cloud Console → APIs & Services → Library
2. Wyszukaj "Google Sheets API"
3. Kliknij **Enable**

#### 3. Arkusz nie jest udostępniony

**Rozwiązanie:**

1. Otwórz arkusz Google Sheets
2. Kliknij **Share**
3. Zmień na **"Anyone with the link"**
4. Ustaw uprawnienia na **Viewer**
5. Kliknij **Done**

#### 4. Nieprawidłowy Spreadsheet ID

**Sprawdź:**

```bash
# W pliku .env
VITE_GOOGLE_SPREADSHEET_ID=...
```

**Jak znaleźć ID:**

```
URL: https://docs.google.com/spreadsheets/d/ABC123xyz456/edit
ID:                                          ^^^^^^^^^^^^
```

#### 5. Arkusz "Wzorzec kategorii" nie istnieje

**Rozwiązanie:**

1. Sprawdź czy arkusz ma zakładkę "Wzorzec kategorii"
2. Nazwa musi być dokładnie taka (z wielkich liter)
3. Kategorie muszą być w kolumnie B (34-213)

---

## Aplikacja nie zapisuje wydatków

### Sprawdź Apps Script

1. **Otwórz Apps Script editor**
2. **View → Executions**
3. Zobacz logi błędów

### Częste problemy:

#### Problem 1: Apps Script nie wdrożony jako Web App

**Rozwiązanie:**

- Deploy > Manage deployments
- Sprawdź czy typ = "Web app"
- "Who has access" = "Anyone"

#### Problem 2: Brak uprawnień

**Rozwiązanie:**

1. Deploy > New deployment
2. Podczas wdrożenia kliknij "Authorize access"
3. Zaakceptuj wszystkie uprawnienia

#### Problem 3: Nieprawidłowa nazwa miesiąca

**Rozwiązanie:**

- Sprawdź czy arkusz ma zakładkę z nazwą bieżącego miesiąca (np. "Listopad")
- Nazwa musi być po polsku
- Pierwsza litera wielka

---

## Błędy CORS

### Objaw

```
Access to XMLHttpRequest blocked by CORS policy
```

### Przyczyna

Apps Script nie był poprawnie wdrożony lub kod nie został zaktualizowany.

### Rozwiązanie:

#### 1. Zaktualizuj kod Apps Script

1. Otwórz Apps Script editor
2. **Usuń cały stary kod**
3. Wklej **nowy kod** z `google-apps-script/Code.gs` (obsługuje GET i POST)
4. Zapisz (Ctrl+S)

#### 2. Redeploy Apps Script

1. **Deploy > Manage deployments**
2. Kliknij ikonę ołówka (Edit) przy istniejącym deploymencie
3. **Version: New version**
4. Kliknij **Deploy**
5. **Skopiuj nowy URL** (może być inny!)
6. Zaktualizuj `.env`:

```env
VITE_APPS_SCRIPT_URL=nowy_url_tutaj
```

#### 3. Zrestartuj aplikację

```bash
# Ctrl+C (zatrzymaj)
npm run dev  # Uruchom ponownie
```

### Sprawdź czy działa:

1. Otwórz Apps Script URL w przeglądarce
2. Powinno pokazać: `{"status":"OK","message":"Apps Script endpoint is working"}`

---

## Aplikacja się nie buduje

### Błąd TypeScript

```bash
npm run build
```

**Sprawdź błędy w konsoli**

**Częste rozwiązania:**

1. Usuń `node_modules`: `rm -rf node_modules package-lock.json`
2. Zainstaluj ponownie: `npm install`
3. Sprawdź wersję Node: `node --version` (min. 18)

### Błąd Vite

**Rozwiązanie:**

1. Wyczyść cache: `rm -rf node_modules/.vite`
2. Zrestartuj serwer: `npm run dev`

---

## Aplikacja działa lokalnie, ale nie po wdrożeniu

### 1. Zmienne środowiskowe

**Problem:** Nie dodałeś zmiennych w platformie hostingowej.

**Rozwiązanie Vercel:**

1. Dashboard → Your Project → Settings
2. Environment Variables
3. Dodaj wszystkie zmienne z `.env`
4. Redeploy

**Rozwiązanie Netlify:**

1. Site settings → Build & deploy
2. Environment → Environment variables
3. Dodaj zmienne
4. Trigger deploy

### 2. API Key - ograniczenia domeny

**Rozwiązanie:**

1. Google Cloud Console → Credentials
2. Wybierz API Key → Edit
3. Application restrictions → HTTP referrers
4. Dodaj swoją domenę: `https://your-app.vercel.app/*`

---

## Narzędzia debugowania

### 1. Konsola przeglądarki (F12)

- Zakładka **Console** - błędy JavaScript
- Zakładka **Network** - zapytania API
- Filtruj po "googleapis.com"

### 2. Apps Script Logs

1. Apps Script editor
2. **View → Executions**
3. Zobacz szczegóły każdego wykonania

### 3. Google Cloud Console

1. APIs & Services → Dashboard
2. Sprawdź użycie quota
3. Zobacz błędy API

---

## Kontakt z wsparciem

Jeśli problem nie został rozwiązany:

1. **Zbierz informacje:**

   - Pełny komunikat błędu
   - Screenshot konsoli (F12)
   - Kroki do odtworzenia
   - Plik `.env` (BEZ wartości!)

2. **Sprawdź FAQ:**

   - [FAQ.md](FAQ.md)

3. **Zgłoś issue na GitHubie:**
   - Dołącz zebrane informacje
   - Opisz co już próbowałeś

---

## Szybka diagnoza

### Test 1: API Key

```bash
# Otwórz w przeglądarce (zamień ID i KEY):
https://sheets.googleapis.com/v4/spreadsheets/TWOJ_SPREADSHEET_ID/values/A1?key=TWOJ_API_KEY
```

✅ Powinno zwrócić JSON  
❌ Jeśli błąd - sprawdź API Key i uprawnienia

### Test 2: Apps Script

```bash
# Otwórz URL Apps Script w przeglądarce
```

✅ Powinno pokazać `{"status":"OK"}`  
❌ Jeśli błąd - sprawdź deployment

### Test 3: Kategorie

```bash
# W konsoli przeglądarki (F12):
fetch('https://sheets.googleapis.com/v4/spreadsheets/TWOJ_ID/values/Wzorzec kategorii!B34:B213?key=TWOJ_KEY')
  .then(r => r.json())
  .then(console.log)
```

✅ Powinno zwrócić dane  
❌ Jeśli błąd - sprawdź nazwę arkusza i zakres

---

**Nadal potrzebujesz pomocy?** Otwórz issue na GitHubie z pełnym opisem problemu.
