# SztuKaFe Katalog

Aplikacja do ewidencji dzieł galerii SztuKaFe (Kraków). Działa na iPhonie, iPadzie i komputerze, także bez internetu.

Pełny plan prac: [PLAN.md](PLAN.md). Stan: **faza 8 — testy, dostępność, dokumentacja** (konfiguracja Google: [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md)).

## Uruchomienie na komputerze (dla programisty)

```
npm install
npm run dev      # podgląd na żywo
npm test         # testy
npm run build    # wersja produkcyjna w folderze dist
```

## Wdrożenie

Po wypchnięciu zmian do gałęzi `main` GitHub Actions budują aplikację i publikują ją na GitHub Pages
(w ustawieniach repozytorium: Settings → Pages → Source: **GitHub Actions**).

## Role

- **Admin** widzi wszystko, także ceny zakupu i minimalne, zarządza użytkownikami i kopiami zapasowymi.
- **Pracownik** nie widzi cen zakupu ani minimalnych (ani w aplikacji, ani na Dysku Google).

Pierwsza zalogowana osoba zostaje adminem. Kolejne dodaje admin w **Ustawienia → Użytkownicy i role**.

## Blokada aplikacji

W **Ustawienia → Bezpieczeństwo** można włączyć blokadę Face ID / Touch ID / kodem urządzenia oraz zapasowy kod PIN.
Aplikacja blokuje się przy każdym uruchomieniu i po wyjściu na wskazany czas (domyślnie 5 minut).

**To blokada dostępu do aplikacji, a nie szyfrowanie danych.** Chroni przed przypadkowym zajrzeniem do katalogu na
odblokowanym telefonie. Nie chroni przed kimś, kto ma pełny dostęp do urządzenia, bo dane w pamięci przeglądarki nie są
zaszyfrowane.

## Kopie zapasowe

Admin: aplikacja raz na dobę zapisuje w folderze `backups` na Dysku plik `RRRR-MM-DD.json` (dane dzieł, bez zdjęć i bez
cen wewnętrznych) i trzyma ostatnie 30. Przywracanie: **Ustawienia → Kopie zapasowe** → wybierz datę → podgląd liczby
dzieł → **Przywróć**. Przywracanie niczego nie kasuje: dzieła dodane po kopii zostają, usunięte wracają.

## Import i eksport

**Import (admin):** Ustawienia → Import CSV / XLSX. Wskaż plik (CSV z dowolnym separatorem lub XLSX), sprawdź dopasowanie
kolumn, obejrzyj podgląd i raport błędów, potwierdź. Zdjęć nie importujemy — dzieła bez zdjęć mają oznaczenie „do
uzupełnienia”, a w katalogu jest filtr **Do uzupełnienia**. Zdjęcia dodajesz w edycji dzieła telefonem.

**Eksport:** zakładka Dokumenty → Eksport: cały katalog jako XLSX lub CSV oraz plik produktów dla sklepu Shopify (tylko
dzieła „Dostępne”, jako szkice). Pracownik nie dostaje cen zakupu ani minimalnych.

## Instalacja na iPhonie

1. Otwórz adres aplikacji w **Safari** (nie w Chrome).
2. Stuknij przycisk Udostępnij → **Do ekranu początkowego** → Dodaj.
3. Uruchamiaj aplikację z ikony na ekranie początkowym (działa pełnoekranowo i bez internetu).

## Pierwsze uruchomienie

1. Ustawienia → **Zaloguj przez Google** (konto galerii). Pierwsza zalogowana osoba zostaje adminem.
2. Dodaj dzieło: przycisk **+** → zdjęcie przodu → (opcjonalnie kolejne ujęcia) → dane → Zapisz.
3. Zalecane: Ustawienia → Bezpieczeństwo → włącz blokadę Face ID i ustaw kod PIN.

Konfiguracja Google (jednorazowa): [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).

## Dodawanie użytkownika

Ustawienia → Użytkownicy i role → Dodaj osobę (adres Google + rola). Dopóki projekt Google Cloud jest w trybie Testowanie,
dodaj też ten adres jako użytkownika testowego w konsoli Google Cloud.

## Przywracanie kopii zapasowej

Ustawienia → Kopie zapasowe → wybierz datę → podgląd liczby dzieł → Przywróć. Niczego nie kasuje.

## Co robić, gdy „nie synchronizuje”

1. Sprawdź internet i napis w Ustawienia → Synchronizacja (czy jest „Do wysłania”, czy błąd).
2. Stuknij **Synchronizuj teraz**.
3. Baner „Zaloguj ponownie” = wygasła sesja Google (co 7 dni w trybie Testowanie). Stuknij go — zmiany nie giną.
4. Ten sam błąd po ponownym zalogowaniu: sprawdź, czy folder SztuKaFe-Katalog jest udostępniony Twojemu kontu.

## Testy

```
npm test          # testy jednostkowe (Vitest)
npm run test:e2e  # testy w przeglądarce (Playwright, rozmiary iPhone 15 i iPad, atrapa Google)
```
