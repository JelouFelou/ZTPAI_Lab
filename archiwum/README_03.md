# Room Booking API — zadanie 03

Node.js 22+, Express 5, Zod, Knex 3, pg 8, PostgreSQL 16 w Dockerze.

## Uruchomienie (PowerShell)

Uruchom Docker Desktop. Następnie w katalogu projektu:

```powershell
Copy-Item .env.example .env # tylko przy pierwszym uruchomieniu
npm.cmd install
docker compose up -d --wait
npm.cmd run migrate:latest
npm.cmd run seed:run
npm.cmd start
```

API: http://localhost:3000. Plik `test_03.http` zawiera scenariusze dla VS Code REST Client. `test_02.http` pozostawiono jako zapis poprzedniego zestawu; format listy i osadzonych zasobów zmienił się w zestawie 03. `DATABASE_URL` jest odczytywany z `.env`, a dane przechowuje nazwany volume. `seed:run` **kasuje dane demonstracyjne i odtwarza początkowy stan**; restart serwera nie wymaga seeda.

## Weryfikacja

```powershell
npm.cmd test
npm.cmd run double-booking
$env:DEBUG = 'knex:query'
npm.cmd start
```

Test integracyjny tworzy osobną bazę `room_booking_test_<timestamp>` i usuwa ją po zakończeniu. Konto testowe musi mieć prawo `CREATEDB` (lokalny użytkownik oficjalnego obrazu PostgreSQL je posiada). Weryfikuje migracje w obie strony, powtarzalny seed, endpointy, SQL bez N+1, filtry, paginację, zachowanie po odtworzeniu aplikacji oraz trzy warianty wyścigu. Opóźnienie 200 ms i wyłączenie zabezpieczeń występują wyłącznie w harnessie testowym. Produkcyjny service nie zawiera opóźnienia ani przełącznika wyłączającego ochronę.

`scripts/double-booking.js` wysyła 10 równoległych POST i liczy aktywne, nakładające się rezerwacje zapytaniem SQL. Domyślnie testuje salę 5, `2099-12-01 10:00–12:00 UTC`; wybierz wolny termin dla kolejnego uruchomienia:

```powershell
$env:ROOM_ID = '5'
$env:START_TIME = '2099-12-02T10:00:00Z'
$env:END_TIME = '2099-12-02T12:00:00Z'
npm.cmd run double-booking
```

Ponowne użycie zajętego terminu poprawnie daje dziesięć 409. Nie uruchamiaj seeda na bazie z danymi, które chcesz zachować.

Próby złamania constraints w psql (oczekiwane błędy są częścią demonstracji, transakcja jest wycofywana):

```powershell
Get-Content -Raw scripts/constraints.sql | docker compose exec -T db psql -U room_user -d room_booking
```

Podstawowe komendy migracji:

```powershell
npm.cmd run migrate:rollback
npm.cmd run migrate:latest
npm.cmd run seed:run
```

Rollback usuwa tabele wraz z danymi; służy do sprawdzenia migracji na bazie demonstracyjnej. Wybór implementacji odbywa się tylko w `src/server.js`: domyślnie Knex, opcjonalnie `$env:REPOSITORY = 'memory'`. Repositories pamięciowe pozostają do kolejnych zajęć; nie zastępują testów blokad PostgreSQL.

## Rozwiązanie

Relacje: `buildings` 1:N `rooms` 1:N `reservations`. Oba FK używają `ON DELETE RESTRICT`, aby usunięcie budynku lub sali nie usuwało historii rezerwacji. JOIN-y i LEFT JOIN z COUNT eliminują N+1. Lista rezerwacji ma dwa zapytania SQL: filtrowany COUNT oraz SELECT z JOIN, ORDER BY, LIMIT i OFFSET. `from` ogranicza `end_time > from`, `to` ogranicza `start_time < to`; granice można podawać osobno. Sortowanie ma whitelistę i tie-breaker `id ASC`.

Transakcja blokuje wiersz sali przez FOR UPDATE przed sprawdzeniem kolizji. Sama transakcja przy READ COMMITTED nie wystarcza: dwa równoległe odczyty mogą zobaczyć brak zatwierdzonej rezerwacji i oba wykonać INSERT. Dodatkowa migracja dodaje exclusion constraint GiST na `room_id` i półotwarty zakres `[start_time,end_time)`, tylko dla CONFIRMED. Kod 23P01 jest mapowany na 409 ROOM_ALREADY_BOOKED. Anulowane i stykające się rezerwacje są dozwolone.

Porównanie services: `reports/service-comparison.md`. Wymagane sprawozdanie: `ZTPAI_Adrian_Bober_3.pdf`. Surowe wyniki i zrzuty: `reports/generated/` oraz `screenshots/zad3/`.

Opcjonalne odtworzenie PDF w Windows wymaga lokalnego Chrome oraz narzędzia do zrzutów:

```powershell
npm.cmd install --prefix .tools --no-package-lock playwright-core
npm.cmd test
Get-Content -Raw scripts/constraints.sql | docker compose exec -T db sh -c 'psql -U room_user -d room_booking 2>&1' | Set-Content -Encoding UTF8 reports/generated/constraints-psql.log
node scripts/build-report.js --reuse-screenshots
```

Flaga `--reuse-screenshots` składa PDF z wcześniej zapisanych dowodów, bez operacji na bazie. Bez tej flagi generator uruchamia własny serwer na porcie 3103, tworzy rezerwację demonstracyjną sali 5 na 1 czerwca 2096, restartuje proces Node.js i porównuje JSON. Ten termin musi być wolny. Gotowy PDF nie wymaga instalowania narzędzi raportowych.
