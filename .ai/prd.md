# Dokument wymagań produktu (PRD) - FinFlow

## 1. Przegląd produktu

FinFlow to webowa aplikacja (desktop-first, responsywność podstawowa), która upraszcza kontrolę nad finansami osobistymi. Umożliwia ręczne dodawanie dochodów i wydatków w zamkniętych kategoriach, definiowanie celów oszczędnościowych oraz przegląd podsumowań i wizualizacji miesięcznych. MVP obejmuje rejestrację/logowanie, listę transakcji z filtrami, panel główny (dashboard) i moduł celów. Brak integracji z bankami oraz aplikacji mobilnych.

Kluczowi użytkownicy:

1. Nowicjusz budżetowania – chce szybko zobaczyć, gdzie znikają pieniądze.
2. Oszczędzający na konkretny cel – chce śledzić progres do celu (np. wakacje).
3. Freelancer z nieregularnymi dochodami – potrzebuje przejrzystego podsumowania miesięcy i wolnych środków.

Stack i operacje (dla kontekstu realizacyjnego): Astro/React/Tailwind, Supabase (Auth + DB z RLS), Recharts. Waluta PLN, kwoty w bazie w groszach (int), bankierskie zaokrąglanie. API REST v1: /auth, /transactions, /goals, /goal-events.

## 2. Problem użytkownika

1. Ręczne śledzenie finansów (notatnik/Excel) jest czasochłonne i mało przejrzyste.
2. Brak natychmiastowego wglądu w sumy, saldo i wolne środki w skali miesiąca.
3. Trudność w konsekwentnym odkładaniu na cele i śledzeniu realnego postępu.
4. Rozproszenie danych i brak bezpiecznego, spójnego miejsca z prostymi narzędziami przeglądania i filtracji.

FinFlow rozwiązuje te problemy, oferując prosty przepływ dodawania transakcji i wpłat do celów, klarowny dashboard (4 karty + 2 wizualizacje) i zamkniętą listę kategorii redukującą błędy klasyfikacji.

## 3. Wymagania funkcjonalne

3.1 Konta i bezpieczeństwo
a) Rejestracja i logowanie e-mail/hasło (Supabase Auth), weryfikacja e-mail.
b) Reset hasła, limity wysyłek: verify 3/30 min, reset 3/30 min
c) Hasła: min. 10 znaków, co najmniej 1 litera i 1 cyfra.
d) Usunięcie konta: hard delete w 24h (z zachowaniem audit_log przez 30 dni).

3.2 Dane i model
a) transactions: typ INCOME/EXPENSE; kategorie zamknięte:
• EXPENSE_CATEGORY: GROCERIES, TRANSPORT, HOUSING, BILLS, HEALTH, RESTAURANTS, ENTERTAINMENT, GIFTS, OTHER_EXPENSE
• INCOME_CATEGORY: INCOME_SALARY, INCOME_GIFT
b) goals: typy GOAL_TYPE: AUTO, VACATION, RETIREMENT, EMERGENCY, RENOVATION, HOME_DOWNPAYMENT, OTHER; jeden cel może być priorytetowy; archiwizacja przez archived_at (bez twardego usuwania).
c) goal_events: DEPOSIT/WITHDRAW, naliczanie miesięczne do wskaźnika „zmiana w tym miesiącu”.
d) audit_log: id, user_id, entity_type, entity_id, action, before, after, performed_at (TIMESTAMP WITH TIME ZONE UTC), retencja 30 dni.
e) Daty: w raportach DATE; w audit_log TIMESTAMP WITH TIME ZONE (UTC).
f) Kwoty: przechowywane w groszach (INTEGER); normalizacja wejścia (akceptuj , i .); bankierskie zaokrąglanie w agregacjach.

3.3 CRUD i listy
a) Transakcje: dodawanie/edycja/usuwanie (soft-delete), domyślny sort po dacie malejąco, filtry: typ/miesiąc/kategoria/tekst, paginacja keyset po (date, id), strona 50 rekordów.
b) Cele: tworzenie/edycja/archiwizacja; oznaczanie celu priorytetowego; obsługa goal_events (DEPOSIT/WITHDRAW).
c) Brak CRUD kategorii (lista zamknięta). Zablokowane twarde usuwanie kategorii z przypiętymi rekordami.

3.4 Dashboard i raportowanie
a) Karty 2×2: Dochód (miesiąc), Wydatki (miesiąc), Odłożone netto (miesiąc), Wolne środki.
b) Wolne środki = Dochody − Wydatki − Netto_odłożone (Wpłaty_do_celów − Wypłaty_z_celów) dla aktywnego miesiąca; wzór jako tooltip.
c) Wizualizacje: wykres wydatków wg kategorii (słupki poziome), progress bar celu priorytetowego (stan całkowity + „zmiana w tym miesiącu”).
d) Nawigacja czasu: wybór miesiąca/roku + poprzedni/następny; backdate: raporty i salda wyliczane w oparciu o daty wpisów; banner „korekty historyczne” gdy zmiana poza bieżącym miesiącem.
e) Puste stany: „Dodaj pierwszą transakcję” (bez kreatora).

