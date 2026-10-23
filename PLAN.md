# SztuKaFe Katalog — plan implementacji dla Claude Code

> Umieść ten plik w katalogu głównym repozytorium. Claude Code realizuje fazy po kolei.
> Po każdej fazie: commit, krótkie podsumowanie, czekaj na akceptację przed następną fazą.

---

## 0. Kontekst

**Właściciel:** Mieszko, galeria sztuki SztuKaFe (Kraków). Nie jest programistą: komunikaty błędów, instrukcje konfiguracji i README pisz prostym językiem, po polsku.

**Problem:** obecny program do ewidencji jest toporny. Zdjęcie trzeba przenosić z telefonu na komputer, żeby je wgrać.

**Cel:** porządek w zbiorze 50–200 dzieł (+20–100 rocznie). Dodawanie dzieła ze zdjęciem bezpośrednio z iPhone'a w mniej niż minutę.

**Użytkownicy:** 2–3 osoby. Urządzenia: iPhone, iPad, Mac/PC (przeglądarka).

**Budżet:** 0 zł miesięcznie. Bez własnego serwera.

---

## 1. Założenia do potwierdzenia przez właściciela

Domyślne decyzje. Implementuj zgodnie z nimi, chyba że plik `DECISIONS.md` mówi inaczej.

| # | Temat | Decyzja domyślna |
|---|---|---|
| D1 | Przechowywanie danych | Google Drive: wspólny folder galerii, logowanie kontem Google |
| D2 | Role | `admin` (wszystko) + `pracownik` (bez ceny zakupu i minimalnej) |
| D3 | Waluta | Jedna waluta per dzieło (PLN lub EUR); sumy na pulpicie w PLN po kursie NBP |
| D4 | Sklep | Eksport CSV w formacie importu produktów. Platforma: **TODO (Shopify / WooCommerce)** |
| D5 | Poza zakresem v1 | Raporty stanu zachowania, historia przemieszczeń, publiczny katalog online, moduł wystaw |

**Wymagane od właściciela przed fazą 6–7:** logo SztuKaFe (SVG/PNG) + kolory HEX → `assets/brand/`. Przykładowy eksport CSV z obecnego programu → `assets/import-sample.csv`.

---

## 2. Stack

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Build | Vite + React 18 + TypeScript | Szybki build statyczny |
| PWA | `vite-plugin-pwa` (Workbox) | Instalacja na ekranie iOS, działanie offline |
| Lokalna baza | Dexie.js (IndexedDB) | Offline-first, zapytania, migracje schematu |
| Synchronizacja | Google Drive API v3 + Google Identity Services (token client) | Wymóg D1, 0 zł |
| Routing | React Router (HashRouter) | Działa na GitHub Pages bez przekierowań |
| UI | CSS Modules + tokeny w `src/styles/tokens.css` | Kolory marki w jednym miejscu |
| Zdjęcia | `browser-image-compression` | Miniatury i podglądy |
| PDF | `pdf-lib` + osadzona czcionka z polskimi znakami (np. Noto Sans) | Karta dzieła, cennik, lista inwentaryzacyjna, etykiety |
| CSV / Excel | `papaparse`, `xlsx` (SheetJS) | Import i eksport |
| Blokada | WebAuthn (platform authenticator) | Face ID / Touch ID / kod urządzenia |
| Testy | Vitest + Testing Library; Playwright (smoke, viewport iPhone) | |
| Hosting | GitHub Pages przez GitHub Actions | 0 zł, HTTPS |

---

## 3. Architektura

```
iPhone / iPad / Mac (PWA)
 ├─ UI (React)
 ├─ Dexie (IndexedDB) ← jedyne źródło prawdy dla UI
 │    ├─ artworks, photos (blob), outbox, meta
 └─ SyncEngine ── Google Drive API ──► folder „SztuKaFe-Katalog”
```

