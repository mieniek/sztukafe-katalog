# Konfiguracja Google (synchronizacja z Dyskiem)

Zrobisz to **raz**, zajmie około 15 minut. Efekt: aplikacja zapisuje katalog w folderze **SztuKaFe-Katalog** na Dysku Google galerii i synchronizuje go między telefonami i komputerami.

Potrzebujesz: konta Google galerii (to na jego Dysku będą dane) i dostępu do repozytorium na GitHubie.

> **O zrzutach ekranu.** Wygląd konsoli Google zmienia się co kilka miesięcy, więc instrukcja podaje **nazwy przycisków i menu**, a nie obrazki. Jeśli zrobimy konfigurację razem, mogę dołożyć aktualne zrzuty ekranu.

---

## Krok 1. Projekt w Google Cloud

1. Wejdź na <https://console.cloud.google.com> i zaloguj się kontem galerii.
2. U góry kliknij listę projektów → **Nowy projekt** (New project).
3. Nazwa: `SztuKaFe Katalog`. Kliknij **Utwórz** i poczekaj, aż projekt się pojawi. Upewnij się, że jest wybrany na górze strony.

## Krok 2. Włącz Google Drive API

1. Menu (☰) → **Interfejsy API i usługi** (APIs & Services) → **Biblioteka** (Library).
2. Wyszukaj **Google Drive API** → **Włącz** (Enable).

(Google Picker API nie jest potrzebny — patrz „Dlaczego pełny dostęp do Dysku” niżej.)

## Krok 3. Ekran zgody OAuth

1. **Interfejsy API i usługi** → **Ekran zgody OAuth** (w nowszej konsoli: **Google Auth Platform**).
2. Typ użytkowników: **Zewnętrzni** (External). Kliknij **Utwórz** / **Rozpocznij**.
3. Wpisz:
   - nazwa aplikacji: `SztuKaFe Katalog`,
   - e-mail pomocy technicznej: adres galerii,
   - e-mail kontaktowy programisty: ten sam adres.
4. **Zakresy** (Data access / Scopes) → **Dodaj lub usuń zakresy** → znajdź i zaznacz `.../auth/drive` („Wyświetlanie, edytowanie, tworzenie i usuwanie wszystkich plików na Dysku Google”). Zapisz.
5. **Użytkownicy testowi** (Audience → Test users) → **Dodaj użytkowników**: wpisz adresy Google wszystkich 2–3 osób, które będą używać aplikacji (łącznie z własnym). Zapisz.
6. Stan publikacji zostaw jako **Testowanie** (Testing). Dzięki temu Google nie wymaga weryfikacji aplikacji.

> **Uwaga: co 7 dni „Zaloguj ponownie”.** W trybie Testowanie Google wygasza zgodę po 7 dniach, więc raz w tygodniu aplikacja pokaże baner „Zaloguj ponownie” (jedno dotknięcie, dane nie giną). Jeśli to będzie uciążliwe, w **Ekranie zgody** możesz kliknąć **Opublikuj aplikację** (In production). Wtedy zgoda nie wygasa, ale przy pierwszym logowaniu każdy zobaczy ostrzeżenie „Google nie zweryfikowało tej aplikacji” (kliknij **Zaawansowane → Przejdź do…**). Limit to 100 użytkowników, czyli dla galerii aż nadto.

## Krok 4. Identyfikator klienta (Client ID)

1. **Interfejsy API i usługi** → **Dane logowania** (Credentials) → **Utwórz dane logowania** → **Identyfikator klienta OAuth**.
2. Typ aplikacji: **Aplikacja internetowa** (Web application). Nazwa: `SztuKaFe PWA`.
3. **Autoryzowane źródła JavaScript** (Authorized JavaScript origins) → **Dodaj URI**:
   - `https://TWOJA-NAZWA.github.io` — sam adres, **bez** nazwy repozytorium i **bez** ukośnika na końcu (np. `https://mieszko.github.io`),
   - `http://localhost:5173` — tylko jeśli ktoś będzie uruchamiał aplikację na komputerze programisty.
4. Sekcję „Autoryzowane identyfikatory URI przekierowania” zostaw **pustą**.
5. **Utwórz**. Skopiuj **Identyfikator klienta** (kończy się na `.apps.googleusercontent.com`). To nie jest tajne hasło, ale i tak trzymamy go jako sekret repozytorium.

## Krok 5. Wpisz Client ID w GitHubie

1. Repozytorium na GitHubie → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Nazwa: `VITE_GOOGLE_CLIENT_ID`, wartość: skopiowany identyfikator. **Add secret**.
3. Zakładka **Actions** → ostatni przebieg „Wdrożenie na GitHub Pages” → **Re-run all jobs** (albo wypchnij dowolną zmianę do `main`). Po 1–2 minutach aplikacja zna Client ID.