3.5 UX i jakość
a) Optimistic updates z szybkim rollbackiem przy błędach.
b) Walidacje inline, toasty po polsku, centralny słownik i18n (pl.ts).
c) Zapamiętywanie filtrów w localStorage.
d) Wydajność: zapytania listy do 200 ms dla typowych zakresów.

3.6 E-maile systemowe i operacje
a) Postmark: nadawca „FinFlow [no-reply@twojadomena.pl](mailto:no-reply@twojadomena.pl)”, linki ważne 30 min; wymogi DKIM/SPF/DMARC.
b) Środowiska: dev, prod; backup bazy codziennie (retencja 7 dni); comiesięczny test odtworzenia (dev-restore + smoke test).
c) API REST v1: /auth, /transactions, /goals, /goal-events (tylko operacje potrzebne w MVP).

## 4. Granice produktu

4.1 Poza MVP
a) Integracje z bankami.
b) Subskrypcje/płatności.
c) Przypomnienia i automatyczne alerty.
d) Wielowalutowość.
e) Import/eksport plików (CSV itp.).
f) Aplikacje mobilne (tylko web w MVP).
g) Telemetria/analityka produktowa, rozbudowane testy e2e (odłożone).
h) Zaawansowane polityki CSP/CORS/CSRF i feature flagi – do doprecyzowania poza MVP.

4.2 Ograniczenia i założenia
a) Zamknięte słowniki kategorii (brak edycji/CRUD).
b) Jednoczesny priorytet tylko jednego celu.
c) Soft-delete dla rekordów biznesowych, brak twardych usunięć transakcji/celów.
d) Wszystko po polsku, desktop-first.
e) Twarde usuwanie konta w 24h (z retencją audit_log 30 dni).

## 5. Historyjki użytkowników

Format: ID, Tytuł, Opis, Kryteria akceptacji.

US-001 Rejestracja konta
Opis: Jako nowy użytkownik chcę utworzyć konto e-mail/hasło, aby korzystać z FinFlow.
Kryteria akceptacji:

- Po podaniu e-mail/hasła spełniającego politykę (≥10 znaków, ≥1 litera i ≥1 cyfra) otrzymuję e-mail weryfikacyjny.
- Przy próbie logowania przed weryfikacją widzę informację o konieczności weryfikacji i CTA ponownej wysyłki (limit 3/30 min).
- Link weryfikacyjny działa 30 min; po kliknięciu konto jest aktywne.
- Rejestracja odbywa się na dedykowanej stronie.

US-002 Logowanie
Opis: Jako użytkownik chcę się zalogować, aby uzyskać dostęp do swoich danych.
Kryteria akceptacji:

- Poprawne dane → dostęp
- Błędne dane → komunikat błędu → jasny komunikat.
- Logowanie odbywa się na dedykowanej stronie.

US-003 Wylogowanie
Opis: Jako użytkownik chcę się wylogować.
Kryteria akceptacji:

- Kliknięcie „Wyloguj” unieważnia sesję i przekierowuje do ekranu logowania.
- Użytkownik może się wylogować poprzez przycisk w prawym górnym rogu.

US-004 Reset hasła
Opis: Jako użytkownik chcę zresetować hasło poprzez e-mail.
Kryteria akceptacji:

- Formularz resetu wysyła link (ważny 30 min), limity 3/30 min.
- Ustawienie nowego hasła weryfikuje politykę haseł.

US-006 Ekran pusty – pierwsza transakcja
Opis: Jako nowy użytkownik po zalogowaniu chcę jasny CTA do dodania pierwszej transakcji.
Kryteria akceptacji:

- Widzę ekran „Dodaj pierwszą transakcję” dopóki nie ma żadnych transakcji.
- CTA otwiera formularz dodania.

US-007 Dodanie wydatku
Opis: Jako użytkownik chcę dodać wydatek z datą, kwotą, kategorią i notatką.
Kryteria akceptacji:

- Wymagane: data (DATE), kwota (>0), kategoria z listy EXPENSE_CATEGORY.
- Kwota przyjmuje , i .; zapisywana w groszach; walidacje inline.
- Po zapisie lista/dash odświeżają się z optimistic update i ewentualnym rollbackiem po błędzie.

US-008 Dodanie dochodu
Opis: Jako użytkownik chcę dodać dochód.
Kryteria akceptacji:

- Wymagane: data, kwota (>0), kategoria z listy INCOME_CATEGORY.
- Po zapisie dashboard aktualizuje kartę Dochód i Wolne środki.

US-009 Edycja transakcji
Opis: Jako użytkownik chcę edytować istniejącą transakcję.
Kryteria akceptacji:

- Mogę zmienić datę, kwotę, kategorię, notatkę.
- Zmiany natychmiast odzwierciedlone w raportach miesiąca odpowiadającego dacie wpisu (backdate działa).
- W przypadku zmiany poza bieżącym miesiącem pojawia się banner „korekty historyczne”.

US-010 Usunięcie transakcji (soft-delete)
Opis: Jako użytkownik chcę usunąć transakcję.
Kryteria akceptacji:

- Usunięta transakcja nie wpływa na agregaty; operacja odwracalna w bazie (soft-delete).
- Audit_log rejestruje operację.

US-011 Lista transakcji – filtr po typie
Opis: Jako użytkownik chcę filtrować po typie INCOME/EXPENSE/ALL.
Kryteria akceptacji:

- Zmiana filtra odświeża listę i sumy miesiąca.
- Filtr zapisywany w localStorage.

US-012 Lista transakcji – filtr po miesiącu
Opis: Jako użytkownik chcę wybrać miesiąc (picker i +/-).
Kryteria akceptacji:

- Zmiana miesiąca przełącza agregaty i listę transakcji.
- Picker obsługuje zakres lat i miesięcy.

US-013 Lista transakcji – filtr po kategorii
Opis: Jako użytkownik chcę przeglądać transakcje wyłącznie dla danej kategorii.
Kryteria akceptacji:

- Lista ogranicza się do wybranej kategorii; filtr pamiętany lokalnie.

US-014 Lista transakcji – filtr tekstowy
Opis: Jako użytkownik chcę wyszukiwać po fragmencie notatki.
Kryteria akceptacji:

- Wpisanie frazy ogranicza listę do pasujących rekordów; usunięcie frazy przywraca pełny widok.

US-015 Lista transakcji – paginacja keyset
Opis: Jako użytkownik chcę płynną paginację 50/s.
Kryteria akceptacji:

- Paginacja po (date, id) bez skoków i duplikatów; sort malejący po dacie.
- Czas odpowiedzi zapytań typowych ≤200 ms.

US-016 Dashboard – 4 karty
Opis: Jako użytkownik chcę widzieć sumy miesiąca: Dochód, Wydatki, Odłożone netto, Wolne środki.
Kryteria akceptacji:

- Każda karta pokazuje wartości z wybranego miesiąca.
- Tooltip przy „Wolnych środkach” pokazuje wzór.
- Zmiana miesiąca aktualizuje karty.

US-017 Dashboard – wykres wydatków wg kategorii
Opis: Jako użytkownik chcę wykres słupkowy poziomy wydatków per kategoria.
Kryteria akceptacji:

- Oś kategorii, wartości w PLN z dwoma miejscami po przecinku.
- Pusta dana → informacja o braku danych.

US-018 Dashboard – progress celu priorytetowego
Opis: Jako użytkownik chcę widzieć pasek postępu priorytetowego celu.
Kryteria akceptacji:

- Widoczny stan całkowity i wskaźnik „zmiana w tym miesiącu”.
- Brak priorytetu → placeholder/CTA ustawienia priorytetu.

US-019 Tworzenie celu
Opis: Jako użytkownik chcę utworzyć cel z nazwą, typem, kwotą docelową.
Kryteria akceptacji:

- Typ z GOAL_TYPE, kwota docelowa > 0, walidacje.
- Cel trafia na listę; opcjonalnie oznaczenie jako priorytetowy.

US-020 Oznaczenie celu priorytetowego
Opis: Jako użytkownik chcę wybrać jeden cel jako priorytetowy.
Kryteria akceptacji:

- Oznaczenie jednego celu anuluje priorytet na poprzednim.
- Dashboard wyświetla progress tylko dla nowego priorytetu.

US-021 Archiwizacja celu
Opis: Jako użytkownik chcę zarchiwizować cel, by nie widniał w aktywnych.
Kryteria akceptacji:

- archived_at ustawione; cel znika z list aktywnych, historyczne raporty pozostają niezmienione.
- Brak twardego usunięcia.

US-022 Wpłata do celu (DEPOSIT)
Opis: Jako użytkownik chcę dodać wpłatę do celu.
Kryteria akceptacji:

- DEPOSIT zwiększa stan celu i wpływa na Odłożone netto i Wolne środki w miesiącu daty wpłaty.
- Optimistic update + rollback przy błędzie.