**Zasada:** UI czyta i pisze wyłącznie do Dexie. `SyncEngine` w tle wysyła `outbox` na Drive i pobiera zmiany. Aplikacja działa w pełni bez sieci.

### 3.1 Struktura folderu na Google Drive

```
SztuKaFe-Katalog/                  (udostępniony wszystkim użytkownikom)
├─ artworks/{id}.json              (jeden plik na dzieło → mniej konfliktów)
├─ photos/{id}/{photoId}.jpg       (oryginał, max 2560 px, JPEG q0.85)
├─ photos/{id}/{photoId}_thumb.jpg (400 px)
├─ config/settings.json            (kategorie, lokalizacje, licznik, użytkownicy i role)
└─ backups/YYYY-MM-DD.json         (pełny snapshot bez zdjęć, ostatnie 30)

SztuKaFe-Prywatne/                 (udostępniony TYLKO adminom)
└─ prices/{id}.json                { purchasePrice, minPrice }
```

**Ważne:** ukrywanie cen musi być realne, a nie tylko w UI. Pracownik ma dostęp do folderu, więc mógłby otworzyć JSON bezpośrednio. Dlatego cena zakupu i minimalna leżą w osobnym folderze, którego pracownik nie widzi. Cena sprzedaży jest w `artworks/` (jest publiczna w cenniku).

### 3.2 Uprawnienia OAuth — do zweryfikowania w fazie 3

- Najpierw spróbuj zakresu `drive.file` + Google Picker do wskazania wspólnego folderu przy pierwszym uruchomieniu. **Sprawdź empirycznie**, czy użytkownik B widzi pliki utworzone przez użytkownika A tą samą aplikacją.
- Jeśli nie: użyj zakresu `drive`. Projekt Google Cloud zostaw w trybie **Testing** z 2–3 użytkownikami testowymi. Wtedy weryfikacja aplikacji przez Google nie jest potrzebna.
- Opisz wynik w `DECISIONS.md`.

---

## 4. Model danych

```ts
type Category = 'malarstwo' | 'rysunek' | 'grafika' | 'fotografia'
              | 'rzezba' | 'ceramika' | 'szklo' | 'bizuteria_rzemioslo';
type Status   = 'dostepne' | 'w_magazynie' | 'zarezerwowane' | 'sprzedane';
type Location = 'sala_wystawowa' | 'magazyn';
type Basis    = 'wlasnosc' | 'komis';
type Currency = 'PLN' | 'EUR';

interface Artwork {
  id: string;                 // UUID v4 (stabilny klucz, niezależny od numeru)
  invNo: string;              // SZK-2026-0001 (patrz 4.1)
  invNoProvisional: boolean;  // true = nadany offline, do potwierdzenia
  title: string;              // WYMAGANE
  artist: string;             // WYMAGANE (pole tekstowe, bez bazy artystów)
  year?: number;
  category: Category;
  technique?: string;
  material?: string;          // materiał / podłoże
  dimensionsCm: { w: number; h: number; d?: number };  // WYMAGANE (w, h)
  weightKg?: number;
  edition?: string;           // np. "3/25"
  description?: string;
  certificate?: { photoId?: string; note?: string };
  basis: Basis;
  status: Status;
  location: Location;
  reservation?: { until: string /*ISO date*/; note?: string };  // gdy status = zarezerwowane
  salePrice: number;          // WYMAGANE
  currency: Currency;
  photoIds: string[];         // WYMAGANE ≥1, max 5; [0] = zdjęcie główne (przód)
  createdAt: string; updatedAt: string;
  createdBy: string; updatedBy: string;   // e-mail Google
  deleted?: boolean;          // soft delete (tombstone do synchronizacji)
}

interface PrivatePrices { id: string; purchasePrice?: number; minPrice?: number; updatedAt: string; }

interface Photo {
  id: string; artworkId: string;
  kind: 'przod' | 'tyl' | 'sygnatura' | 'detal' | 'inne' | 'certyfikat';
  thumb: Blob;      // lokalnie zawsze
  original?: Blob;  // lokalnie do czasu wysłania; potem można zwolnić (LRU)
  driveFileId?: string; driveThumbId?: string;
}

interface OutboxItem { id: string; entity: 'artwork' | 'prices' | 'photo' | 'settings'; entityId: string; op: 'upsert' | 'delete'; queuedAt: string; attempts: number; }
```