Do pracy lokalnej: skopiuj `.env.example` jako `.env.local` i wpisz identyfikator. Pliku `.env.local` **nie wysyłamy** na GitHub (jest wykluczony w `.gitignore`).

## Krok 6. Pierwsze uruchomienie

1. Otwórz aplikację na telefonie → **Ustawienia** → **Zaloguj przez Google**. Użyj konta, które ma być **właścicielem** katalogu.
2. Zgódź się na dostęp do Dysku. Przy pierwszym logowaniu aplikacja sama założy w „Mój dysk” folder **SztuKaFe-Katalog** z podfolderami `artworks`, `photos`, `config` oraz osobny folder **SztuKaFe-Prywatne** (ceny, kopie zapasowe, lista osób), którego pracownicy nie widzą.
3. W Ustawieniach powinno być widać konto i „Ostatnia synchronizacja”. Od teraz zmiany idą na Dysk same: przy starcie, po odzyskaniu internetu, po powrocie do aplikacji i co 2 minuty.

## Krok 7. Dodanie drugiej osoby

Pierwsza osoba, która zaloguje się w aplikacji, zostaje **adminem**. Kolejne osoby dodaje admin:

1. W aplikacji: **Ustawienia → Użytkownicy i role → Dodaj osobę**. Wpisz adres Google i wybierz rolę:
   - **Pracownik** — widzi katalog, ale nie widzi cen zakupu ani minimalnych. Aplikacja udostępnia mu tylko folder **SztuKaFe-Katalog**.
   - **Admin** — widzi wszystko. Aplikacja udostępnia mu także folder **SztuKaFe-Prywatne** z cenami.
   Google wyśle tej osobie zaproszenie e-mail do folderu.
2. **Google Cloud:** dodaj jej adres jako **użytkownika testowego** (Krok 3, punkt 5). Dotyczy trybu Testowanie.

Potem ta osoba loguje się w Ustawieniach aplikacji. Aplikacja sama znajdzie udostępniony folder i pobierze katalog.

Zmiana roli w aplikacji od razu zmienia uprawnienia na Dysku. Po zmianie admina na pracownika jego urządzenie przy najbliższej synchronizacji usuwa lokalnie ceny prywatne.

> **Ceny zakupu i minimalne** leżą w osobnym folderze **SztuKaFe-Prywatne** (poza folderem głównym), więc pracownik nie zobaczy ich ani w aplikacji, ani na Dysku Google. Nie udostępniaj tego folderu ręcznie.

---

## Dlaczego pełny dostęp do Dysku (`drive`), a nie `drive.file`

Plan zakładał najpierw spróbować węższego zakresu `drive.file` z oknem wyboru Google Picker. Ten zakres daje aplikacji dostęp tylko do plików, które **sama utworzyła** lub które użytkownik **wskazał ręcznie** w Pickerze (plik po pliku). Drugi użytkownik nie zobaczyłby więc plików założonych przez pierwszego, a ręczne wskazywanie setek plików z dziełami nie ma sensu. Dlatego aplikacja prosi o zakres `drive`.

To rozumowanie wynika z dokumentacji Google; **nie sprawdziłem go na prawdziwych kontach**. Jeśli chcesz to zweryfikować doświadczalnie:

1. W `.env.local` ustaw `VITE_GOOGLE_SCOPE=https://www.googleapis.com/auth/drive.file`, w konsoli Google dodaj ten zakres i uruchom aplikację.
2. Zaloguj się jako osoba A, dodaj dzieło. Zaloguj się jako osoba B (folder udostępniony).
3. Jeśli B widzi dzieło A, `drive.file` wystarcza i można go używać. Jeśli nie (spodziewany wynik), zostajemy przy `drive`.

Aplikacja widzi cały Dysk po uprawnieniach, ale sięga wyłącznie po folder **SztuKaFe-Katalog** i jego zawartość.

## Gdy coś nie działa

| Komunikat | Co zrobić |
|---|---|
| „Błąd 400: origin_mismatch” | Adres aplikacji nie jest na liście „Autoryzowane źródła JavaScript” (Krok 4). Sprawdź pisownię, brak ukośnika na końcu i `https://`. |
| „Dostęp zablokowany: aplikacja nie przeszła weryfikacji” / „access_denied” | Twój adres Google nie jest na liście użytkowników testowych (Krok 3, p. 5). |
| Okno logowania się nie otwiera | Przeglądarka zablokowała wyskakujące okno. Dotknij „Zaloguj” jeszcze raz albo zezwól stronie na wyskakujące okna. |
| „Synchronizacja nie jest jeszcze skonfigurowana” | Brak `VITE_GOOGLE_CLIENT_ID` w tej wersji aplikacji. Wykonaj Krok 5 i poczekaj na nowe wdrożenie. |
| Drugi użytkownik nie widzi katalogu | Folder nie jest mu udostępniony (Krok 7, p. 1) albo ma w „Udostępnione dla mnie” jeszcze nieprzyjęte zaproszenie. |
