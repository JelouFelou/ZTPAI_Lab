# Room Booking API — zadanie 04

Node.js 22+, Express 5, Zod, Knex 3, pg 8, PostgreSQL 16 w Dockerze, bcryptjs, jsonwebtoken i Swagger UI.

## Uruchomienie istniejącego projektu (bez usuwania rezerwacji)

Uruchom Docker Desktop, a następnie w katalogu projektu:

```powershell
npm.cmd install
docker compose up -d --wait
npm.cmd run migrate:latest
npm.cmd run seed:admin
npm.cmd start
```

Lokalny `.env` został przygotowany. `seed:admin` uruchamia wyłącznie `002_admin.js`: tworzy brakującego ADMIN-a i nie usuwa danych. Istniejącemu USER-owi nie podnosi roli; przy kolizji emaila należy wybrać inny `SEED_ADMIN_EMAIL`.

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/api/docs/
- Specyfikacja: http://localhost:3000/api/docs/openapi.json
- Scenariusze REST Client: `test_04.http`
- Sprawozdanie: `ZTPAI_Adrian_Bober_4.pdf`

Domyślne konto ADMIN-a dla lokalnej demonstracji: `admin@example.com` / `Admin-demo-2026!`. Odpowiada zmiennym `SEED_ADMIN_EMAIL` i `SEED_ADMIN_PASSWORD` z `.env.example`; nie używaj tych danych poza lokalnym ćwiczeniem. Zarejestruj zwykłych użytkowników przez API (pierwsze requesty w `test_04.http`).

W Swagger UI wywołaj `POST /api/auth/login`, skopiuj `accessToken`, kliknij **Authorize** i wklej sam token. Następnie **Try it out → Execute** dla chronionego endpointu.

## Pierwsze uruchomienie w nowym katalogu

Przed migracjami utwórz `.env` z przykładu i zastąp przykładowy JWT_SECRET losową wartością. Poniższe polecenie zapisuje sekret bez wypisywania go na ekran:

```powershell
Copy-Item .env.example .env
node -e "const fs=require('fs'),c=require('crypto');let s=fs.readFileSync('.env','utf8');s=s.replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+c.randomBytes(48).toString('hex'));fs.writeFileSync('.env',s)"
npm.cmd install
docker compose up -d --wait
npm.cmd run migrate:latest
npm.cmd run seed:admin
npm.cmd start
```

Wszystkie zmienne środowiskowe odczytuje i waliduje wyłącznie `src/config/index.js`, także na potrzeby `knexfile.js` i skryptów. JWT_SECRET musi mieć co najmniej 32 znaki. Niepoprawny DATABASE_URL lub JWT_EXPIRES_IN zatrzymuje aplikację przed uruchomieniem HTTP. Domyślny czas JWT to `15m`; do ręcznego testu wygaśnięcia można ustawić w `.env` `JWT_EXPIRES_IN=10s`, zrestartować serwer, zalogować się i odczekać ponad 10 sekund.

## Model i uprawnienia

Migracja `003_users.js` tworzy users. `004_reservations_user.js` dodaje FK user_id, przypisuje stare rezerwacje do archiwalnego konta USER z losowym, odrzuconym hasłem, a następnie usuwa reserved_by. Stare tekstowe nazwy nie są zweryfikowanymi tożsamościami kont. ADMIN ma dostęp do tych rezerwacji. ID, sale, terminy i statusy pozostają zachowane. Rollback odtwarza etykietę reserved_by z emaila przypisanego konta.

USER przegląda budynki i sale, tworzy rezerwacje i widzi/anuluje wyłącznie własne. ADMIN zarządza budynkami i salami oraz widzi/anuluje wszystkie rezerwacje. Cudza rezerwacja zwraca USER-owi 404. Ownership jest sprawdzany w service; userId podczas tworzenia pochodzi wyłącznie z tokenu. Pole userId lub reservedBy w body daje 400. Filtr query userId jest tylko dla ADMIN-a, dla USER-a daje 403 (jawne zgłoszenie użycia parametru administracyjnego). Paginacja, filtry, sortowanie i zabezpieczenia przed double booking pozostały aktywne. Reguły biznesowe obowiązują także ADMIN-a.