### 4.1 Numer inwentarzowy przy pracy offline

- Online: pobierz `config/settings.json`, zwiększ `counter[rok]`, zapisz z warunkiem wersji (pole `version` w JSON; przy niezgodności pobierz ponownie i powtórz). Numer finalny.
- Offline: nadaj `SZK-2026-T{4 znaki losowe}`, ustaw `invNoProvisional = true`. Przy pierwszej synchronizacji zamień na numer finalny.
- Test: dwa urządzenia offline tworzą dzieła jednocześnie, po synchronizacji brak duplikatów.

### 4.2 Konflikty

Last-write-wins na poziomie całego rekordu według `updatedAt`. Przegraną wersję zapisz w Dexie (`conflicts`) i pokaż w Ustawieniach listę „Konflikty do przejrzenia”. Przy 2–3 użytkownikach wystarczy.

---

## 5. Ekrany

| Ekran | Zawartość |
|---|---|
| **Blokada** | Face ID / kod (WebAuthn). Pierwsze uruchomienie: rejestracja passkey |
| **Pulpit** | Liczba dzieł, wartość zbioru (suma cen sprzedaży statusów ≠ sprzedane, w PLN), sprzedane w tym roku, rezerwacje wygasające w ciągu 7 dni (alert), status synchronizacji. Duży przycisk **+ Nowe dzieło** |
| **Lista** | Siatka miniatur (iPad/Mac) / lista (iPhone). Szukaj: tytuł, artysta. Filtry: status, cena od–do. Sortowanie: data dodania, nr inw., cena |
| **Nowe dzieło (kreator)** | Krok 1: zdjęcie przodu (`<input type="file" accept="image/*" capture="environment">`). Krok 2: opcjonalnie do 4 ujęć: tył, sygnatura, detal, inne (każde z przyciskiem „Pomiń”). Krok 3: formularz, wymagane pola wyróżnione. Zapis możliwy dopiero po uzupełnieniu wymaganych pól |
| **Karta dzieła** | Galeria zdjęć (swipe), wszystkie pola, szybka zmiana statusu, akcje: Edytuj, Udostępnij PDF, Etykieta, Usuń (potwierdzenie w UI, nie `confirm()`) |
| **Dokumenty** | Cennik PDF (filtry jak w liście), lista inwentaryzacyjna PDF, eksport CSV/XLSX, eksport do sklepu |
| **Inwentaryzacja** | Tryb listy z checkboxami „jest” per dzieło, pogrupowane według lokalizacji. Postęp X/Y, zapis stanu, raport PDF z brakami |
| **Ustawienia** | Konto Google, folder Drive, użytkownicy i role (tylko admin), import CSV, kopie zapasowe (lista + przywracanie), konflikty, wersja aplikacji |

**Widoczność ról:** dla `pracownik` ukryj pola ceny zakupu i minimalnej w formularzu, karcie, eksportach i filtrach. Aplikacja nie pobiera folderu `SztuKaFe-Prywatne`.

---

## 6. Fazy

Każda faza kończy się działającą, wdrożoną wersją.

### Faza 1 — Szkielet i hosting
- Vite + React + TS, `vite-plugin-pwa` (manifest: nazwa „SztuKaFe”, `display: standalone`, ikony 192/512 + `apple-touch-icon` 180).
- Meta iOS: `apple-mobile-web-app-capable`, `viewport-fit=cover`, safe-area insets w layoucie.
- GitHub Actions → GitHub Pages. `base` w Vite ustawiony na nazwę repo.
- Tokeny kolorów z placeholderami do czasu dostarczenia marki.
- **Akceptacja:** aplikacja otwiera się z linku na iPhone. Udostępnij → „Do ekranu początkowego” → uruchamia się pełnoekranowo, działa w trybie samolotowym.