US-023 Wypłata z celu (WITHDRAW)
Opis: Jako użytkownik chcę dodać wypłatę z celu.
Kryteria akceptacji:

- WITHDRAW zmniejsza stan celu; nie może zejść poniżej zera (walidacja).
- Wpływa na Odłożone netto i Wolne środki danego miesiąca.

US-024 Backdate i korekty historyczne
Opis: Jako użytkownik chcę korygować dane w przeszłości.
Kryteria akceptacji:

- Zmiana transakcji/zdarzenia w innym miesiącu przelicza tamte agregaty.
- Pokazuje się banner „korekty historyczne”.

US-025 Zamknięte kategorie
Opis: Jako użytkownik chcę wybierać kategorie z predefiniowanej listy.
Kryteria akceptacji:

- Brak możliwości dodania/edycji/usunięcia kategorii.
- Próba użycia nieobsługiwanej kategorii → błąd walidacji.

US-026 Waluta i format
Opis: Jako użytkownik chcę spójny format PLN.
Kryteria akceptacji:

- Prezentacja: przecinek dziesiętny, kropka tysięcy.
- Wejście: akceptuj , i .; w bazie grosze (int).

US-027 Audit log
Opis: Jako użytkownik chcę mieć ślad zmian moich danych.
Kryteria akceptacji:

- Każda operacja CREATE/UPDATE/DELETE tworzy wpis audit_log z before/after i performed_at (UTC).
- Widoczność tylko dla właściciela; retencja 30 dni.

US-028 Stabilność i błędy
Opis: Jako użytkownik chcę jasnych komunikatów błędów i brak utraty danych.
Kryteria akceptacji:

- Błędy sieciowe → toast + rollback optimistic update.
- Nieprawidłowe dane → walidacja inline z komunikatem po polsku.

US-029 Zapamiętywanie filtrów
Opis: Jako użytkownik chcę, by aplikacja pamiętała moje filtry.
Kryteria akceptacji:

- Po odświeżeniu przeglądarki filtry typ/miesiąc/kategoria/tekst są odtworzone z localStorage.

US-030 Ustawienia konta – usunięcie
Opis: Jako użytkownik chcę usunąć konto.
Kryteria akceptacji:

- Potwierdzenie operacji, informacja o 24h i retencji audit_log 30 dni.
- Po usunięciu logowanie nie jest możliwe.

US-031 Dostępność i responsywność podstawowa
Opis: Jako użytkownik desktop chcę czytelnego UI oraz działającej responsywności podstawowej.
Kryteria akceptacji:

- Layout działa w typowych szerokościach desktop i poprawnie skaluje się do tabletów.
- Komponenty interaktywne dostępne z klawiatury.

US-032 Wydajność listy
Opis: Jako użytkownik chcę płynnego przewijania i szybkich odpowiedzi.
Kryteria akceptacji:

- Zapytania listy dla typowych zakresów ≤200 ms; paginacja nie duplikuje rekordów.

US-033 Email weryfikacyjny – ponowne wysłanie
Opis: Jako użytkownik nieweryfikowany chcę ponowić wysyłkę maila weryfikacyjnego.
Kryteria akceptacji:

- Limit 3/30 min; komunikat o limicie i czasie do odblokowania.
- Po wysłaniu wyświetla się potwierdzenie i czas ważności linku (30 min).

US-034 Reset hasła – limit wysyłek
Opis: Jako użytkownik chcę wiedzieć o limicie resetu hasła.
Kryteria akceptacji:

- Limit 3/30 min egzekwowany; jasny komunikat o przekroczeniu.

US-035 Priorytet celu – konflikt
Opis: Jako użytkownik przy zmianie priorytetu chcę uniknąć dwóch priorytetów naraz.
Kryteria akceptacji:

- Oznaczenie nowego priorytetu automatycznie usuwa priorytet ze starego; transakcja atomowa.

US-036 Weryfikacja danych wejściowych (server+client)
Opis: Jako użytkownik chcę, by aplikacja blokowała nieprawidłowe dane na froncie i na serwerze.
Kryteria akceptacji:

- Niezgodne formaty kwot/dat odrzucane z odpowiednim komunikatem.
- Serwer stosuje te same reguły walidacji (źródło prawdy).

US-037 Zakres danych na wykresie
Opis: Jako użytkownik chcę, aby wykres wydatków odzwierciedlał aktualny miesiąc i filtry.
Kryteria akceptacji:

- Zmiana filtra kategorii/typu wpływa na dane wykresu.
- Brak danych → neutralny stan z komunikatem.

US-038 Ograniczenie operacji na kategoriach
Opis: Jako użytkownik nie mogę usuwać ani modyfikować kategorii systemowych.
Kryteria akceptacji:

