# 💰 Budżet Domowy - React + Google Sheets

Nowoczesna, responsywna aplikacja webowa do zarządzania budżetem domowym z synchronizacją w czasie rzeczywistym z Google Sheets.

![React](https://img.shields.io/badge/React-19.2-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4.1-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Funkcje

- 📊 **Synchronizacja z Google Sheets** - Wszystkie dane w jednym miejscu
- 🎨 **Nowoczesny UI** - shadcn/ui + Tailwind CSS
- 📱 **Responsywny** - Działa na telefonie, tablecie i komputerze
- 🔢 **Wyrażenia matematyczne** - Wpisz `20+30` zamiast liczyć w głowie
- 🌙 **Dark Mode** - Automatyczne dostosowanie do systemu
- 📦 **Offline cache** - Service Worker buforuje statyczne pliki i ostatnie kategorie
- ✅ **Walidacja** - Formularze z pełną walidacją
- 🚀 **Szybki** - Zbudowany na Vite

## 🎥 Jak to działa?

1. Wybierz kategorię wydatku (np. "Zakupy spożywcze")
2. Wybierz dzień miesiąca
3. Wpisz kwotę (lub wyrażenie: `49.99+25.50`)
4. Kliknij "Dodaj wydatek"
5. **Gotowe!** Dane są automatycznie w Google Sheets

## 🚀 Szybki Start

### Wymagania

- Node.js 18+
- Konto Google
- 10 minut czasu

### Instalacja

```bash
# Klonuj repozytorium (lub pobierz ZIP)
git clone <repository-url>
cd budget

# Zainstaluj zależności
npm install

# Konfiguruj .env (zobacz QUICK-START.md)
cp .env.example .env
# Edytuj .env i dodaj swoje klucze

# Uruchom
npm run dev
```

### Potrzebujesz szczegółowych instrukcji?

👉 **[QUICK-START.md](QUICK-START.md)** - Kompletny przewodnik krok po kroku (10 minut)

### 📦 Analiza bundla

Jeśli potrzebujesz sprawdzić co zajmuje najwięcej miejsca w paczce produkcyjnej, uruchom:

```bash
npm run analyze
```

Po zakończeniu builda raport znajdziesz w `dist/bundle-report.html` (otwórz w przeglądarce). Dzięki temu łatwo wyłapiesz moduły wymagające dalszego podziału lub lazy-loadingu.

### 🌐 Offline / PWA

W buildzie produkcyjnym aplikacja rejestruje lekkiego Service Workera (`public/sw.js`), który buforuje kluczowe assety oraz ostatnie odpowiedzi Google Sheets. Aby to sprawdzić lokalnie:

```bash
npm run build
npm run preview
```

Następnie otwórz aplikację w przeglądarce, przełącz DevTools w tryb „Offline” i odśwież — UI nadal będzie dostępne, a zapisane wcześniej kategorie zostaną wczytane z cache.

## 📚 Dokumentacja

- **[QUICK-START.md](QUICK-START.md)** - Szybki start (10 minut)
- **[README-PL.md](README-PL.md)** - Pełna dokumentacja techniczna
- **[EXAMPLES.md](EXAMPLES.md)** - Przykłady użycia aplikacji
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Jak wdrożyć na Vercel/Netlify
- **[FAQ.md](FAQ.md)** - Najczęściej zadawane pytania
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - ⚠️ Rozwiązywanie problemów
- **[PROJECT-SUMMARY.md](PROJECT-SUMMARY.md)** - Podsumowanie projektu

## 🛠️ Technologie

- **React 19** + **TypeScript** - UI i typowanie
- **Vite** - Szybki build tool
- **Tailwind CSS v4** - Nowoczesny styling
- **shadcn/ui** - Piękne komponenty
- **React Hook Form + Zod** - Formularze i walidacja
- **Google Sheets API** - Integracja z arkuszami
- **Google Apps Script** - Zapis danych

## 📊 Struktura arkusza

Aplikacja wymaga określonej struktury Google Sheets:

```
📋 Twój Arkusz
├── 📄 Wzorzec kategorii (kategorie i podkategorie)
├── 📄 Styczeń (wydatki)
├── 📄 Luty (wydatki)
├── ...
└── 📄 Grudzień (wydatki)
```

Szczegóły w [README-PL.md](README-PL.md)

## 🎯 Roadmap

- ✅ Dodawanie wydatków
- ✅ Synchronizacja z Google Sheets
- ✅ Responsywny design
- ✅ Wyrażenia matematyczne
- 🔲 Edycja wydatków
- 🔲 Wykresy i statystyki
- 🔲 PWA / Offline support
- 🔲 Powiadomienia
- 🔲 Export do PDF

## 🤝 Wsparcie

Masz problem? Sprawdź:

1. **[FAQ.md](FAQ.md)** - Odpowiedzi na najczęstsze pytania
2. **[QUICK-START.md](QUICK-START.md)** - Instrukcje konfiguracji
3. **Konsola przeglądarki (F12)** - Sprawdź błędy JavaScript
4. **GitHub Issues** - Zgłoś problem

## 📄 Licencja

MIT - Możesz swobodnie używać i modyfikować

## 👨‍💻 Autor

Stworzone z ❤️ przez GitHub Copilot

---

**Zaczynamy?** Przejdź do [QUICK-START.md](QUICK-START.md) i uruchom aplikację w 10 minut! 🚀
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
globalIgnores(['dist']),
{
files: ['**/*.{ts,tsx}'],
extends: [
// Other configs...
// Enable lint rules for React
reactX.configs['recommended-typescript'],
// Enable lint rules for React DOM
reactDom.configs.recommended,
],
languageOptions: {
parserOptions: {
project: ['./tsconfig.node.json', './tsconfig.app.json'],
tsconfigRootDir: import.meta.dirname,
},
// other options...
},
},
])

```

```