### Faza 2 — Dane lokalne i CRUD
- Dexie: schemat z sekcji 4, migracje wersjonowane.
- Kreator nowego dzieła, karta, edycja, lista, wyszukiwanie, filtry, soft delete.
- Zdjęcia: kompresja do podglądu (1600 px) i miniatury (400 px), oryginał max 2560 px. Obsłuż HEIC: jeśli przeglądarka nie dekoduje, pokaż czytelny komunikat.
- Walidacja wymaganych pól. Komunikaty po polsku.
- Rezerwacja: status `zarezerwowane` wymaga daty `until`.
- **Akceptacja:** na iPhone offline dodaję dzieło z 3 zdjęciami w < 60 s. Po zamknięciu i ponownym otwarciu aplikacji dane są.

### Faza 3 — Google Drive i synchronizacja
- Instrukcja w `docs/GOOGLE_SETUP.md` krok po kroku ze zrzutami: projekt Google Cloud, włączenie Drive API i Picker API, OAuth client (Web), autoryzowane źródła = adres GitHub Pages, użytkownicy testowi. Client ID jako zmienna `VITE_GOOGLE_CLIENT_ID` (sekret repo w Actions).
- Pierwsze uruchomienie: logowanie → utworzenie lub wybór folderów (sekcja 3.1).
- `SyncEngine`: wysyłka `outbox` z ponawianiem (exponential backoff), pobieranie zmian przez `changes.list` z zapisanym `pageToken`. Wyzwalacze: start aplikacji, `online`, `visibilitychange → visible`, co 2 min gdy aplikacja jest otwarta.
- Zdjęcia: upload resumable dla oryginałów. Pobieranie oryginału dopiero na żądanie (otwarcie pełnego podglądu, PDF).
- Wygaśnięcie tokena: odnowienie po cichu, a przy niepowodzeniu baner „Zaloguj ponownie”. Nie gub danych w `outbox`.
- Numer inwentarzowy wg 4.1, konflikty wg 4.2.
- Weryfikacja zakresu OAuth wg 3.2 → `DECISIONS.md`.
- **Akceptacja:** dzieło dodane offline na iPhone pojawia się na Macu w ciągu 2 min od odzyskania sieci. Edycja tego samego dzieła na dwóch urządzeniach → jedna wersja wygrywa, druga widoczna w „Konflikty”.

### Faza 4 — Role, blokada, kopie zapasowe
- Role w `config/settings.json` (`users: [{ email, role }]`). Pierwszy użytkownik = admin.
- Admin udostępnia folder `SztuKaFe-Prywatne` przez API (`permissions.create`) przy nadawaniu roli admin. Przy degradacji do pracownika uprawnienia są odbierane.
- Blokada WebAuthn: passkey per urządzenie. Wymagana przy starcie i po 5 min w tle. Zapasowo kod PIN (hash w IndexedDB). Opisz w README, że to blokada dostępu do aplikacji, a nie szyfrowanie danych.
- Kopia: przy pierwszym otwarciu aplikacji w danym dniu (gdy minęło > 24 h) zapisz `backups/YYYY-MM-DD.json`, usuń starsze niż 30. Robi to tylko admin. Przywracanie z listy w Ustawieniach (podgląd liczby rekordów przed potwierdzeniem).
- **Akceptacja:** pracownik nie widzi cen zakupu ani minimalnej w aplikacji ani w Google Drive. Blokada Face ID działa na iPhone po instalacji na ekranie początkowym.

### Faza 5 — Waluty i pulpit
- Kurs EUR z API NBP: `https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json`. Cache w Dexie z datą. Offline → ostatni znany kurs z adnotacją daty. Sprawdź CORS; jeśli zablokowany, pozwól wpisać kurs ręcznie w Ustawieniach.
- Pulpit wg sekcji 5.
- **Akceptacja:** wartość zbioru zgadza się z ręcznym przeliczeniem na danych testowych.

