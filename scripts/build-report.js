// Optional report tooling: npm.cmd install --prefix .tools playwright-core
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { chromium } = require("../.tools/node_modules/playwright-core");
require("../knexfile");
const { childEnvironment } = require("../src/config");
const evidence = JSON.parse(fs.readFileSync("reports/generated/evidence.json", "utf8"));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const readLog = file => {
    const bytes = fs.readFileSync(file);
    return bytes[0] === 255 && bytes[1] === 254 ? bytes.toString("utf16le").slice(1) : bytes.toString("utf8");
};
const code = text => `<pre>${escape(text)}</pre>`;
const source = file => `<p class="file">${escape(file)}</p>${code(fs.readFileSync(file, "utf8"))}`;
const image = file => `<img src="data:image/png;base64,${fs.readFileSync(file).toString("base64")}">`;
const section = (title, body) => `<section><h2>${title}</h2>${body}</section>`;
const json = value => code(JSON.stringify(value, null, 2));
const shotDirectory = "screenshots/zad3";
let child;
let browser;
async function startServer() {
    child = spawn(process.execPath, ["src/server.js"], {
        env: childEnvironment({ PORT: "3103", REPOSITORY: "knex", DEBUG: "knex:query" }), windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => fs.appendFileSync("reports/generated/server-report.log", chunk));
    child.stderr.on("data", chunk => fs.appendFileSync("reports/generated/server-report.log", chunk));
    for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) throw new Error("Report server failed to start");
        try { if ((await fetch("http://127.0.0.1:3103/api/buildings")).ok) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Report server startup timeout");
}
async function stopServer() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const running = child;
    child = undefined;
    const stopped = new Promise(resolve => running.once("exit", resolve));
    running.kill();
    await stopped;
}
async function main() {
    fs.mkdirSync(shotDirectory, { recursive: true });
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 650 }, deviceScaleFactor: 1 });
    let persistence;
    if (!process.argv.includes("--reuse-screenshots")) {
    fs.writeFileSync("reports/generated/server-report.log", "");
    await startServer();
    async function screenshot(endpoint, file, label) {
        const response = await page.goto(`http://127.0.0.1:3103${endpoint}`);
        const body = await response.json();
        // Format the received JSON for legibility; retain the actual response values.
        await page.evaluate(({ body, endpoint, status, label }) => {
            document.body.replaceChildren();
            const header = document.createElement("header");
            header.textContent = `${label}\nGET ${endpoint}\nHTTP ${status} · localhost:3103`;
            const pre = document.createElement("pre");
            pre.textContent = JSON.stringify(body, null, 2);
            document.body.append(header, pre);
        }, { body, endpoint, status: response.status(), label });
        await page.addStyleTag({ content: "body{margin:0;padding:24px;background:#f4f7fa;color:#172b4d}header{white-space:pre-wrap;font:600 18px/1.5 Arial;border-bottom:2px solid #125f76;padding-bottom:16px}pre{font:18px/1.4 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}" });
        await page.screenshot({ path: `${shotDirectory}/${file}.png`, fullPage: true });
        return body;
    }
    await screenshot("/api/buildings", "01-buildings", "Budynki i liczba sal — LEFT JOIN + COUNT");
    await screenshot("/api/rooms/1", "02-room", "Sala wraz z budynkiem — JOIN");
    await screenshot("/api/reservations/1", "03-reservation", "Rezerwacja wraz z salą i budynkiem");
    await screenshot("/api/reservations?buildingId=1&limit=1&sort=-participants", "04-pagination", "Filtrowanie, sortowanie i paginacja w SQL");
    await screenshot("/api/buildings/999999/rooms", "05-not-found", "Nieistniejący budynek — JSON 404");
    await screenshot("/api/reservations?sort=name", "06-validation", "Sortowanie spoza whitelisty — JSON 400");
    const createResponse = await fetch("http://127.0.0.1:3103/api/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: 5, reservedBy: "Dowód restartu serwera", participants: 5,
            startTime: "2096-06-01T10:00:00Z", endTime: "2096-06-01T11:00:00Z" })
    });
    assert.equal(createResponse.status, 201, "Use a free demonstration interval before building the report");
    const created = await createResponse.json();
    const oldPid = child.pid;
    const before = await screenshot(`/api/reservations/${created.id}`, "07-before-restart", `Przed restartem procesu Node.js — PID ${oldPid}`);
    await stopServer();
    await startServer();
    const newPid = child.pid;
    const after = await screenshot(`/api/reservations/${created.id}`, "08-after-restart", `Po restarcie procesu Node.js — PID ${newPid}`);
    assert.deepEqual(after, before);
    assert.notEqual(newPid, oldPid);
    persistence = { oldPid, newPid, created, before, after };
    fs.writeFileSync("reports/generated/process-restart.json", JSON.stringify(persistence, null, 2));
    await stopServer();
    } else {
        persistence = JSON.parse(fs.readFileSync("reports/generated/process-restart.json", "utf8"));
    }
    const { oldPid, newPid } = persistence;

    const sections = [];
    sections.push(section("1. Baza danych, konfiguracja i migracje", `<p>Rozwinięto Room Booking API z zestawu 02. Stos: Node.js, Express 5, Zod, Knex 3, pg 8 i PostgreSQL 16. Dane połączenia są pobierane z DATABASE_URL. Plik .env jest ignorowany przez Git, a .env.example zawiera wyłącznie przykładowe dane lokalne.</p>${source("compose.yaml")}<p>Wolumen room-booking-data zachowuje dane. Schemat tworzą wyłącznie migracje. Oba klucze obce mają ON DELETE RESTRICT: budynku z salami i sali z rezerwacjami nie można usunąć. Chroni to historię rezerwacji przed przypadkowym skasowaniem.</p>${code(evidence.checks.join("\n"))}`));
    sections.push(section("1.1. Migracja podstawowego schematu", source("src/db/migrations/001_initial.js")));
    sections.push(section("1.2. Struktura tabeli i próby złamania constraints", `<p>Poniżej rzeczywisty wynik psql, w tym <code>\\d reservations</code>. Próby INSERT używają SAVEPOINT i ROLLBACK, dzięki czemu nie pozostawiają danych. Błędy są oczekiwanym wynikiem testu; SQLSTATE pokazuje, że regułę egzekwuje PostgreSQL.</p><p>Plik do odtworzenia: scripts/constraints.sql. Sprawdzono wszystkie wymagane UNIQUE, oba FK, CHECK pojemności, czasu, statusu oraz dodatkowo participants, PK, NOT NULL i usuwanie rodziców.</p>${code(readLog("reports/generated/constraints-psql.log"))}`));
    sections.push(section("2. Powtarzalny seed i repositories Knex", `<p>Seed odtwarza 2 budynki, 5 sal i 5 rezerwacji od ID 1. Zawiera status CANCELLED i historyczną rezerwację rozpoczętą w 2025 roku. Stałe created_at gwarantuje identyczne dane po kolejnych seedach. Daty przyszłych przykładów ustawiono na 2099 rok, aby przykłady nie przestały przechodzić z powodu upływu czasu.</p>${source("src/db/seeds/001_demo.js")}<p>Test uruchomił seed dwukrotnie i porównał wszystkie kolumny rezerwacji. Implementacje pamięciowe pozostały w projekcie; wybór jest w server.js. Services nie importują Knex i nie znają tabel ani kolumn.</p>`));
    sections.push(section("2.1. Porównanie logiki service przed i po zmianie", `<p>Przed zmianą createReservation kolejno pobierało salę, sprawdzało capacity i daty, pobierało aktywne rezerwacje, wykrywało nakładanie, a następnie zapisywało rezerwację. Po zmianie te same reguły działają wewnątrz runInTransaction, poprzedzone blokadą sali. Nie zmieniono reguł anulowania.</p>${source("src/modules/reservations/reservations.service.js")}<p>Dodano odczyt pojedynczej rezerwacji oraz obsługę metadanych listy. Rooms service otrzymał createRoom ze sprawdzeniem budynku. Pełniejsze porównanie: reports/service-comparison.md.</p>`));
    sections.push(section("2.2. Trwałość danych — przed restartem", `<p>Utworzono rezerwację przez POST (HTTP 201), następnie odczytano ją przez GET. Zatrzymano cały proces Node.js o PID ${oldPid}. Nie wykonywano ponownie seeda.</p>${image(`${shotDirectory}/07-before-restart.png`)}`));
    sections.push(section("2.3. Trwałość danych — po restarcie", `<p>Uruchomiono nowy proces Node.js o PID ${newPid}. GET zwrócił identyczną rezerwację, łącznie z ID i createdAt. Wynik porównania całego JSON: zgodny. Dane przetrwały restart serwera.</p>${image(`${shotDirectory}/08-after-restart.png`)}`));
    sections.push(section("3. Relacje i brak N+1", `<p>Lista budynków używa LEFT JOIN, GROUP BY i COUNT. Dzięki LEFT JOIN zachowuje również budynki bez sal, z roomsCount: 0. Endpoint sal budynku wykonuje dwa zapytania: istnienie budynku i listę sal. Nieistniejący budynek daje 404, istniejący bez sal zwraca [].</p>${image(`${shotDirectory}/01-buildings.png`)}${source("src/modules/buildings/buildings.repository.knex.js")}`));
    sections.push(section("3.1. Sala z osadzonym budynkiem", `${image(`${shotDirectory}/02-room.png`)}${source("src/modules/rooms/rooms.repository.knex.js")}`));
    sections.push(section("3.2. Rezerwacja z salą i budynkiem", `<p>Pojedynczy odczyt wykonuje jeden SELECT z dwoma JOIN-ami. Listowanie stosuje tę samą strukturę DTO. Mapowanie snake_case → camelCase odbywa się w repository. DTO nie ujawnia wewnętrznych pól.</p>${image(`${shotDirectory}/03-reservation.png`)}`));
    sections.push(section("3.3. Logi SQL dla 5 i 20 rezerwacji", `<p>Test integracyjny uruchomiono z DEBUG=knex:query. Dodatkowo zapisano zdarzenia query Knex osobno dla obu requestów. Każdy request wykonał dokładnie <strong>2 zapytania</strong>: COUNT i SELECT. Liczba nie zależy od rozmiaru listy.</p><h3>5 rezerwacji</h3>${code(evidence.queries.five.map(q => q.sql + "\nBindings: " + JSON.stringify(q.bindings)).join("\n\n"))}<h3>20 rezerwacji</h3>${code(evidence.queries.twenty.map(q => q.sql + "\nBindings: " + JSON.stringify(q.bindings)).join("\n\n"))}<p>Pełny log DEBUG: reports/generated/test-and-sql.log. Wyniki strukturalne: reports/generated/evidence.json.</p>`));
    sections.push(section("4. Paginacja, filtrowanie i sortowanie", `<p>Parametry są walidowane w Zod. Domyślnie page=1, limit=20 i sort=startTime. Dozwolone kolumny: startTime, createdAt, participants; minus oznacza kierunek malejący. Zawsze dodawane jest id ASC. Filtry, COUNT, ORDER BY, LIMIT i OFFSET wykonuje baza.</p><p>Przedziały są półotwarte: end_time &gt; from i start_time &lt; to. Rezerwacja 10:00–12:00 pasuje do przedziału 11:00–11:30. Podane jednocześnie from i to muszą spełniać from &lt; to.</p>${image(`${shotDirectory}/04-pagination.png`)}`));
    const combinations = evidence.endpoints.filter(item => item.path.startsWith("/api/reservations?") && item.status === 200).slice(0, 4);
    for (const [index, combination] of combinations.entries()) {
        sections.push(section(`4.${index + 1}. Kombinacja parametrów`, `<p><strong>GET ${escape(combination.path)}</strong></p><p>HTTP ${combination.status}; liczba pasujących rekordów: ${combination.body.meta.total}.</p>${json(combination.body.meta)}${code(combination.queries.map(q => q.sql + "\nBindings: " + JSON.stringify(q.bindings)).join("\n\n"))}`));
    }
    sections.push(section("4.5. Obsługa pustych wyników i błędów", `<p>page=99 zwraca 200 i data: []; total nadal uwzględnia filtry. Niepoprawne ID, limit, page, status, sort oraz odwrócony przedział dają 400. Błędy są obsługiwane przez jeden middleware, z requestId.</p>${image(`${shotDirectory}/05-not-found.png`)}${image(`${shotDirectory}/06-validation.png`)}`));
    sections.push(section("5. Double booking — demonstracja problemu i naprawy", `<p>scripts/double-booking.js wysyła 10 identycznych POST równolegle i następnie liczy aktywne nakładające się rezerwacje bezpośrednio w SQL. Test wykonano w osobnej bazie testowej; żadne zabezpieczenie nie było wyłączane w serwerze użytkownika.</p><table><tr><th>Wariant</th><th>HTTP 201</th><th>HTTP 409</th><th>CONFIRMED w SQL</th></tr>${[["Przed naprawą", evidence.races.before], ["Transakcja + blokada + constraint", evidence.races.fixed], ["Tylko constraint, bez sprawdzenia i blokady", evidence.races.constraintOnly]].map(([title, result]) => `<tr><td>${title}</td><td>${result.results.filter(r => r.status === 201).length}</td><td>${result.results.filter(r => r.status === 409).length}</td><td>${result.confirmed}</td></tr>`).join("")}</table>${Object.entries(evidence.races).map(([title, result]) => `<h3>${escape(title)}</h3>${json({ statuses: result.results.map(r => r.status), confirmed: result.confirmed })}`).join("")}<p>We wszystkich wariantach harness testowy wprowadzał 200 ms opóźnienia przed zapisem. Przed naprawą usunięto constraint w bazie testowej i pominięto blokadę. Po naprawie użyto rzeczywistej transakcji i FOR UPDATE. Trzeci wariant pomijał sprawdzenie kolizji oraz blokadę, pozostawiając wyłącznie bazę jako ochronę. Żaden request po naprawie nie zwrócił 500.</p><p>Opóźnienie istnieje wyłącznie w tests/integration.test.js. Końcowy kod aplikacji nie zawiera sztucznego opóźnienia.</p>`));
    sections.push(section("5.1. Transakcja i blokada sali", `<p>Blokowany jest wiersz sali, ponieważ reguła dotyczy danej sali, a ten wiersz istnieje również przed pierwszą rezerwacją. Blokada trwa do COMMIT lub ROLLBACK. Inny request dotyczący tej samej sali czeka, a po zwolnieniu blokady widzi zatwierdzoną rezerwację i otrzymuje konflikt. Zapytania w callbacku korzystają z trx, więc należą do tej samej transakcji.</p>${source("src/db/unitOfWork.js")}<p><strong>Dlaczego sama transakcja nie wystarcza?</strong> Przy domyślnym READ COMMITTED każde zapytanie widzi dane zatwierdzone przed jego rozpoczęciem. Dwie transakcje mogą odczytać brak kolizji, zanim którakolwiek zatwierdzi INSERT. Atomowość nie zapewnia szeregowego wykonania sprawdzenia i zapisu. FOR UPDATE serializuje operacje dla danej sali.</p>${source("src/db/migrations/002_reservations_no_overlap.js")}<p>Constraint bierze pod uwagę tylko CONFIRMED i zakres [), więc CANCELLED nie blokuje terminu, a 10:00–12:00 oraz 12:00–13:00 są dozwolone. Oba przypadki sprawdzono również bezpośrednimi INSERT w teście.</p>`));
    sections.push(section("5.2. Repository rezerwacji i mapowanie błędów", `${source("src/modules/reservations/reservations.repository.knex.js")}<p>Centralny error handler mapuje 23505 na 409 UNIQUE_VIOLATION, 23503 na 409 REFERENCE_CONFLICT, 23514 i 23502 na 400 CONSTRAINT_VIOLATION oraz 23P01 na 409 ROOM_ALREADY_BOOKED. Szczegóły PostgreSQL i nazwy tabel nie trafiają do odpowiedzi klienta.</p>${json(evidence.races.constraintOnly.results.find(item => item.status === 409).body)}`));
    sections.push(section("6. Walidacja i pliki rozwiązania", `<p>Wykonano 7 testów integracyjnych: 7 zaliczonych, 0 nieudanych. Testy używają prawdziwego PostgreSQL 16 z lokalnego kontenera. Wyniki obejmują migracje up/down, seed, relacje, filtry, błędy, restart aplikacji i trzy warianty współbieżności.</p><ul><li>test_03.http — ręczne scenariusze endpointów.</li><li>scripts/double-booking.js — równoległe requesty i COUNT w bazie.</li><li>scripts/constraints.sql — demonstracje constraints w psql.</li><li>tests/integration.test.js — odtwarzalne testy na osobnej bazie.</li><li>reports/generated/evidence.json — odpowiedzi HTTP i wygenerowane SQL.</li><li>reports/generated/test-and-sql.log — log DEBUG=knex:query.</li><li>reports/generated/constraints-psql.log — wynik psql.</li><li>reports/generated/process-restart.json — dowód restartu procesów.</li><li>screenshots/zad3/ — zrzuty rzeczywistych odpowiedzi API.</li><li>reports/service-comparison.md — porównanie services.</li><li>README.md — uruchomienie i odtworzenie weryfikacji.</li></ul><p>Materiały źródłowe: „Materiał 03 — PostgreSQL, migracje, relacje i transakcje” oraz „Zadanie 03 — Room Booking API PostgreSQL, relacje i współbieżność”, dostarczone w katalogu pdf/.</p>`));
    const html = `<!doctype html><html lang="pl"><meta charset="utf-8"><title>ZTPAI — Zadanie 03</title><style>
        @page{size:A4;margin:18mm 16mm 18mm}*{box-sizing:border-box}body{font:11pt/1.5 Arial;color:#172b3b;margin:0}h1{font-size:30pt;line-height:1.2}h2{font-size:19pt;color:#125f76;margin:0 0 15px}h3{font-size:12pt;margin-top:20px}p{margin:10px 0}section{break-before:page}pre{font:8pt/1.45 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5f8;border:1px solid #d8e1e7;padding:10px}img{display:block;max-width:100%;max-height:225mm;object-fit:contain;margin:18px auto;break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:10pt}th,td{padding:8px;border:1px solid #b8c8d2;text-align:left}th{background:#edf5f6}.file{font:9pt Consolas;color:#125f76;margin-bottom:0}.cover{padding-top:80px}.subtitle{font-size:16pt;color:#45606f}.tag{font-size:11pt;color:#125f76;letter-spacing:2px}
        </style><body><div class="cover"><p class="tag">ZAAWANSOWANE TECHNOLOGIE PROGRAMOWANIA APLIKACJI INTERNETOWYCH</p><h1>Room Booking API<br>PostgreSQL, relacje<br>i współbieżność</h1><p class="subtitle">Zadanie 03 — sprawozdanie</p><p>Adrian Bober</p><p>29 października 2026</p><hr><p>Implementacja zgodna z pięcioma częściami zestawu 03.<br>Dowody z uruchomienia na PostgreSQL 16 w Dockerze.</p></div>${sections.join("\n")}</body></html>`;
    fs.writeFileSync("reports/generated/sprawozdanie.html", html);
    await page.goto(require("node:url").pathToFileURL(path.resolve("reports/generated/sprawozdanie.html")).href);
    await page.pdf({ path: "ZTPAI_Adrian_Bober_3.pdf", format: "A4", printBackground: true, displayHeaderFooter: true,
        headerTemplate: "<span></span>", footerTemplate: '<div style="font:9px Arial;width:100%;text-align:center;color:#667">ZTPAI · Adrian Bober · Zadanie 03 — <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    console.log("Created ZTPAI_Adrian_Bober_3.pdf and screenshots/zad3/");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    await stopServer();
    if (browser) await browser.close();
});
