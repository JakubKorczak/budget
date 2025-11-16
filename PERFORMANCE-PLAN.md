# Plan przyspieszenia działania aplikacji

## 1. Cele i wskaźniki sukcesu

- **TTI (Time To Interactive)**: poniżej 3 s na urządzeniach mobilnych (Lighthouse).
- **Czas reakcji formularza dodawania**: < 150 ms na akcje UI, < 1 s na potwierdzenie dodania.
- **Limit zapytań do Google Sheets**: < 30/min dzięki cache'owi.
- **Stabilność**: zero błędów konsoli w krytycznych ścieżkach.

## 2. Bazowa diagnostyka

1. Uruchom `npm run build && npm run preview`, zbierz metryki Lighthouse (mobile/desktop).
2. Włącz `React DevTools Profiler` i prześledź zachowanie `ExpenseForm` przy zmianach pól.
3. Wykorzystaj `Chrome Performance` do sprawdzenia layout thrashingu przy otwieraniu list rozwijanych.
4. Zanotuj czasy sieciowe w DevTools (`Performance Insights`) dla:
   - pobierania kategorii (`getCategories`),
   - autofill kwoty (`getAmount`),
   - dodania wydatku (`addExpense`).

## 3. Optymalizacje po stronie klienta

### 3.1 Rendering React

- **Memorowanie danych formularza**: użyć `useMemo` dla przetworzonych list kategorii, aby nie tworzyć nowych referencji przy każdym renderze.
- **Split komponentów**: wyodrębnić z `ExpenseForm` duże fragmenty (Select, Input) do osobnych memoizowanych komponentów.
- **React Hook Form**: włączyć `shouldUnregister: true` i `mode: "onSubmit"` (jeśli UX pozwala), aby ograniczyć walidacje.
- **Virtualizacja listy kategorii**: zastąpić statyczny `SelectContent` komponentem wirtualizowanym (np. `cmdk` + `react-virtualized`) dla setek pozycji.

### 3.2 UX i interakcje

- **Prefetch danych kategorii**: korzystać z `useQuery` (TanStack) zamiast `useEffect`, aby zyskać cache i stale data.
- **Optimistic UI**: już istnieje reset formularza; rozważyć lokalne sumowanie wydatków, aby wynik był widoczny bez roundtrip.
- **Debounce i throttle**: dopracować opóźnienia `getAmount` (np. 150 ms + anulowanie poprzednich requestów via AbortController).

### 3.3 Statyczne zasoby

- **Analiza bundla**: uruchomić `npx vite-bundle-visualizer` lub `rollup-plugin-visualizer`.
- **Code splitting**: dynamiczne importy dla rzadko używanych widoków (`Login` vs `ExpenseForm`).
- **Tree-shaking ikon**: importować tylko potrzebne ikony z `lucide-react` (obecnie cała paczka przez `*`?).
- **CSS**: przejść na `tailwindcss@next` JIT lub CSS Modules dla mniejszych stylów runtime.

## 4. Warstwa danych i sieć

### 4.1 Google Sheets API

- **Batch requests**: wykorzystać `spreadsheets.values.batchGet` dla pobierania wielu wierszy jednocześnie.
- **Cache aplikacyjny**: już dodany w `src/services/googleSheets.ts`; rozszerzyć o `localStorage/sessionStorage` aby przetrwać reload.
- **Apps Script proxy**: przenieść logikę dodawania do Apps Script z prostym endpointem POST (zmniejsza CORS i liczbę requestów).
- **Retry z backoff**: dodać `axios-retry` dla błędów 429/5xx.

## 5. Build, infrastruktura i dostawa

1. **ESLint perf rules**: dodać `eslint-plugin-react-perf`.
2. **PNPM + Turborepo** (jeśli projekt urośnie) aby skrócić czasy budowy.
3. **CI scripts**: pipeline `lint → test → build → lighthouse-ci` aby blokować regresje.
4. **Hosting**: jeśli jeszcze nie, użyć CDN (Vercel/Netlify) z HTTP/2 push i kompresją brotli.
5. **Service Worker**: prosty PWA SW cache'ujący statyczne assety + ostatnie dane kategorii.

## 6. Plan wdrożenia (fazy)

| Faza                      | Zakres                                 | Rezultat                                   |
| ------------------------- | -------------------------------------- | ------------------------------------------ |
| 1. Audyt i pomiary        | Lighthouse, Profiler, bundler          | Zebrane baseline KPI                       |
| 2. Klient szybkie wygrane | Memoization, debounce, Select UX       | mniejsza liczba renderów, szybszy autofill |
| 3. Warstwa danych         | Batch, cache trwały, Apps Script proxy | mniej zapytań, stabilne limity API         |

## 7. Status wdrożenia (15.11.2025)

- ✅ Formularz wykorzystuje `@tanstack/react-query` (stale cache + lokalne memoizacje) oraz trwały cache w `localStorage`, więc ponowne załadowanie aplikacji nie bije Google Sheets.
- ✅ `CategoryCombobox` zastąpił stary `Select` — ma wyszukiwarkę, wirtualizację z `@tanstack/react-virtual` i jest memoizowany, co znacząco ogranicza liczbę renderów.
- ✅ `React Hook Form` działa teraz w trybie `onSubmit` z `shouldUnregister: true`, a pola zostały rozbite na mniejsze komponenty, co poprawia wydajność i czytelność.
- ✅ Autofill kwoty korzysta z `AbortController` + debounce 150 ms, dzięki czemu nie powstają wyścigi requestów i nie przekraczamy limitów API.
- ✅ Build wspiera `rollup-plugin-visualizer` (`npm run analyze`) oraz lazy-loading widoków (`React.lazy` dla `Login` i `ExpenseForm`), co zmniejsza TTI i daje narzędzia do dalszej analizy bundla.
- ✅ Service Worker (`public/sw.js`) cache'uje statyczne assety i wyniki zapytań do Google Sheets (tryb network-first), zapewniając fallback offline dla listy kategorii oraz szybsze ponowne wizyty.
- ℹ️ Apps Script proxy i batch requesty pozostają otwartym tematem — wymagają zmian po stronie arkusza/Apps Scriptu.

## 8. Kolejne kroki (najbliższy sprint)

1. Przygotować i udokumentować Apps Script endpoint (`POST /addExpense`) tak, aby zmniejszyć zależność od API key i uprościć CORS.
2. Wprowadzić batchowane odczyty (`spreadsheets.values.batchGet`) dla pobierania wielu kategorii jednocześnie — zmniejszy to liczbę requestów per render.
3. Zweryfikować Service Workera na środowisku produkcyjnym (offline test + kontrola budowy), a wynik i checklistę dołączyć do `DEPLOYMENT.md`.
4. Podłączyć Lighthouse CI do pipeline’u (`lint → test → build → lhci`) i ustawić progi TTI < 3 s.
5. Zmierzyć TTI i czas reakcji formularza na urządzeniach mobilnych po wdrożonych zmianach oraz zarchiwizować wyniki w repo.