- Akcje CRUD kategorii nie są dostępne w UI ani w API (będzie zwracać błąd).

US-039 Edycja goal_event
Opis: Jako użytkownik chcę skorygować datę/kwotę wpłaty/wypłaty.
Kryteria akceptacji:

- Zmiany przeliczają „zmianę w tym miesiącu” i progress celu.
- Zmiana poza bieżącym miesiącem → banner „korekty historyczne”.

US-040 Widoczność celów zarchiwizowanych
Opis: Jako użytkownik chcę filtrować cele aktywne/archiwalne.
Kryteria akceptacji:

- Domyślnie pokazuj aktywne; przełącznik pokazuje archiwalne bez wpływu na dashboard.

US-041 Blokada błędnych wypłat
Opis: Jako użytkownik nie mogę wypłacić więcej niż stan celu.
Kryteria akceptacji:

- Walidacja serwerowa i kliencka blokuje WITHDRAW > saldo.

US-042 Polskie komunikaty i i18n
Opis: Jako użytkownik chcę spójnych polskich komunikatów.
Kryteria akceptacji:

- Wszystkie toasty/etykiety z centralnego słownika pl.ts; brak mieszania języków.

US-043 Wymuszone HTTPS w produkcji
Opis: Jako użytkownik chcę bezpiecznego połączenia.
Kryteria akceptacji:

- Próba HTTP przekierowuje na HTTPS.
- Nagłówki cookies ustawione zgodnie z wymaganiami.

US-044 Stabilne API minimalne
Opis: Jako klient FE chcę przewidywalnego API REST v1.
Kryteria akceptacji:

- Endpointy: /auth, /transactions, /goals, /goal-events; tylko potrzebne metody.
- Błędy 4xx/5xx mają spójny format.

US-045 Backup i odtworzenie
Opis: Jako właściciel produktu chcę mieć kopie bezpieczeństwa i potwierdzony restore.
Kryteria akceptacji:

- Backup codziennie, retencja 7 dni; comiesięczny test odtworzenia zakończony smoke testem.

US-046 Baner limitów operacji e-mail
Opis: Jako użytkownik chcę wiedzieć dlaczego nie mogę wysłać kolejnego maila.
Kryteria akceptacji:

- Po przekroczeniu limitów verify/reset system pokazuje czas do odblokowania.

US-047 Odporność na dublowanie żądań
Opis: Jako użytkownik nie chcę podwójnych zapisów przy kliknięciu „Zapisz” wielokrotnie.
Kryteria akceptacji:

- Front blokuje wielokrotne wysłanie, serwer idempotentny w kluczowych miejscach.

US-048 Dostęp z klawiatury i focus management
Opis: Jako użytkownik chcę obsłużyć formularze klawiaturą.
Kryteria akceptacji:

- Focus po otwarciu modala na pierwszym polu, kolejność TAB logiczna, ESC zamyka bez utraty zapisanych danych.

US-049 Komunikat o braku integracji bankowej
Opis: Jako użytkownik chcę jasność, że import bankowy nie jest dostępny.
Kryteria akceptacji:

- FAQ/tooltip na ekranie pustym i/lub w ustawieniach informuje, że integracje będą rozważone w przyszłości.

US-050 Ochrona przed XSS w notatkach
Opis: Jako użytkownik chcę bezpiecznej prezentacji wprowadzonych notatek.
Kryteria akceptacji:

- Notatki są czyszczone/escapowane, wyświetlane bez możliwości wstrzyknięcia HTML/JS.

US-051 Kompatybilność dat
Opis: Jako użytkownik chcę wybierać daty bez błędów strefowych.
Kryteria akceptacji:

- Raporty oparte na DATE (miesiąc kalendarzowy), brak rozjazdów DST.

US-052 Spójność wartości na kartach i listach
Opis: Jako użytkownik chcę, aby sumy na dashboardzie zgadzały się z listą.
Kryteria akceptacji:

- Dla wybranego miesiąca suma listy równa się wartości na kartach z tolerancją 0 groszy.

US-053 Komunikaty o błędach kategorii
Opis: Jako użytkownik, który wybierze nieobsługiwaną kategorię, chcę jasny komunikat.
Kryteria akceptacji:

- Backend zwraca błąd walidacji z listą dozwolonych kategorii, UI prezentuje go w języku polskim.

US-054 Informacja o przetwarzaniu danych
Opis: Jako użytkownik chcę podstawowej informacji prawnej.
Kryteria akceptacji:

- Link do minimalnej Polityki prywatności i Regulaminu w stopce; placeholder do pełnych treści w przyszłości.

US-055 Zgodność z priorytetem celu na dashboardzie
Opis: Jako użytkownik chcę, by progress bar zawsze dotyczył aktualnego priorytetu.
Kryteria akceptacji:

