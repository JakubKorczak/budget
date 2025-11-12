# ❓ FAQ - Najczęściej zadawane pytania

## 🔧 Instalacja i konfiguracja

### Q: Czy muszę mieć doświadczenie z programowaniem?

**A:** Nie! Potrzebujesz tylko podstawowej znajomości terminala. Cała instrukcja jest krok po kroku w `QUICK-START.md`.

### Q: Czy to jest darmowe?

**A:** Tak! Wszystkie użyte technologie są darmowe:

- Google Sheets - darmowe (konto Google)
- Google Cloud API - darmowy limit (wystarczający dla użytku domowego)
- Hosting (Vercel/Netlify) - darmowy tier wystarczy

### Q: Jakie mam koszty miesięczne?

**A:** 0 zł! Google Sheets API ma darmowy limit:

- 100 zapytań/100 sekund/użytkownik
- Dla użytku domowego to w pełni wystarczy

### Q: Czy działa na telefonie?

**A:** Tak! Aplikacja jest w pełni responsywna i działa na:

- 📱 iPhone
- 📱 Android
- 📱 iPad/Tablet
- 💻 Komputer

### Q: Mam błąd "No import alias found"

**A:** Upewnij się, że:

1. Zaktualizowałeś `tsconfig.json`
2. Dodałeś `paths` w `tsconfig.app.json`
3. Dodałeś `resolve.alias` w `vite.config.ts`

### Q: Tailwind CSS nie działa

**A:** Sprawdź czy:

1. Zainstalowałeś `@tailwindcss/vite`
2. Dodałeś plugin do `vite.config.ts`
3. Dodałeś `@import "tailwindcss"` w `index.css`

## 🔑 Google Cloud i API

### Q: Jak uzyskać API Key?

**A:** Szczegółowe instrukcje w `QUICK-START.md`, krótko:

1. Google Cloud Console → New Project
2. APIs & Services → Enable "Google Sheets API"
3. Credentials → Create → API Key

### Q: Czy API Key jest bezpieczny?

**A:** Tak, jeśli:

1. Ogranicz go do Google Sheets API
2. Ogranicz do swojej domeny (w produkcji)
3. NIE commituj go do GitHuba (jest w `.gitignore`)

### Q: Błąd "API key not valid"

**A:** Sprawdź:

1. Czy API Key jest poprawnie skopiowany
2. Czy Google Sheets API jest włączone
3. Czy arkusz jest udostępniony publicznie
4. Czy nie ma spacji przed/po kluczu w `.env`

### Q: Jak znaleźć Spreadsheet ID?

**A:** Z URL arkusza:

```
https://docs.google.com/spreadsheets/d/ABC123xyz456/edit
                                       ^^^^^^^^^^^^
                                       To jest ID
```

## 📊 Google Sheets

### Q: Muszę udostępnić arkusz publicznie?

**A:** Tak, ale tylko w trybie "Viewer" (odczyt). Nikt nie może edytować Twojego arkusza, mogą tylko go zobaczyć.

### Q: Czy ktoś może zobaczyć moje wydatki?

**A:** Tylko osoby, które mają link do arkusza. Nie jest to wyszukiwalne w Google.

### Q: Czy mogę mieć arkusz prywatny?

**A:** Tak, ale wtedy potrzebujesz OAuth 2.0 zamiast API Key. To bardziej skomplikowane - może to być przyszłe rozszerzenie.

### Q: Jak działa zapis danych?

**A:** Przez Google Apps Script:

1. Aplikacja wysyła dane do Apps Script
2. Apps Script (z Twoimi uprawnieniami) zapisuje w arkuszu
3. Więc tylko Ty możesz zapisywać dane

### Q: Mogę zmienić strukturę arkusza?

**A:** Tak, ale wtedy musisz zaktualizować:

- Zakresy w `googleSheets.ts` (np. `B79:B257`)
- Kod Apps Script
- Formuły obliczające kolumny/wiersze

### Q: Czy mogę dodać nowe kategorie?

**A:** Tak! Dodaj je w arkuszu "Wzorzec kategorii" w kolumnie B. Aplikacja automatycznie je pobierze przy następnym otwarciu.

## 🚀 Apps Script

### Q: Co to jest Apps Script?

**A:** To kod JavaScript, który działa w Google (jak makra w Excelu). Pozwala nam zapisywać dane w arkuszu.

### Q: Błąd "Apps Script URL not configured"

**A:** Sprawdź:

1. Czy wdrożyłeś Apps Script jako Web App
2. Czy skopiowałeś URL z `/exec` na końcu
3. Czy dodałeś URL do `.env`

### Q: Apps Script nie zapisuje danych

**A:** Sprawdź:

1. Czy wdrożyłeś jako Web App (nie jako API Executable)
2. "Execute as" = Me (Twój email)
3. "Who has access" = Anyone
4. Czy URL kończy się na `/exec`

### Q: Błąd "Permission denied"

**A:** Podczas pierwszego wdrożenia Apps Script:

1. Kliknij "Review permissions"
2. Wybierz swoje konto Google
3. Kliknij "Advanced" → "Go to [your project]"
4. Kliknij "Allow"

## 💻 Rozwój i kod

### Q: Jak dodać nową funkcjonalność?

**A:** Kod jest dobrze zorganizowany:

- Formularz: `src/components/ExpenseForm.tsx`
- API: `src/services/googleSheets.ts`
- Typy: `src/types/expense.ts`

### Q: Mogę zmienić kolory?

**A:** Tak! Edytuj zmienne CSS w `src/index.css`:

```css
:root {
  --primary: 222.2 47.4% 11.2%;
  --secondary: 210 40% 96.1%;
  /* itp. */
}
```

### Q: Jak dodać Dark Mode toggle?

