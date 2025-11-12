# Changelog

Wszystkie istotne zmiany w projekcie będą dokumentowane w tym pliku.

## [1.0.0] - 2025-11-12

### ✨ Dodano

- Formularz dodawania wydatków z trzema polami:
  - Kategoria (select z grupowaniem)
  - Dzień (1-31)
  - Koszt (z obsługą wyrażeń matematycznych)
- Integracja z Google Sheets API
  - Pobieranie kategorii z arkusza "Wzorzec kategorii"
  - Pobieranie poprzednich wartości dla kategorii/dnia
  - Zapis wydatków przez Google Apps Script
- Komponenty UI (shadcn/ui):
  - Button
  - Input
  - Select
  - Form
  - Card
  - Label
- Walidacja formularza (React Hook Form + Zod)
- Responsywny design (mobile-first)
- Dark mode support (automatyczny)
- Loading states
- Bezpieczne obliczanie wyrażeń matematycznych (safeEval)
- TypeScript strict mode
- Konfiguracja przez zmienne środowiskowe (.env)

### 📚 Dokumentacja

- README.md - Główny readme z linkami
- README-PL.md - Pełna dokumentacja techniczna
- QUICK-START.md - Przewodnik szybkiego startu (10 min)
- EXAMPLES.md - Przykłady użycia aplikacji
- DEPLOYMENT.md - Instrukcje wdrożenia
- FAQ.md - Najczęściej zadawane pytania
- PROJECT-SUMMARY.md - Podsumowanie projektu
- google-apps-script/Code.gs - Kod Apps Script

### 🛠️ Technologie

- React 19.2.0
- TypeScript 5.9.3
- Vite 7.2.2
- Tailwind CSS 4.1.17
- shadcn/ui (latest)
- React Hook Form 7.66.0
- Zod 4.1.12
- Axios 1.13.2

### 🔒 Bezpieczeństwo

- .env w .gitignore
- safeEval zamiast eval()
- API Key z możliwością ograniczeń
- Apps Script z własnymi uprawnieniami użytkownika

### 📱 Funkcjonalności

- Auto-uzupełnianie poprzednich wartości
- Wyrażenia matematyczne (20+30, 50\*2, 100/2)
- Komunikaty sukcesu/błędu
- Automatyczny reset formularza po zapisie
- Obsługa przecinków i kropek w liczbach
- Bieżący dzień jako domyślny

---

## Format

Projekt używa [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
i stosuje się do [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### Typy zmian

- `✨ Dodano` - nowe funkcjonalności
- `🔧 Zmieniono` - zmiany w istniejących funkcjonalnościach
- `🐛 Naprawiono` - poprawki błędów
- `🗑️ Usunięto` - usunięte funkcjonalności
- `🔒 Bezpieczeństwo` - poprawki bezpieczeństwa
- `📚 Dokumentacja` - zmiany w dokumentacji