### Faza 6 — Dokumenty PDF i udostępnianie *(wymaga logo i kolorów)*
- Osadź czcionkę z polskimi znakami. Sprawdź: ą ć ę ł ń ó ś ź ż.
- **Karta dzieła (A4):** logo, zdjęcie główne, tytuł, artysta, rok, technika, wymiary, edycja, opis, cena sprzedaży, nr inw. Wersja do udostępnienia: bez cen wewnętrznych.
- **Cennik (A4):** tabela z miniaturą, filtry jak w liście.
- **Etykieta ścienna:** artysta, tytuł, rok, technika, wymiary, cena (opcjonalnie). Format 10×7 cm, kilka na arkuszu A4.
- **Lista inwentaryzacyjna:** pogrupowana według lokalizacji, z polem do odhaczenia.
- Udostępnianie: `navigator.share({ files: [pdf] })` → WhatsApp / Mail. Fallback: pobranie pliku.
- **Akceptacja:** z karty dzieła na iPhone w 2 dotknięciach wysyłam PDF przez WhatsApp.

### Faza 7 — Import i eksport *(wymaga próbki CSV)*
- Import CSV/XLSX: kreator mapowania kolumn (auto-dopasowanie po nazwach + ręczna korekta), podgląd 10 wierszy, raport błędów (brak wymaganych pól → rekord importowany ze statusem „do uzupełnienia”, oznaczony na liście). Zdjęć nie importujemy — lista „bez zdjęcia” do uzupełnienia telefonem.
- Eksport CSV/XLSX wszystkich pól (bez cen prywatnych dla pracownika).
- Eksport do sklepu wg D4: CSV w formacie importu produktów wybranej platformy, tylko status `dostepne`.
- **Akceptacja:** próbka z `assets/import-sample.csv` importuje się bez ręcznej edycji pliku.

### Faza 8 — Dopracowanie
- Testy Playwright (viewport iPhone 15, iPad): kreator, offline, synchronizacja z zamockowanym Drive.
- Lighthouse PWA: wszystkie kryteria zaliczone. Dostępność: kontrast, rozmiary celów dotyku ≥ 44 px, focus.
- `README.md` po polsku: instalacja na iPhone, pierwsze uruchomienie, dodawanie użytkownika, przywracanie kopii, co robić gdy „nie synchronizuje”.

---

## 7. Struktura katalogów

```
src/
  app/            (routing, layout, providers)
  features/
    artworks/     (lista, karta, kreator, formularz)
    dashboard/
    documents/    (pdf/, csv/, shop-export/)
    inventory/
    settings/
    auth/         (google, webauthn, roles)
  sync/           (SyncEngine, driveClient, outbox, conflicts)
  db/             (dexie schema, migracje, repozytoria)
  lib/            (images, currency, invNo, format)
  styles/tokens.css
docs/GOOGLE_SETUP.md
DECISIONS.md
assets/brand/  assets/import-sample.csv
```

---

## 8. Zasady dla Claude Code

- Wszystkie teksty w UI po polsku. Formaty: `1 234,50 zł`, daty `22.10.2026`, wymiary `60 × 80 cm`.
- Nigdy `alert()`, `confirm()`, `prompt()`: potwierdzenia jako komponenty UI.
- Nie commituj Client ID ani tokenów. Tokenów Google nie zapisuj w localStorage (tylko pamięć + ciche odnowienie).
- Każda zmiana schematu Dexie = nowa wersja z migracją. Nigdy nie kasuj danych lokalnych, dopóki `outbox` nie jest pusty.
- Przed zakończeniem fazy: `npm run build`, `npm test`, deploy, sprawdzenie kryterium akceptacji. Wynik w podsumowaniu.
- Gdy decyzja z sekcji 1 blokuje pracę: zapytaj, nie zgaduj.