- Zmiana priorytetu natychmiast zmienia progress na dashboardzie bez odświeżania strony.

US-056 Zabezpieczenie przed utratą formularza
Opis: Jako użytkownik nie chcę utracić wprowadzonych danych przy błędzie sieci.
Kryteria akceptacji:

- Wartości pól pozostają po błędzie; jasny toast z możliwością ponowienia.

US-057 Wersjonowanie danych kategorii (FE/BE)
Opis: Jako właściciel produktu chcę spójnych enumów.
Kryteria akceptacji:

- Stałe ID i etykiety PL zsynchronizowane w migracjach i FE; niezmienne ID w komunikacji.

US-058 Ograniczenie wypłat bez celu
Opis: Jako użytkownik nie mogę dodać WITHDRAW bez istniejącego celu.
Kryteria akceptacji:

- UI i API blokują żądanie; komunikat z instrukcją utworzenia celu.

US-059 Minimalny stan UI po archiwizacji
Opis: Jako użytkownik po archiwizacji chcę spójnego UI.
Kryteria akceptacji:

- Cel znika z list aktywnych i z wyboru priorytetu; progress dashboardu aktualizuje się.

US-060 Konsystencja po błędzie optimistic update
Opis: Jako użytkownik chcę, aby UI wracał do poprzedniego stanu po nieudanym zapisie.
Kryteria akceptacji:

- Rollback przy niepowodzeniu zapisu przywraca pierwotne wartości i filtry.

US-061 Informacja o braku danych miesiąca
Opis: Jako użytkownik chcę wiedzieć, że w miesiącu brak transakcji.
Kryteria akceptacji:

- Dashboard i lista pokazują neutralny komunikat „Brak danych w tym miesiącu”.

US-062 Ochrona przed usunięciem kategorii systemowych
Opis: Jako właściciel produktu chcę, by nie dało się usunąć kategorii z przypiętymi rekordami.
Kryteria akceptacji:

- Operacje usuwania kategorii są całkowicie wyłączone w MVP (zarówno w UI, jak i w API).

US-063 Spójne wartości „Odłożone netto”
Opis: Jako użytkownik chcę, aby odłożone netto w miesiącu było równe sumie DEPOSIT−WITHDRAW w tym miesiącu.
Kryteria akceptacji:

- Agregaty miesięczne wyliczane wyłącznie z goal_events o dacie w danym miesiącu.

US-064 Wskaźnik zmiany celu w miesiącu
Opis: Jako użytkownik chcę widzieć, o ile wzrosły środki celu w bieżącym miesiącu.
Kryteria akceptacji:

- Obliczenie ze zdarzeń w granicach miesiąca; przy braku zdarzeń wskaźnik = 0.

US-065 Przejrzystość wzoru „Wolne środki”
Opis: Jako użytkownik chcę rozumieć, skąd się bierze liczba.
Kryteria akceptacji:

- Tooltip z pełnym wzorem i przykładami formatowania kwot.

US-066 Zgodność z zabezpieczeniami e-mail (Postmark)
Opis: Jako właściciel produktu chcę prawidłową dostarczalność maili.
Kryteria akceptacji:

- Konfiguracja DKIM/SPF/DMARC zweryfikowana; e-maile dochodzą do głównych skrzynek.

US-067 Ograniczenie liczby rekordów (koperta na przyszłość)
Opis: Jako użytkownik z bardzo dużą liczbą wpisów chcę przyjazny komunikat.
Kryteria akceptacji:

- Po przekroczeniu progu (np. >100k) wyświetla się informacja o ograniczeniach i sugestia filtracji.
- Zachowanie UI do doprecyzowania, ale miejsce na komunikat jest przewidziane.

US-068 Dostępność wykresów
Opis: Jako użytkownik z czytnikiem ekranu chcę opisu wykresu.
Kryteria akceptacji:

- Wykres ma tekst alternatywny z podsumowaniem wartości.

US-069 Konsystencja czasu w audit_log
Opis: Jako właściciel produktu chcę jednoznacznego czasu zdarzeń.
Kryteria akceptacji:

- Każdy wpis ma performed_at w UTC; UI pokazuje czas lokalny użytkownika w tooltipie.

US-070 Stabilność na słabym łączu
Opis: Jako użytkownik słabego łącza chcę mieć możliwość ponowienia wysyłki.
Kryteria akceptacji:

- Przy błędzie 5xx/timeout pojawia się przycisk „Spróbuj ponownie”.

US-071 Dostęp tylko po weryfikacji
Opis: Jako właściciel produktu chcę ograniczyć dostęp do aplikacji po weryfikacji e-mail.
Kryteria akceptacji:

- Użytkownik nieweryfikowany nie otworzy aplikacji; widzi ekran z CTA ponownej wysyłki.

US-072 Informacja o braku mobilnej aplikacji
Opis: Jako użytkownik mobilny chcę zrozumieć ograniczenia.
Kryteria akceptacji:

- W stopce/FAQ informacja, że wersja mobilna nie jest częścią MVP.

US-073 Jednostajne sumy między widokami
Opis: Jako użytkownik chcę, by suma na liście = suma na wykresie = karta Wydatki.
Kryteria akceptacji:

- Dla identycznych filtrów wszystkie trzy widoki wykazują te same wartości.

US-074 Zgodność kategorii FE/BE
Opis: Jako deweloper FE chcę, by ID kategorii były stałe.
Kryteria akceptacji:

- FE i BE korzystają z tych samych enumów; brak nieznanych wartości po stronie FE.

US-076 Informacja o archiwizacji a dashboard
Opis: Jako użytkownik chcę zrozumieć, że archiwizacja celu nie usuwa historii.
Kryteria akceptacji:

- Po archiwizacji dashboard i raporty historyczne pozostają niezmienione; UI ma tooltip/komunikat.

US-077 Idempotencja goal_events
Opis: Jako użytkownik nie chcę zdublowanych wpłat po odświeżeniu.
Kryteria akceptacji:

- Serwer odrzuca powtórne żądanie o identycznym payloadzie i krótkim oknie czasowym; UI pokazuje informację.

US-078 Wgląd w przyczynę błędu
Opis: Jako użytkownik chcę zrozumiałe komunikaty błędów.
Kryteria akceptacji:

- Komunikaty zawierają prosty opis i sugestię naprawy (np. „Podaj kwotę większą od 0”).

US-079 Dostępność modali
Opis: Jako użytkownik chcę zamknąć modal ESC i kliknięciem w tło (jeśli bezpieczne).
Kryteria akceptacji:

- Zamknięcie nie traci zapisanych danych; ostrzeżenie gdy formularz ma niezatwierdzone zmiany.

US-080 Wersja językowa liczb
Opis: Jako użytkownik chcę spójnego formatowania liczb.
Kryteria akceptacji:

- Wszystkie liczby pieniężne w UI sformatowane według PL; brak mieszania separatorów.

US-081 Widok mojego profilu (/profile)
Opis: Jako użytkownik chcę podejrzeć podstawowe informacje o koncie.
Kryteria akceptacji:

- Strona /profile prezentuje e-mail, status weryfikacji, datę założenia i datę ostatniego logowania; dane pobierane bezpośrednio z Supabase Auth.

US-082 Blokada „dzikich” pól
Opis: Jako użytkownik nie chcę, by serwer przyjmował pola spoza kontraktu.
Kryteria akceptacji:

- API odrzuca nieznane pola (422) z czytelnym komunikatem.

US-083 Zgodność sum miesięcznych przy zmianie miesiąca
Opis: Jako użytkownik chcę, by przełącznik miesiąca natychmiast aktualizował wszystkie elementy.
Kryteria akceptacji:

- Wszystkie karty i wykresy przełączają się synchronicznie bez migotania; brak „starych” wartości.

US-084 Ochrona przed XSRF w linkach e-mail
Opis: Jako użytkownik chcę bezpiecznych linków akcji.
Kryteria akceptacji:

- Linki weryfikacji/resetu zawierają jednorazowe tokeny ważne 30 min; po użyciu wygasają.

US-085 Wymuszona spójność typów danych
Opis: Jako deweloper chcę stałych typów w API.
Kryteria akceptacji:

- Kwoty zawsze w groszach (int) w payloadzie; daty w formacie YYYY-MM-DD (DATE).

US-086 Komunikat o braku priorytetu
Opis: Jako użytkownik bez priorytetu chcę prostego CTA.
Kryteria akceptacji:

- Dashboard pokazuje placeholder z przyciskiem „Ustaw cel priorytetowy”.

US-087 Widok celu – szczegóły i historia
Opis: Jako użytkownik chcę zobaczyć historię wpłat/wypłat dla celu.
Kryteria akceptacji:

- Lista goal_events z filtrami po miesiącu i typie; sumy miesiąca i całkowita.

US-088 Ograniczenie dostępu do audit_log
Opis: Jako użytkownik chcę mieć wgląd tylko w swoje wpisy logów.
Kryteria akceptacji:

- Próba odczytu nie-swoich logów kończy się błędem autoryzacji.

US-089 Wskaźnik „Odłożone netto” = suma goal_events
Opis: Jako użytkownik chcę spójności wartości na karcie.
Kryteria akceptacji:

- Karta „Odłożone netto (miesiąc)” = Σ(DEPOSIT−WITHDRAW) w miesiącu.

