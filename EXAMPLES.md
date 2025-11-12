# 📖 Przykłady użycia aplikacji Budżet Domowy

## Podstawowe użycie

### Dodawanie prostego wydatku

1. Wybierz kategorię: **"Jedzenie i napoje" → "Zakupy spożywcze"**
2. Wybierz dzień: **15**
3. Wpisz koszt: **89.50**
4. Kliknij "Dodaj wydatek"

✅ Wydatek zostanie zapisany w arkuszu Google w miesiącu Listopad, dzień 15, kategoria "Zakupy spożywcze"

### Dodawanie wydatku z wyrażeniem matematycznym

Możesz użyć wyrażeń matematycznych, np.:

- **20+30** = 50 zł (dwa zakupy)
- **15.50\*3** = 46.50 zł (3 produkty po 15.50 zł)
- **100-15** = 85 zł (100 zł minus rabat 15 zł)
- **(50+30)/2** = 40 zł (podział kosztu)

**Przykład:**

1. Kategoria: **Transport → Paliwo**
2. Dzień: **12**
3. Koszt: **45.50+52.30** (dwa tankowania)
4. Wynik: **97.80 zł**

## Przykładowe kategorie

### 🍕 Jedzenie i napoje

- Zakupy spożywcze
- Restauracje i fast food
- Kawa i desery

### 🏠 Dom

- Czynsz
- Rachunki (prąd, gaz, woda)
- Internet i telefon
- Wyposażenie domu

### 🚗 Transport

- Paliwo
- Parking
- Komunikacja miejska
- Przejazdy (taxi, uber)

### 🎉 Rozrywka

- Kino i teatr
- Hobby
- Streaming (Netflix, Spotify)

### 👕 Odzież

- Ubrania
- Obuwie
- Dodatki

### 💊 Zdrowie

- Leki
- Wizyty lekarskie
- Suplementy

### 🎓 Edukacja

- Kursy
- Książki
- Materiały edukacyjne

## Scenariusze użycia

### Scenariusz 1: Zakupy w weekend

**Sobota (9 listopada):**

- Lidl: 125.50 zł
- Piekarnia: 18.00 zł
- **Łącznie: 143.50 zł**

**Jak dodać:**

1. Kategoria: Zakupy spożywcze
2. Dzień: 9
3. Koszt: `125.50+18`
4. Dodaj wydatek

### Scenariusz 2: Tankowanie paliwa

**Poniedziałek (11 listopada):**

- Stacja BP: 220 zł

**Jak dodać:**

1. Kategoria: Transport → Paliwo
2. Dzień: 11
3. Koszt: `220`
4. Dodaj wydatek

### Scenariusz 3: Rachunki miesięczne

**Pierwszy dzień miesiąca:**

- Prąd: 150 zł
- Gaz: 80 zł
- Woda: 45 zł

**Jak dodać (suma):**

1. Kategoria: Dom → Rachunki
2. Dzień: 1
3. Koszt: `150+80+45` = 275 zł
4. Dodaj wydatek

### Scenariusz 4: Podział kosztów

**Kolacja w restauracji - podział na pół:**

- Całkowity rachunek: 180 zł
- Twoja część: 90 zł

**Jak dodać:**

1. Kategoria: Jedzenie → Restauracje
2. Dzień: 8
3. Koszt: `180/2`
4. Dodaj wydatek

## Funkcje specjalne

### Auto-uzupełnianie poprzedniej wartości

Gdy wybierzesz kategorię i dzień, aplikacja automatycznie sprawdzi czy w tym dniu dla tej kategorii już jest jakaś wartość i wyświetli ją w polu "Koszt".

**Przykład:**

- Masz już wydatek "Zakupy spożywcze" 12 listopada: 50 zł
- Wybierasz: Zakupy spożywcze + Dzień 12
- Pole "Koszt" automatycznie wypełni się: 50
- Możesz dodać więcej: `50+35` (nowe zakupy)

### Responsywność

Aplikacja działa świetnie na:

- 📱 Smartfonach (iPhone, Android)
- 📱 Tabletach (iPad, Galaxy Tab)
- 💻 Komputerach (desktop)

### Dark mode

Aplikacja automatycznie dostosowuje się do trybu ciemnego systemu.

## Wskazówki i triki

### ✅ Dobre praktyki

1. **Grupuj podobne wydatki**

   - Zamiast dodawać każdy produkt osobno, zsumuj zakupy z jednego sklepu

2. **Używaj wyrażeń matematycznych**

   - Szybsze niż kalkulator: `45.50+32.80+15.20`

3. **Sprawdzaj auto-uzupełnione wartości**

   - Zanim dodasz wydatek, zobacz czy już coś było tego dnia

4. **Dodawaj wydatki na bieżąco**
   - Nie czekaj do końca miesiąca - dodawaj od razu po zakupach

### ⚠️ Częste błędy

1. **Nieprawidłowe wyrażenia**

   - ❌ `20 + 30 złotych`
   - ✅ `20+30`

2. **Przecinki vs kropki**

   - ✅ Oba działają: `49.99` lub `49,99`

3. **Wybierz właściwy miesiąc**
   - Aplikacja automatycznie wybiera bieżący miesiąc
   - Sprawdź czy dodajesz wydatek do właściwego miesiąca

## Synchronizacja z Google Sheets

### Jak to działa?

1. **Odczyt kategorii**: Aplikacja pobiera kategorie z arkusza "Wzorzec kategorii"
2. **Odczyt wartości**: Sprawdza czy dla danego dnia i kategorii jest już wartość
3. **Zapis**: Zapisuje nową wartość przez Google Apps Script

### Co się dzieje w arkuszu?

Po dodaniu wydatku "Zakupy spożywcze" 15 listopada: 89.50 zł

- Otwiera arkusz: **Listopad**
- Znajduje wiersz: **Zakupy spożywcze**
- Znajduje kolumnę: **Dzień 15**
- Wpisuje wartość: **89.50**

## FAQ

**Q: Czy mogę edytować wydatki w aplikacji?**
A: Obecnie nie - możesz tylko dodawać. Do edycji użyj bezpośrednio Google Sheets.

**Q: Co się stanie jeśli dodam wydatek dwa razy?**
A: Druga wartość nadpisze pierwszą. Jeśli chcesz dodać do istniejącej, użyj funkcji auto-uzupełniania i wyrażeń matematycznych.

**Q: Czy dane są bezpieczne?**
A: Tak! Dane są przechowywane w Twoim arkuszu Google Sheets. Tylko Ty masz do nich dostęp.

**Q: Czy działa offline?**
A: Nie, wymaga połączenia z internetem do synchronizacji z Google Sheets.

**Q: Jak dodać nową kategorię?**
A: Dodaj ją w arkuszu "Wzorzec kategorii" - aplikacja automatycznie ją pobierze przy następnym otwarciu.