Weryfikacja JWT dopuszcza wyłącznie HS256. Payload zawiera sub, role, iat i exp. Błędny email i hasło zwracają ten sam kod i komunikat 401. Wygaśnięcie ma osobny kod TOKEN_EXPIRED. Hash bcrypt nigdy nie trafia do odpowiedzi HTTP. Oprócz długości 10–72 znaków rejestracja wymaga maksymalnie 72 bajtów UTF-8, żeby bcrypt nie obcinał haseł wielobajtowych.

## Testy i dowody

```powershell
npm.cmd test
```

Testy używają oddzielnych, tworzonych na czas testu baz `room_booking_test_*` i `room_booking_auth_test_*`. Weryfikują m.in. migrację na istniejących danych, rollback, równoległe rejestracje, wszystkie przypadki 401, rzeczywiste wygaśnięcie tokenu po 10 sekundach, pełną macierz ról, prywatność listy, ownership bezpośrednio w service, reguły ADMIN-a, konfigurację i OpenAPI. Testy zestawu 03 zostały dostosowane do uwierzytelnionego API. Nie kasują danych bieżącej bazy API. Lokalne konto PostgreSQL musi mieć prawo CREATEDB; konto oficjalnego obrazu Docker je posiada.

Wyniki: `test_04.results.http` (log, nie plik do ponownego wysyłania), `reports/generated/zad4/evidence.json` oraz `screenshots/zad4/`. `test_04.http` zawiera requesty do ręcznego wysyłania. Scenariusze z `test_02.http` i `test_03.http` dokumentują poprzednie wersje kontraktu API.

Skrypt double booking wymaga teraz tokenu:

```powershell
$env:ACCESS_TOKEN = '<accessToken z logowania>'
$env:START_TIME = '2099-12-10T10:00:00Z'
$env:END_TIME = '2099-12-10T11:00:00Z'
npm.cmd run double-booking
```

Domyślna sala to 5; można ustawić ROOM_ID i BASE_URL. Termin musi być wolny. Powtórzenie zajętego terminu poprawnie daje dziesięć 409. Skrypt liczy CONFIRMED zapytaniem SQL po zakończeniu requestów.

`npm.cmd run seed:run` jest przeznaczony **wyłącznie do resetu bazy demonstracyjnej**: usuwa users, buildings, rooms i reservations, po czym tworzy 3 konta (ADMIN, user@example.com / User-demo-2026!, other@example.com / Other-demo-2026!), 2 budynki, 5 sal i 5 rezerwacji. Nie uruchamiaj go na bazie z danymi, które chcesz zachować. Do samego utworzenia ADMIN-a używaj `seed:admin`.

Wybór implementacji pozostaje w `src/server.js`. Opcjonalne `$env:REPOSITORY='memory'` uruchamia dane nietrwałe z kontem ADMIN-a i user@example.com; PostgreSQL jest wymagany do weryfikacji migracji i współbieżności.

## Odtworzenie PDF

Generator wymaga Chrome w standardowej lokalizacji Windows i opcjonalnego narzędzia:

```powershell
npm.cmd install --prefix .tools --no-package-lock playwright-core
npm.cmd test
npm.cmd run report:04
```

Tworzy osobną bazę `room_booking_report04_*`, sprawdza w prawdziwej przeglądarce Authorize i GET /api/auth/me, zapisuje zrzuty oraz PDF, po czym usuwa własną bazę tymczasową. Bieżąca baza API pozostaje zachowana. `scripts/build-report.js` jest historycznym generatorem zestawu 03; jego dawne scenariusze nie pasują do nowego kontraktu. Gotowy PDF zestawu 03 zachowano.

## Historia Git

Ten katalog nie jest repozytorium Git. Próba `git log -p --all` zwróciła błąd braku repozytorium; ograniczenie opisano w PDF. Nie można potwierdzić historii ewentualnego zdalnego repozytorium bez jej udostępnienia. Przed oddaniem linku do GitHub sprawdź właściwe repozytorium:

```powershell
git log -p --all | Select-String -Pattern 'JWT_SECRET=|password='
```

Jeśli znajdziesz prawdziwy sekret, wygeneruj nowy i opisz rotację. Przykładowe, jawne wartości w `.env.example` służą wyłącznie lokalnej demonstracji. `.env` jest ignorowany przez Git.
