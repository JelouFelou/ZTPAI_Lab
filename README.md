# Room Booking API — zadanie 05

![CI](https://github.com/JelouFelou/ZTPAI_Lab/actions/workflows/ci.yml/badge.svg)

Node.js 22, Express 5, PostgreSQL 16, Knex, JWT, Jest 30, Supertest 7.

## Uruchomienie od zera

Wymagane: Git i uruchomiony Docker Desktop z kontenerami Linux. Porty 3000 i 5432 muszą być wolne.

```sh
git clone https://github.com/JelouFelou/ZTPAI_Lab.git
cd ZTPAI_Lab
cp .env.example .env
docker compose up --build
```

PowerShell: zamiast `cp` można użyć `Copy-Item .env.example .env`.
Migracje wykonują się automatycznie. API: http://localhost:3000, Swagger: http://localhost:3000/api/docs/.
Wartości w `.env.example` służą lokalnej demonstracji; przed udostępnieniem instalacji ustaw własne hasła i losowy JWT_SECRET. `.env` nie trafia do Git ani obrazu.

W drugim terminalu utwórz konto ADMIN bez usuwania istniejących danych:

```sh
docker compose exec api npx knex seed:run --specific=002_admin.js
```

Logowanie: `POST /api/auth/login`, domyślnie `admin@example.com` / `Admin-demo-2026!`. W Swagger kliknij **Authorize** i wklej `accessToken`. Budynki i sale dodaje ADMIN; użytkowników rejestruje `POST /api/auth/register`.

Pełne dane demonstracyjne można utworzyć przez `docker compose exec api npx knex seed:run`. **Ten pełny seed usuwa dotychczasowe dane biznesowe**. Nie jest wymagany do uruchomienia API.

```sh
docker compose ps
docker compose logs api
docker compose down
```

Named volume zachowuje bazę po `down`. SIGTERM zamyka HTTP, czeka na listenery i zamyka pulę bazy; zakończenie jest widoczne w logach. Host bazy wewnątrz kontenera to `db`, lokalnie `localhost`. Opcjonalne `DB_PORT` i `PORT` zmieniają porty hosta.

## Testy

Lokalnie wymagany jest Node.js 22+ oraz działający PostgreSQL (np. usługa `db` z Compose).

```sh
npm ci
npm run test:unit
npm run test:integration
npm test
node scripts/check-overlap-mutation.js
```

Unit: 22 testy, świeże fake repositories, stały zegar, bez połączeń z bazą. Integracja: 10 testów Supertest przekazujących `createApp()` bez ręcznego `listen()`. Każdy test ma reset danych, a schemat powstaje z migracji w `beforeAll`.

`tests/setupEnv.js` ustawia konfigurację przed załadowaniem `.env`. Domyślnie połączenie korzysta z lokalnego konta demonstracyjnego. Własne dane ustaw przez `TEST_DATABASE_URL`, np. w PowerShell `$env:TEST_DATABASE_URL='postgres://user:password@localhost:5432/room_booking_test'`.

Zestaw 05 łączy się administracyjnie z bazą systemową `postgres`, tworzy unikalną bazę `room_booking_test05_*`, migruje i czyści wyłącznie ją, a na końcu usuwa ją i zamyka pule. Baza wskazana w URL nie musi jeszcze istnieć. Konto testowe potrzebuje prawa CREATEDB. Nigdy nie czyści bazy developerskiej. `npm run test:legacy` zachowuje testy zestawów 03/04.

Skrypt mutacyjny tymczasowo zmienia `<` na `<=`, oczekuje porażki testów stykających się przedziałów i odtwarza poprawny kod w `finally`.

## Eventy i audit log

`reservation.created`: `{ reservationId, roomId, userId, startTime, endTime }`.
`reservation.cancelled`: `{ reservationId, roomId, userId, cancelledBy }`.

Service publikuje po zakończeniu transakcji. Nieudana operacja i ponowne anulowanie nie publikują. Blokada sali serializuje tworzenie i anulowanie. EventEmitter uruchamia listenery przez Promise i przechwytuje ich błędy. Audit zapisuje JSONB; osobny listener wypisuje `[notification] to: <email>` po anulowaniu cudzej rezerwacji przez ADMIN-a.

`GET /api/admin/audit-log?page=1&limit=20&eventType=reservation.cancelled` wymaga ADMIN-a. Sortowanie: `created_at DESC, id DESC`; odpowiedź zawiera `data` i `meta`.

Event bus działa w pamięci: awaria procesu po COMMIT może zgubić event. W systemie wymagającym trwałych zdarzeń potrzebny jest transactional outbox. Test izolacji błędów wstrzykuje uszkodzony listener tylko na czas testu.

## CI i sprawozdanie

Workflow `.github/workflows/ci.yml`: push do main i każdy PR, PostgreSQL z healthcheck, checkout, Node 22 z cache npm, `npm ci`, `npm test`, `docker build .`. Jednorazowa baza runnera używa lokalnego uwierzytelniania trust; workflow nie zawiera haseł ani tokenów.

Repozytorium: https://github.com/JelouFelou/ZTPAI_Lab

Dowód CI: [PR #1](https://github.com/JelouFelou/ZTPAI_Lab/pull/1), [czerwone uruchomienie](https://github.com/JelouFelou/ZTPAI_Lab/actions/runs/43617435186), [zielone uruchomienie](https://github.com/JelouFelou/ZTPAI_Lab/actions/runs/43617636286). PR został scalony po naprawie.

Sprawozdania PDF, materiały zajęć, zrzuty ekranu, archiwum i pomocnicze narzędzia sprawozdania są przechowywane lokalnie, poza śledzonymi plikami repozytorium. Repozytorium zawiera kod aplikacji, testy, konfigurację uruchomienia, CI i instrukcję README.