**A:** Obecnie dark mode jest automatyczny (system preference). Możesz dodać przełącznik używając:

```tsx
const [theme, setTheme] = useState("light");
document.documentElement.classList.toggle("dark");
```

### Q: TypeScript pokazuje błędy

**A:** Sprawdź:

1. `npm install` - wszystkie zależności
2. `npm run build` - zobacz szczegóły błędów
3. Restart VS Code

## 🌐 Deployment

### Q: Gdzie mogę hostować aplikację?

**A:** Polecane (darmowe):

- Vercel (najłatwiejsze)
- Netlify
- Firebase Hosting
- GitHub Pages (wymaga dodatkowej konfiguracji)

### Q: Jak dodać zmienne środowiskowe w Vercel?

**A:**

1. Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Dodaj każdą zmienną (z prefiksem `VITE_`)

### Q: Aplikacja działa lokalnie, ale nie po wdrożeniu

**A:** Sprawdź:

1. Czy zmienne środowiskowe są ustawione w platformie
2. Czy Apps Script ma odpowiednie uprawnienia
3. Czy API Key ma ograniczenia domeny (dodaj swoją domenę)
4. Konsola przeglądarki (F12) - błędy

### Q: CORS error po wdrożeniu

**A:** To problem Apps Script. Upewnij się, że:

1. Apps Script "Who has access" = Anyone
2. Wdrożony jako Web App (nie API Executable)

## 📱 Użytkowanie

### Q: Mogę edytować wydatki w aplikacji?

**A:** Obecnie nie - aplikacja służy tylko do dodawania. Do edycji użyj Google Sheets bezpośrednio.

### Q: Co jeśli dodam wydatek dwa razy?

**A:** Druga wartość nadpisze pierwszą. Jeśli chcesz dodać do istniejącej, użyj auto-uzupełniania i wyrażeń: `50+35`

### Q: Jak działają wyrażenia matematyczne?

**A:** Możesz wpisać:

- `20+30` = 50
- `15.50*3` = 46.50
- `100-15` = 85
- `(50+30)/2` = 40

### Q: Nie widzę moich kategorii

**A:** Sprawdź:

1. Czy arkusz "Wzorzec kategorii" istnieje
2. Czy kategorie są w kolumnie B (34-213)
3. Czy format jest poprawny (zobacz `EXAMPLES.md`)
4. Konsola przeglądarki - błędy API

### Q: Wydatek nie zapisuje się

**A:** Sprawdź:

1. Czy arkusz dla bieżącego miesiąca istnieje (np. "Listopad")
2. Czy kategoria istnieje w tym arkuszu
3. Konsola przeglądarki - błędy
4. Apps Script execution log (w Apps Script editor)

### Q: Jak sprawdzić logi Apps Script?

**A:**

1. Otwórz Apps Script editor
2. View → Executions
3. Zobacz błędy wykonania

## 🔧 Problemy techniczne

### Q: Npm install kończy się błędem

**A:**

1. Usuń `node_modules` i `package-lock.json`
2. `npm cache clean --force`
3. `npm install`

### Q: Aplikacja się nie buduje

**A:**

1. `npm run build` - zobacz błędy
2. Sprawdź TypeScript errors
3. Sprawdź czy wszystkie importy są poprawne

### Q: Hot reload nie działa

**A:**

1. Restart serwera (`Ctrl+C`, potem `npm run dev`)
2. Sprawdź czy Vite config jest poprawny
3. Wyczyść cache przeglądarki

### Q: Obrazy/assets nie ładują się

**A:**

1. Umieść w folderze `public/`
2. Użyj ścieżki `/nazwa-pliku.png`
3. Lub importuj w komponencie: `import logo from './logo.png'`

## 🎨 Customizacja

### Q: Jak zmienić język na angielski?

**A:** Edytuj:

1. `src/components/ExpenseForm.tsx` - teksty UI
2. `src/types/expense.ts` - nazwy miesięcy
3. `src/services/googleSheets.ts` - komunikaty błędów

### Q: Jak dodać nowe pole do formularza?

**A:**

1. Dodaj do schematu Zod w `ExpenseForm.tsx`
2. Dodaj `FormField` w JSX
3. Zaktualizuj funkcję `addExpense()`

### Q: Jak zmienić motyw kolorystyczny?

**A:** Edytuj `src/index.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... */
}
```

## 📊 Wydajność

### Q: Aplikacja wolno się ładuje

**A:**

1. Zbuduj produkcyjną wersję: `npm run build`
2. Sprawdź rozmiar bundle: sprawdź `dist/`
3. Rozważ lazy loading komponentów

### Q: Za dużo zapytań do API

**A:** Aplikacja:

- Pobiera kategorie raz (przy starcie)
- Pobiera wartość przy zmianie kategorii/dnia
- Zapisuje przy submicie
  To powinno być w limitach Google (100/100s)

## 🆘 Pomoc

### Q: Gdzie szukać pomocy?

**A:**

1. `QUICK-START.md` - szybki start
2. `README-PL.md` - pełna dokumentacja
3. `EXAMPLES.md` - przykłady użycia
4. Konsola przeglądarki (F12) - błędy
5. Apps Script execution log - błędy zapisywania

### Q: Jak zgłosić błąd?

**A:** Zbierz informacje:

1. Opis problemu
2. Kroki do odtworzenia
3. Screenshot konsoli (F12)
4. Wersje (Node, npm, przeglądarki)

### Q: Czy mogę wnieść wkład do projektu?

**A:** Tak! Fork repozytorium i stwórz Pull Request.

---

**Nie znalazłeś odpowiedzi?**
Sprawdź szczegółową dokumentację w `README-PL.md` lub otwórz issue na GitHubie.
