// Optional Windows report tooling: npm.cmd install --prefix .tools playwright-core
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const knex = require("knex");
const { chromium } = require("../.tools/node_modules/playwright-core");
const dbConfig = require("../knexfile");
const { config } = require("../src/config");
const { createApp } = require("../src/app");
const { createKnexUnitOfWork } = require("../src/db/unitOfWork");
const evidence = JSON.parse(fs.readFileSync("reports/generated/zad4/evidence.json", "utf8"));
const directory = "reports/generated/zad4";
const screenshots = "screenshots/zad4";
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const code = value => `<pre>${escape(value)}</pre>`;
const json = value => code(JSON.stringify(value, null, 2));
const source = file => `<p class="file">${escape(file)}</p>${code(fs.readFileSync(file, "utf8"))}`;
const image = file => `<img src="data:image/png;base64,${fs.readFileSync(`${screenshots}/${file}`).toString("base64")}">`;
const section = (title, content) => `<section><h2>${title}</h2>${content}</section>`;
const result = label => evidence.requests.find(item => item.label === label);
let browser, server, db, admin;
const databaseName = `room_booking_report04_${Date.now()}`;
async function main() {
    fs.mkdirSync(directory, { recursive: true });
    fs.mkdirSync(screenshots, { recursive: true });
    admin = knex(dbConfig);
    await admin.raw("CREATE DATABASE ??", [databaseName]);
    const url = new URL(dbConfig.connection);
    url.pathname = `/${databaseName}`;
    db = knex({ ...dbConfig, connection: url.toString() });
    await db.migrate.latest();
    await db.seed.run();
    server = http.createServer(createApp({ ...createKnexUnitOfWork(db), config }));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
    const loginResponse = await fetch(baseUrl + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: config.SEED_ADMIN_EMAIL, password: config.SEED_ADMIN_PASSWORD }) });
    assert.equal(loginResponse.status, 200);
    const { accessToken } = await loginResponse.json();
    await page.goto(baseUrl + "/api/docs/");
    await page.locator(".opblock").first().waitFor();
    await page.screenshot({ path: `${screenshots}/01-swagger-list.png`, fullPage: true });
    await page.getByRole("button", { name: "Authorize", exact: true }).first().click();
    await page.locator(".dialog-ux input").fill(accessToken);
    await page.locator(".dialog-ux button.authorize").click();
    await page.locator(".dialog-ux .btn-done").click();
    const meOperation = page.locator(".opblock").filter({ has: page.locator('.opblock-summary-path[data-path="/api/auth/me"]') });
    await meOperation.locator(".opblock-summary").click();
    await meOperation.getByRole("button", { name: "Try it out", exact: true }).click();
    const requestPromise = page.waitForResponse(response => response.url() === baseUrl + "/api/auth/me");
    await meOperation.getByRole("button", { name: "Execute", exact: true }).click();
    const meResponse = await requestPromise;
    assert.equal(meResponse.status(), 200);
    assert.equal(meResponse.request().headers().authorization, `Bearer ${accessToken}`);
    const me = await meResponse.json();
    assert.equal(me.role, "ADMIN");
    await meOperation.locator(".responses-inner .highlight-code").first().waitFor();
    // Swagger's curl example includes the live Authorization header. Mask only
    // that ephemeral token in the screenshot; retain the actual HTTP 200 response.
    await page.evaluate(token => {
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) {
            if (walk.currentNode.textContent.includes(token)) walk.currentNode.textContent = walk.currentNode.textContent.replaceAll(token, "[JWT omitted]");
        }
    }, accessToken);
    // Keep the live server response readable in the PDF; hide the static
    // example/error tables below it, which are documented in the specification.
    await meOperation.locator("table.responses-table:not(.live-responses-table)").evaluateAll(tables => {
        for (const table of tables) table.style.display = "none";
    });
    await meOperation.screenshot({ path: `${screenshots}/02-swagger-authorized-me.png` });
    fs.writeFileSync(`${directory}/swagger-proof.json`, JSON.stringify({ path: "/api/auth/me", status: meResponse.status(), bearerHeaderSent: true, body: me }, null, 2));
    async function screenshotLog(title, data, filename) {
        await page.setContent(`<html lang="pl"><meta charset="utf-8"><style>body{margin:0;background:#f3f6fa;color:#193247;padding:28px;font:18px Arial}h1{font-size:24px;color:#125f76}pre{font:17px/1.45 Consolas;white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(title)}</h1>${json(data)}</html>`);
        await page.screenshot({ path: `${screenshots}/${filename}`, fullPage: true });
    }
    await screenshotLog("Rejestracja — rzeczywisty log HTTP z testów PostgreSQL", evidence.requests.find(item => item.path === "/api/auth/register" && item.status === 201), "03-register.png");
    await screenshotLog("Próba rejestracji jako ADMIN — HTTP 400", result("Próba nadania roli ADMIN"), "04-role-rejected.png");
    await screenshotLog("Wygasły JWT — HTTP 401 po rzeczywistym oczekiwaniu 10s", result("Rzeczywiście wygasły token po JWT_EXPIRES_IN=10s"), "05-expired.png");
    await screenshotLog("Konfiguracja — proces odmówił startu", evidence.configuration.map(entry => ({ overrides: entry.overrides, exitCode: entry.exitCode, log: entry.log.split(/\r?\n/).filter(line => /Invalid configuration|^- /.test(line)).join("\n") })), "06-invalid-config.png");
    const sections = [];
    sections.push(section("1. Rejestracja i bezpieczne hasła", `<p>Dodano POST /api/auth/register. Email jest trimowany, walidowany i normalizowany do małych liter. Hasło ma 10–72 znaki i mieści się w limicie 72 bajtów UTF-8 bcrypt; nadmiarowe bajty nie są po cichu obcinane. Hash ma cost factor co najmniej 10. Odpowiedź wybiera jawnie id, email, role i createdAt.</p>${source("src/modules/auth/auth.schemas.js")}${image("03-register.png")}`));
    sections.push(section("1.1. Migracja users i zapisany hash", `${source("src/db/migrations/003_users.js")}<p>Rzeczywisty wiersz z osobnej bazy testowej. Hasło demonstracyjne zostało zweryfikowane przez bcrypt.compare; w tabeli nie zapisano jego jawnej ani odwracalnej postaci.</p>${json(evidence.userRow)}<p>ADMIN jest tworzony przez seed. Rejestracja przez API zawsze zapisuje USER, niezależnie od zawartości inputu service.</p>${source("src/db/seeds/002_admin.js")}`));
    sections.push(section("1.2. Walidacja i równoległe rejestracje", `${image("04-role-rejected.png")}${json(result("Zbyt krótkie hasło"))}${json(result("Duplikat różniący się wielkością liter"))}<p>10 równoległych rejestracji tego samego emaila (różna wielkość liter):</p>${json({ statuses: evidence.registrationRace, created: evidence.registrationRace.filter(code => code === 201).length, emailTaken: evidence.registrationRace.filter(code => code === 409).length })}<p>Ostateczną gwarancją jest UNIQUE w PostgreSQL. Kod 23505 dla users_email_unique jest mapowany na 409 EMAIL_TAKEN, bez szczegółów bazy i bez 500.</p>`));
    sections.push(section("2. Logowanie i JWT", `${source("src/modules/auth/auth.service.js")}<p>Podpis i weryfikacja używają wyłącznie HS256. JWT ma sub jako string, role, iat i exp. Brak emaila, hasha i innych danych osobowych. JWT_EXPIRES_IN domyślnie wynosi 15m. Konto nieistniejące przechodzi porównanie z hashem zastępczym, aby ograniczyć różnice czasowe.</p><h3>Zdekodowany nagłówek i payload rzeczywistego tokenu</h3>${json(evidence.token)}`));
    sections.push(section("2.1. Identyczne błędy logowania", `<p>Nieistniejący poprawny składniowo email i błędne hasło istniejącego konta dają ten sam status 401, code INVALID_CREDENTIALS i message. requestId pozostaje unikalne dla każdego żądania, zgodnie z globalnym formatem błędów.</p>${json(evidence.invalidLogin)}`));
    sections.push(section("3. Authenticate i przypadki 401", `${source("src/middleware/authenticate.js")}<p>Middleware ustawia req.user = { id, role }. Wszystkie ścieżki poza rejestracją, logowaniem i dokumentacją wymagają tokenu. Walidowane są podpis, algorytm i obowiązkowe claims.</p>${code(evidence.requests.filter(item => item.label && ["Brak Authorization", "Zły schemat Basic", "Bearer bez tokenu", "Zmieniony podpis", "Zmieniony payload z rolą ADMIN, oryginalny podpis", "Algorytm HS384", "Algorytm none", "Rzeczywiście wygasły token po JWT_EXPIRES_IN=10s"].includes(item.label)).map(item => `${item.label}\n${item.method} ${item.path} -> ${item.status}\n${JSON.stringify(item.response)}`).join("\n\n"))}`));
    sections.push(section("3.1. Rzeczywiste wygaśnięcie tokenu", `<p>Uruchomiono osobną instancję aplikacji z JWT_EXPIRES_IN=10s. Login zwrócił token z exp−iat=10, przed wygaśnięciem /me zwróciło 200. Test poczekał do upływu terminu i wykonał to samo żądanie ponownie: 401 TOKEN_EXPIRED z komunikatem Token expired.</p>${image("05-expired.png")}`));
    sections.push(section("3.2. Migracja istniejących rezerwacji", `${source("src/db/migrations/004_reservations_user.js")}<p>Stare reserved_by jest tekstem i nie identyfikuje zweryfikowanego konta. Zamiast przypisywać cudze dane nowo rejestrującemu się użytkownikowi, migracja tworzy konto archiwalne USER z losowym, odrzuconym hasłem i adresem migration.invalid. Zachowuje ID, sale, daty i statusy rezerwacji. ADMIN nadal ma dostęp do historii. Rollback odtwarza reserved_by z emaila przypisanego konta, ponieważ stare dowolne etykiety nie należą już do nowego modelu.</p>${json(evidence.migration)}`));
    const service = fs.readFileSync("src/modules/reservations/reservations.service.js", "utf8");
    sections.push(section("4. Role i ownership w service", `${source("src/middleware/authorize.js")}<p>Wszystkie POST, PATCH i DELETE budynków i sal wymagają ADMIN. GET-y są dostępne dla zalogowanych użytkowników. Własność rezerwacji sprawdza service na podstawie parametru currentUser, przed sprawdzeniem statusu rezerwacji. Cudze ID daje 404 zarówno w GET, jak i cancel.</p>${code(service.slice(service.indexOf("    function assertOwnership"), service.indexOf("    async function cancelReservation")))}${code(service.slice(service.indexOf("    async function listReservations"), service.indexOf("    return { createReservation")))}<p>Filtr userId dla USER daje 403, nawet jeśli wskazuje jego własne konto. Wybrano jawną odmowę, żeby klient wiedział, że użył parametru administracyjnego. Backend zawsze dodaje userId aktualnego USER-a do zapytania. ADMIN ma dostęp do wszystkich rekordów i opcjonalnego filtra userId. POST przypisuje właściciela wyłącznie z tokenu, odrzucając userId i reservedBy w body.</p>`));
    sections.push(section("4.1. Tabela uprawnień — rzeczywiste odpowiedzi", `<p>Fixture: właściciel USER ma ID 2, obcy USER ID 3, ADMIN ID 1. Rezerwacja ID 1 należy do USER-a 2. Przy tworzeniu rezerwacji każda rola używa wolnego terminu, aby nie mylić autoryzacji z konfliktem terminów. Każdą komórkę tabeli potwierdza oddzielny zapis w test_04.results.http.</p><table><tr><th>Endpoint</th><th>Brak tokenu</th><th>USER właściciel</th><th>USER obcy</th><th>ADMIN</th></tr>${evidence.matrix.map(row => `<tr><td>${escape(row.method + " " + row.path)}</td>${row.statuses.map(status => `<td>${status}</td>`).join("")}</tr>`).join("")}</table><p>Testy sprawdziły także ochronę przed podszyciem przez body, prywatność listy, filtrowanie i paginację ADMIN-a. Reguły pojemności, kolizji i zakaz anulowania rozpoczętej rezerwacji obowiązują również ADMIN-a.</p>`));
    sections.push(section("4.2. Dowody dla tabeli uprawnień", `<p>Rzeczywiste logi HTTP; pełne body odpowiedzi znajduje się w test_04.results.http.</p>${code(evidence.requests.filter(item => item.label?.startsWith("Macierz:")).map(item => `${item.label}\n${item.method} ${item.path} -> HTTP ${item.status}`).join("\n\n"))}`));
    sections.push(section("5. Walidowana konfiguracja", `${source("src/config/index.js")}<p>To jedyny moduł odczytujący process.env i plik .env. knexfile.js, server.js i skrypty korzystają z eksportu config. Błędy wymieniają nazwy pól i wymagania; nie wypisują wartości sekretów. JWT_SECRET ma co najmniej 32 znaki, a DATABASE_URL musi być adresem PostgreSQL.</p>`));
    sections.push(section("5.1. Odmowa startu przy błędnej konfiguracji", `${image("06-invalid-config.png")}<p>Wszystkie trzy procesy zakończyły się kodem różnym od zera i nie uruchomiły serwera HTTP. Test sprawdził również, że komunikat nie zawiera rzeczywistego JWT_SECRET.</p><h3>Sekrety i historia Git</h3><p>.env jest ignorowany, .env.example zawiera jawnie przykładowe wartości. Lokalny JWT_SECRET został wygenerowany kryptograficznie i nie znajduje się w raporcie ani w plikach źródłowych.</p>${code("git log -p --all | grep -iE \"JWT_SECRET=|password=\"")}${json(evidence.gitHistory)}<p>Ten katalog nie jest repozytorium Git. Nie ma lokalnej historii do przeskanowania i nie można na tej podstawie potwierdzić historii ewentualnego zdalnego repozytorium. Jest to jawne ograniczenie weryfikacji; nie przedstawiono nieistniejącego skanu jako zakończonego sukcesem. Przed oddaniem linku do GitHub należy uruchomić powyższe polecenie w odpowiednim repozytorium.</p>`));
    sections.push(section("5.2. Swagger UI — lista endpointów", `<p>/api/docs jest publiczne. Specyfikacja OpenAPI 3.0 dokumentuje 20 operacji, schematy body, parametry ścieżek i query, odpowiedzi sukcesu i błędów. W components/schemas/Error format błędu zdefiniowano raz; odpowiedzi korzystają z $ref. Globalne security używa bearerAuth, a operacje publiczne mają security: [].</p>${image("01-swagger-list.png")}`));
    sections.push(section("5.3. Swagger UI — Authorize i chroniony endpoint", `<p>W przeglądarce kliknięto Authorize, wpisano rzeczywisty accessToken ADMIN-a, następnie Try it out i Execute dla GET /api/auth/me. Przechwycono request z nagłówkiem Authorization: Bearer i odpowiedź 200. Poniższy zrzut przedstawia rzeczywisty Swagger UI; jedynie efemeryczny JWT w przykładzie curl został zamaskowany.</p>${image("02-swagger-authorized-me.png")}${json({ path: "/api/auth/me", status: 200, bearerHeaderSent: true, body: me })}`));
    const examples = [400, 401, 403, 404, 409].map(status => evidence.requests.find(item => item.status === status));
    sections.push(section("6. Przykłady błędów i wyniki weryfikacji", `${examples.map(item => `<h3>HTTP ${item.status}: ${escape(item.method + " " + item.path)}</h3>${json(item.response)}`).join("")}<p>Testy zestawu 03 przechodzą po uwierzytelnieniu requestów i zmianie modelu na user_id: migracje, seed, JOIN bez N+1, filtry, sortowanie, reguły czasowe i trzy warianty double booking. Testy zestawu 04 sprawdzają migrację na danych, rejestrację i wyścig emaili, JWT, realne wygaśnięcie, wszystkie role, ownership, konfigurację i dokumentację.</p><p>Pliki: test_04.http (scenariusze ręczne), test_04.results.http (pełne wyniki HTTP), tests/auth.integration.test.js, tests/integration.test.js, reports/generated/zad4/evidence.json, reports/generated/zad4/swagger-proof.json, screenshots/zad4/ oraz README.md.</p><p>Źródło wymagań: „Zadanie 04 — Room Booking API authentication, authorization i konfiguracja”, katalog pdf/. W katalogu nie dostarczono osobnego „Materiału 04”.</p>`));
    const html = `<!doctype html><html lang="pl"><meta charset="utf-8"><title>Zadanie 04 — Adrian Bober</title><style>@page{size:A4;margin:17mm 15mm}*{box-sizing:border-box}body{font:10.5pt/1.5 Arial;color:#193247;margin:0}h1{font-size:30pt;line-height:1.25}h2{font-size:18pt;color:#125f76;margin:0 0 14px}h3{font-size:12pt}section{break-before:page}pre{font:8pt/1.45 Consolas;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6fa;padding:10px;border:1px solid #dbe3e8}img{display:block;max-width:100%;max-height:225mm;object-fit:contain;margin:15px auto;break-inside:avoid}table{border-collapse:collapse;font-size:8.5pt;width:100%}th,td{border:1px solid #bacbd4;padding:7px;text-align:left}th{background:#edf5f7}.file{font:9pt Consolas;color:#125f76}.cover{padding-top:80px}.subtitle{font-size:16pt;color:#526a79}</style><body><div class="cover"><p>ZAAWANSOWANE TECHNOLOGIE PROGRAMOWANIA APLIKACJI INTERNETOWYCH</p><h1>Room Booking API<br>Authentication, authorization<br>i konfiguracja</h1><p class="subtitle">Zadanie 04 — sprawozdanie</p><p>Adrian Bober</p><p>29 października 2026</p><hr><p>Implementacja i wyniki z prawdziwego PostgreSQL 16.<br>Rejestracja, JWT, prywatne rezerwacje, role, konfiguracja i Swagger UI.</p></div>${sections.join("\n")}</body></html>`;
    fs.writeFileSync(`${directory}/sprawozdanie.html`, html);
    await page.goto(pathToFileURL(path.resolve(`${directory}/sprawozdanie.html`)).href);
    await page.pdf({ path: "ZTPAI_Adrian_Bober_4.pdf", format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>",
        footerTemplate: '<div style="font:9px Arial;width:100%;text-align:center;color:#667">ZTPAI · Adrian Bober · Zadanie 04 — <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    console.log("Created ZTPAI_Adrian_Bober_4.pdf; Swagger Authorize + GET /api/auth/me verified in Chrome.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.destroy();
    if (admin) { await admin.raw("DROP DATABASE IF EXISTS ?? WITH (FORCE)", [databaseName]); await admin.destroy(); }
});