US-090 Wartości „Wydatki” i „Dochód” = suma transakcji
Opis: Jako użytkownik chcę spójnych agregatów.
Kryteria akceptacji:

- Karty „Dochód” i „Wydatki” równe sumom transakcji w miesiącu z filtrów.

US-091 Dostępność komunikatów
Opis: Jako użytkownik z czytnikiem ekranu słyszę treść toastów.
Kryteria akceptacji:

- Toasty mają role/aria-live i są odczytywane.

US-092 Blokada edycji kategorii transakcji na niezgodny typ
Opis: Jako użytkownik nie mogę zmienić kategorii wydatku na kategorię dochodu (i odwrotnie).
Kryteria akceptacji:

- UI filtruje kategorie po typie; backend weryfikuje spójność.

US-093 Informacja o statusie weryfikacji
Opis: Jako użytkownik chcę widzieć status weryfikacji e-mail.
Kryteria akceptacji:

- Panel /me wyświetla status i przycisk „Wyślij ponownie” (z limitem).

US-094 Stabilne ID encji
Opis: Jako deweloper chcę polegać na stałych ID.
Kryteria akceptacji:

- ID encji są UUID; paginacja keyset po (date, id) działa deterministycznie.

US-095 Minimalne wskaźniki operacyjne
Opis: Jako właściciel produktu chcę wiedzieć, że backupy i restore działają.
Kryteria akceptacji:

- Rejestr (np. w panelu admin) potwierdza codzienny backup i miesięczny smoke-restore.

US-096 Komunikat o wyłączonych funkcjach
Opis: Jako użytkownik chcę wiedzieć, że niektóre funkcje są poza MVP.
Kryteria akceptacji:

- Sekcja „Co dalej”/FAQ listuje: integracje banków, import, mobilka, subskrypcje, przypomnienia.

US-097 Nadmiarowe kliknięcia na CTA
Opis: Jako użytkownik nie chcę wielokrotnego uruchamiania akcji.
Kryteria akceptacji:

- CTA ma stan „Loading/Disabled” do zakończenia operacji.

US-098 Zgodność wykresu z filtrami typu
Opis: Jako użytkownik chcę, by wykres wydatków nigdy nie obejmował dochodów.
Kryteria akceptacji:

- Wykres zawsze bazuje na EXPENSE; zmiana typu listy na INCOME nie wpływa na wykres.

US-099 Wersjonowanie słowników w FE
Opis: Jako deweloper chcę mieć eksport enumów do FE.
Kryteria akceptacji:

- FE importuje słowniki z jednego źródła (build-time lub endpoint), etykiety PL zgodne z BE.

US-100 Ekran błędu globalnego
Opis: Jako użytkownik przy błędach krytycznych chcę jasnego ekranu z opcją powrotu.
Kryteria akceptacji:

- 500/awaria → ekran z informacją i linkiem do odświeżenia/strony głównej.

Uwagi: Wszystkie historyjki są testowalne przez UI lub API; zawierają wymierne kryteria.

## 6. Metryki sukcesu

6.1 Produktowe (MVP – minimalne, jakościowo-techniczne)
a) Poprawność obliczeń: dla wybranego miesiąca sumy na kartach = sumy na liście i wykresie (US-052, US-073).
b) Stabilność ścieżek krytycznych: ≥99% powodzeń rejestracji, logowania, dodania/edycji/usunięcia transakcji, utworzenia celu, DEPOSIT/WITHDRAW w tygodniowym oknie testowym.
c) Wydajność listy: p50 czasów zapytań ≤200 ms dla typowych zakresów; paginacja bez duplikatów (US-015, US-032).
d) Bezpieczeństwo: 100% wymuszeń polityk haseł, RLS aktywne dla wszystkich tabel, HTTPS wymuszony (US-002, US-005, US-043).
e) Dostarczalność e-mail: ≥95% skuteczności wysyłek verify/reset, brak błędów konfiguracyjnych DKIM/SPF/DMARC (US-066).

6.2 Użyteczność i UX
a) Pierwsza wartość: ≥70% nowych użytkowników dodaje min. 1 transakcję w pierwszej sesji (obserwacja jakościowa).
b) Błędy walidacji: <5% niepowodzeń zapisów z powodu formatu kwoty/daty po wdrożeniu normalizacji.
c) Satysfakcja z przejrzystości: badanie ankietowe NPS jakościowe w fazie beta (opcjonalnie).

6.3 Operacyjne
a) Backup: 100% dni z potwierdzonym backupem; 1×/mies. udany smoke-restore (US-045, US-095).
b) Stabilność e-mail limitów: brak eskalacji ws. floodingu verify/reset (US-033, US-034, US-046).
