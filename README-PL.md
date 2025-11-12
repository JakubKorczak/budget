# Budżet Domowy - Aplikacja React + Google Sheets

Prosta aplikacja do zarządzania wydatkami domowymi z synchronizacją z Google Sheets.

## 🚀 Funkcjonalności

- ✅ Formularz dodawania wydatków (kategoria, dzień, koszt)
- ✅ Synchronizacja z Google Sheets
- ✅ Automatyczne pobieranie kategorii z arkusza "Wzorzec kategorii"
- ✅ Podgląd poprzedniej wartości dla wybranej kategorii i dnia
- ✅ Responsywny design (mobile-first)
- ✅ Walidacja formularza
- ✅ Obsługa wyrażeń matematycznych w cenie (np. 20+30)

## 📋 Wymagania

- Node.js (v18 lub nowszy)
- Konto Google z dostępem do Google Sheets
- Google Cloud Project z włączonym Google Sheets API

## 🔧 Konfiguracja

### 1. Instalacja zależności

```bash
npm install
```

### 2. Konfiguracja Google Cloud

#### a) Utwórz projekt w Google Cloud Console

1. Przejdź do [Google Cloud Console](https://console.cloud.google.com/)
2. Utwórz nowy projekt lub wybierz istniejący
3. Włącz **Google Sheets API**:
   - Przejdź do "APIs & Services" > "Library"
   - Wyszukaj "Google Sheets API"
   - Kliknij "Enable"

#### b) Utwórz API Key

1. Przejdź do "APIs & Services" > "Credentials"
2. Kliknij "Create Credentials" > "API Key"
3. Skopiuj wygenerowany klucz
4. (Opcjonalnie) Ogranicz klucz do Google Sheets API dla bezpieczeństwa

#### c) Udostępnij arkusz publicznie (tylko do odczytu)

1. Otwórz swój arkusz Google Sheets
2. Kliknij "Share" (Udostępnij)
3. Zmień ustawienia na "Anyone with the link can view"
4. Upewnij się, że jest ustawione tylko **Viewer** (nie Editor)

### 3. Konfiguracja Google Apps Script (do zapisu danych)

#### a) Utwórz Apps Script

1. Otwórz swój arkusz Google Sheets
2. Przejdź do **Extensions > Apps Script**
3. Usuń przykładowy kod i wklej zawartość z pliku `google-apps-script/Code.gs`
4. Zapisz projekt (Ctrl+S)

#### b) Wdróż jako Web App

1. Kliknij **Deploy > New deployment**
2. Kliknij ikonę koła zębatego i wybierz **Web app**
3. Ustaw:
   - **Description**: Budget API
   - **Execute as**: Me (twój email)
   - **Who has access**: Anyone
4. Kliknij **Deploy**
5. Skopiuj **Web app URL** (kończy się na `/exec`)

### 4. Konfiguracja zmiennych środowiskowych

1. Skopiuj plik `.env.example` do `.env`:

```bash
cp .env.example .env
```

2. Uzupełnij wartości w `.env`:

```env
# API Key z Google Cloud Console
VITE_GOOGLE_API_KEY=twój_api_key_tutaj

# ID arkusza (z URL arkusza)
# URL: https://docs.google.com/spreadsheets/d/ABC123xyz/edit
# ID: ABC123xyz
VITE_GOOGLE_SPREADSHEET_ID=twój_spreadsheet_id_tutaj

# URL Web App z Apps Script (kończy się na /exec)
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/twój_id/exec
```

### 5. Struktura arkusza Google Sheets

Upewnij się, że Twój arkusz ma:

- **Arkusz "Wzorzec kategorii"** z kategoriami w kolumnie B (wiersze 34-213)
- **Arkusze miesięczne** (Styczeń, Luty, Marzec, itd.) z:
  - Kategoriami w kolumnie B (wiersze 79-257)
  - Dniami w kolumnach I-AM (kolumny 9-39, dni 1-31)

## 🎯 Uruchomienie

### Tryb deweloperski

```bash
npm run dev
```

Aplikacja będzie dostępna pod adresem: `http://localhost:5173`

### Build produkcyjny

```bash
npm run build
npm run preview
```

## 🏗️ Struktura projektu

```
src/
├── components/
│   ├── ui/              # Komponenty shadcn/ui
│   └── ExpenseForm.tsx  # Główny formularz wydatków
├── services/
│   └── googleSheets.ts  # Komunikacja z Google Sheets API
├── types/
│   └── expense.ts       # Typy TypeScript
├── lib/
│   └── utils.ts         # Utility functions
├── App.tsx              # Główny komponent aplikacji
└── main.tsx             # Entry point

google-apps-script/
└── Code.gs              # Google Apps Script dla zapisu danych
```

## 🔒 Bezpieczeństwo

⚠️ **UWAGA**:

- Nie commituj pliku `.env` do repozytorium!
- API Key powinien być ograniczony do Google Sheets API
- Arkusz powinien być udostępniony tylko w trybie "View" (odczyt)
- Zapis odbywa się przez Apps Script z Twoimi uprawnieniami

## 🛠️ Technologie

- **React 19** - biblioteka UI
- **TypeScript** - typowanie
- **Vite** - build tool
- **Tailwind CSS v4** - stylowanie
- **shadcn/ui** - komponenty UI
- **React Hook Form** - zarządzanie formularzem
- **Zod** - walidacja
- **Axios** - HTTP client
- **Google Sheets API** - integracja z arkuszami

## 📝 Licencja

MIT

## 🤝 Wsparcie

W razie problemów sprawdź:

1. Czy API Key jest poprawny i ma dostęp do Google Sheets API
2. Czy arkusz jest udostępniony publicznie (tylko do odczytu)
3. Czy Apps Script jest wdrożony jako Web App
4. Czy wszystkie zmienne w `.env` są poprawnie ustawione
5. Konsola deweloperska przeglądarki (F12) - sprawdź błędy

## 🎨 Customizacja

Możesz łatwo dostosować:

- Kolory i style w `src/index.css`
- Layout w `src/App.tsx`
- Komponenty formularza w `src/components/ExpenseForm.tsx`
